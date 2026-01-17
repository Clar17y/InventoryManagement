import { PrismaClient } from '@prisma/client';
import {
  IEtsyClient,
  EtsyListing,
  EtsyInventory,
  ReconciliationReport,
  ReconciliationNewListing,
  ReconciliationChangedSku,
  ReconciliationMissingSku,
  ReconciliationOrphanedHamper,
  ReconciliationQuantityDiff,
  ReconciliationSummary,
} from './types';
import { fetchAllActiveListings } from './pagination';
import { decodeHtmlEntities } from './utils';

// =============================================================================
// Pagination Helpers
// =============================================================================

/**
 * Fetch inventory for multiple listings, handling errors gracefully.
 */
async function fetchInventoryForListings(
  client: IEtsyClient,
  listingIds: number[]
): Promise<Map<number, EtsyInventory>> {
  const inventoryMap = new Map<number, EtsyInventory>();

  for (const listingId of listingIds) {
    try {
      const inventory = await client.getListingInventory(listingId);
      inventoryMap.set(listingId, inventory);
    } catch (error) {
      console.warn(`Failed to fetch inventory for listing ${listingId}:`, error);
    }
  }

  return inventoryMap;
}

// =============================================================================
// Can-Make Calculation (simplified version for reconciliation)
// =============================================================================

type DecimalLike = number | { toNumber(): number };

interface LotWithRemaining {
  remaining: DecimalLike;
}

interface HamperWithRelations {
  id: string;
  name: string;
  etsyListingId: string | null;
  hasVariants: boolean;
  variants: Array<{
    id: string;
    name: string;
    etsySku: string | null;
    mappings: Array<{
      categoryId: string;
      product: {
        lots: LotWithRemaining[];
      };
    }>;
  }>;
  requirements: Array<{
    categoryId: string;
    quantity: DecimalLike;
    isOptional: boolean;
    category: {
      products: Array<{
        lots: LotWithRemaining[];
      }>;
    };
  }>;
}

function toNumber(value: number | { toNumber(): number }): number {
  return typeof value === 'number' ? value : value.toNumber();
}

/**
 * Calculate how many of a hamper variant can be made from current inventory.
 */
function calculateCanMake(
  hamper: HamperWithRelations,
  variantId?: string
): number {
  let canMake = Infinity;

  const variant = variantId
    ? hamper.variants.find((v) => v.id === variantId)
    : undefined;
  const mappedByCategory = variant
    ? new Map(variant.mappings.map((m) => [m.categoryId, m]))
    : new Map();

  for (const requirement of hamper.requirements) {
    if (requirement.isOptional) continue;

    const qtyNeeded = toNumber(requirement.quantity);
    if (!qtyNeeded) continue;

    const mapping = mappedByCategory.get(requirement.categoryId);

    if (mapping) {
      // Use mapped product's stock only
      const productStock = mapping.product.lots.reduce(
        (sum: number, lot: LotWithRemaining) => sum + toNumber(lot.remaining),
        0
      );
      const canMakeFromProduct = Math.floor(productStock / qtyNeeded);
      canMake = Math.min(canMake, canMakeFromProduct);
    } else {
      // Fall back to category-wide aggregation
      const categoryStock = requirement.category.products.reduce(
        (sum: number, product: { lots: LotWithRemaining[] }) => {
          const productStock = product.lots.reduce(
            (lotSum: number, lot: LotWithRemaining) => lotSum + toNumber(lot.remaining),
            0
          );
          return sum + productStock;
        },
        0
      );
      const canMakeFromCategory = Math.floor(categoryStock / qtyNeeded);
      canMake = Math.min(canMake, canMakeFromCategory);
    }
  }

  return canMake === Infinity ? 0 : canMake;
}

// =============================================================================
// Reconciliation Report Generation
// =============================================================================

/**
 * Generate a reconciliation report comparing Etsy listings with local hampers.
 *
 * @param client - Etsy client (real or mock)
 * @param prisma - Prisma client for database access
 * @returns ReconciliationReport with all discrepancies
 */
export async function generateReconciliationReport(
  client: IEtsyClient,
  prisma: PrismaClient
): Promise<ReconciliationReport> {
  const newListings: ReconciliationNewListing[] = [];
  const changedSkus: ReconciliationChangedSku[] = [];
  const variantsMissingSku: ReconciliationMissingSku[] = [];
  const orphanedHampers: ReconciliationOrphanedHamper[] = [];
  const quantityDifferences: ReconciliationQuantityDiff[] = [];
  let errorCount = 0;

  // Fetch all Etsy listings
  let etsyListings: EtsyListing[] = [];
  try {
    etsyListings = await fetchAllActiveListings(client);
  } catch (error) {
    console.error('Failed to fetch Etsy listings:', error);
    errorCount++;
  }

  // Build set of Etsy listing IDs for quick lookup
  const etsyListingIds = new Set(etsyListings.map((l) => String(l.listing_id)));

  // Fetch inventory for all listings
  const inventoryMap = await fetchInventoryForListings(
    client,
    etsyListings.map((l) => l.listing_id)
  );

  // Fetch all local hampers with Etsy mappings
  const hampers = await prisma.hamper.findMany({
    where: { isActive: true },
    include: {
      variants: {
        where: { isActive: true },
        include: {
          mappings: {
            include: {
              product: {
                include: {
                  lots: {
                    where: { remaining: { gt: 0 } },
                  },
                },
              },
            },
          },
        },
      },
      requirements: {
        include: {
          category: {
            include: {
              products: {
                where: { isActive: true },
                include: {
                  lots: {
                    where: { remaining: { gt: 0 } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Build map of local hampers by Etsy listing ID
  const hampersByEtsyId = new Map<string, (typeof hampers)[0]>();
  for (const hamper of hampers) {
    if (hamper.etsyListingId) {
      hampersByEtsyId.set(hamper.etsyListingId, hamper);
    }
  }

  // Check for new listings (on Etsy but not in local DB)
  for (const listing of etsyListings) {
    const listingIdStr = String(listing.listing_id);
    if (!hampersByEtsyId.has(listingIdStr)) {
      const inventory = inventoryMap.get(listing.listing_id);
      newListings.push({
        listingId: listing.listing_id,
        title: decodeHtmlEntities(listing.title),
        state: listing.state,
        variantCount: inventory?.products.length ?? 0,
      });
    }
  }

  // Check for orphaned hampers (in local DB but not on Etsy)
  for (const hamper of hampers) {
    if (hamper.etsyListingId && !etsyListingIds.has(hamper.etsyListingId)) {
      orphanedHampers.push({
        hamperId: hamper.id,
        hamperName: hamper.name,
        etsyListingId: hamper.etsyListingId,
      });
    }
  }

  // Check variants for SKU issues and quantity differences
  for (const hamper of hampers) {
    if (!hamper.etsyListingId) continue;

    const listingId = parseInt(hamper.etsyListingId, 10);
    const inventory = inventoryMap.get(listingId);

    if (hamper.hasVariants && hamper.variants.length > 0) {
      for (const variant of hamper.variants) {
        // Check for missing SKU
        if (!variant.etsySku) {
          variantsMissingSku.push({
            hamperId: hamper.id,
            hamperName: hamper.name,
            variantId: variant.id,
            variantName: variant.name,
          });
          continue;
        }

        // Find corresponding Etsy product
        const etsyProduct = inventory?.products.find(
          (p) => p.sku === variant.etsySku
        );

        if (!etsyProduct && inventory) {
          // SKU exists locally but not on Etsy - might have changed
          const possibleMatch = inventory.products.find(
            (p) =>
              p.property_values.some((pv) =>
                pv.values.some((v) =>
                  v.toLowerCase().includes(variant.name.toLowerCase())
                )
              )
          );

          if (possibleMatch && possibleMatch.sku !== variant.etsySku) {
            changedSkus.push({
              hamperId: hamper.id,
              hamperName: hamper.name,
              variantId: variant.id,
              variantName: variant.name,
              localSku: variant.etsySku,
              etsySku: possibleMatch.sku,
            });
          }
        }

        // Check quantity difference
        if (etsyProduct) {
          const etsyQty = etsyProduct.offerings[0]?.quantity ?? 0;
          const canMake = calculateCanMake(hamper as HamperWithRelations, variant.id);

          if (etsyQty !== canMake) {
            quantityDifferences.push({
              etsyListingId: hamper.etsyListingId,
              hamperId: hamper.id,
              hamperName: hamper.name,
              etsySku: variant.etsySku,
              variantName: variant.name,
              etsyQuantity: etsyQty,
              computedCanMake: canMake,
              difference: canMake - etsyQty,
            });
          }
        }
      }
    } else {
      // Non-variant hamper
      if (inventory && inventory.products.length > 0) {
        const firstProduct = inventory.products[0];
        const etsyQty = firstProduct.offerings[0]?.quantity ?? 0;
        const canMake = calculateCanMake(hamper as HamperWithRelations);

        if (etsyQty !== canMake) {
          quantityDifferences.push({
            etsyListingId: hamper.etsyListingId,
            hamperId: hamper.id,
            hamperName: hamper.name,
            etsySku: firstProduct.sku || null,
            variantName: 'Default',
            etsyQuantity: etsyQty,
            computedCanMake: canMake,
            difference: canMake - etsyQty,
          });
        }
      }
    }
  }

  // Build summary
  const mappedHampers = hampers.filter((h) => h.etsyListingId).length;
  const summary: ReconciliationSummary = {
    totalListings: etsyListings.length,
    mappedHampers,
    unmappedListings: newListings.length,
    syncNeeded: quantityDifferences.length,
    errors: errorCount,
  };

  return {
    generatedAt: new Date().toISOString(),
    newListings,
    changedSkus,
    variantsMissingSku,
    orphanedHampers,
    quantityDifferences,
    summary,
  };
}
