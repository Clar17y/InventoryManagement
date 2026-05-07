import { prisma } from '../../prisma';
import { etsyClient } from '../../etsyClient';
import {
  isDryRunEnabled,
  computeDiff,
  shouldSkipUpdate,
  buildInventoryUpdateProducts,
  groupUpdatesByListing,
} from '../safety';
import { findEtsyProductByIdentifiers, findEtsyProductByVariantName } from '../matching';
import {
  getListingInventoryCached,
  getListingInventoriesBatched,
  invalidateListingInventory,
} from '../inventoryCache';
import { calculateCanMake, HamperWithRelations } from '../reconciliation';

export type InventoryUpdate = {
  etsyListingId: string;
  etsySku: string | null;
  etsyProductId: string | null;
  quantity: number;
};

export async function getSyncComparison() {
  const hampers = await prisma.hamper.findMany({
    where: {
      etsyListingId: { not: null },
      isActive: true,
    },
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

  // Collect all listing IDs and fetch inventories in batch
  const listingIds = hampers
    .filter(h => h.etsyListingId)
    .map(h => parseInt(h.etsyListingId!));
  const inventoryMap = await getListingInventoriesBatched(listingIds);

  const comparisons = [];

  for (const hamper of hampers) {
    const etsyInventory = inventoryMap.get(parseInt(hamper.etsyListingId!)) ?? null;

    const variantComparisons = [];

    if (hamper.hasVariants && hamper.variants.length > 0) {
      for (const variant of hamper.variants) {
        const canMake = calculateCanMake(hamper as HamperWithRelations, variant.id);

        const indicativeQty = variant.indicativeQuantity ?? null;
        const effectiveQuantity = Math.max(canMake, indicativeQty ?? 0);
        const isIndicative = indicativeQty !== null && indicativeQty > canMake;

        let etsyQuantity = 0;
        let resolvedEtsyProductId: string | null = variant.etsyProductId;
        let resolvedEtsySku: string | null = variant.etsySku;

        if (etsyInventory) {
          const etsyProduct =
            findEtsyProductByIdentifiers(etsyInventory.products, {
              etsySku: variant.etsySku,
              etsyProductId: variant.etsyProductId,
            }) ??
            findEtsyProductByVariantName(etsyInventory.products, variant.name);

          if (etsyProduct && etsyProduct.offerings.length > 0) {
            etsyQuantity = etsyProduct.offerings[0].quantity;
            resolvedEtsyProductId ??= String(etsyProduct.product_id);
            if (!resolvedEtsySku) {
              resolvedEtsySku = etsyProduct.sku?.trim() ? etsyProduct.sku : null;
            }
          }
        }

        const difference = effectiveQuantity - etsyQuantity;
        const canIdentifyEtsyProduct =
          resolvedEtsyProductId !== null || resolvedEtsySku !== null;

        variantComparisons.push({
          etsySku: resolvedEtsySku,
          etsyProductId: resolvedEtsyProductId,
          variantId: variant.id,
          variantName: variant.name,
          etsyQuantity,
          inventoryQuantity: effectiveQuantity,
          indicativeQuantity: indicativeQty,
          isIndicative,
          difference,
          needsSync: difference !== 0 && canIdentifyEtsyProduct,
        });
      }
    } else {
      const canMake = calculateCanMake(hamper as HamperWithRelations);

      const indicativeQty = hamper.indicativeQuantity ?? null;
      const effectiveQuantity = Math.max(canMake, indicativeQty ?? 0);
      const isIndicative = indicativeQty !== null && indicativeQty > canMake;

      let etsyQuantity = 0;
      if (etsyInventory && etsyInventory.products.length > 0) {
        const firstProduct = etsyInventory.products[0];
        if (firstProduct.offerings.length > 0) {
          etsyQuantity = firstProduct.offerings[0].quantity;
        }
      }

      const difference = effectiveQuantity - etsyQuantity;

      variantComparisons.push({
        etsySku: null,
        etsyProductId: null,
        variantId: null,
        variantName: 'Default',
        etsyQuantity,
        inventoryQuantity: effectiveQuantity,
        indicativeQuantity: indicativeQty,
        isIndicative,
        difference,
        needsSync: difference !== 0,
      });
    }

    comparisons.push({
      etsyListingId: hamper.etsyListingId,
      title: hamper.name,
      hamperName: hamper.name,
      hamperId: hamper.id,
      variants: variantComparisons,
    });
  }

  return comparisons;
}

export async function pushSyncUpdates(
  updates: InventoryUpdate[],
  requestDryRun?: boolean
) {
  const dryRun = requestDryRun === true || isDryRunEnabled();
  const updatesByListing = groupUpdatesByListing(updates);

  const results: Array<{
    listingId: string;
    success: boolean;
    skipped: boolean;
    dryRun: boolean;
    changes?: Array<{ sku: string; currentQuantity: number; newQuantity: number }>;
    error?: string;
  }> = [];

  for (const [listingId, listingUpdates] of updatesByListing) {
    try {
      const currentInventory = await getListingInventoryCached(
        parseInt(listingId)
      );

      const updatedProducts = buildInventoryUpdateProducts(
        currentInventory,
        listingUpdates
      );

      const diff = computeDiff(currentInventory, updatedProducts);

      if (shouldSkipUpdate(currentInventory, updatedProducts)) {
        results.push({
          listingId,
          success: true,
          skipped: true,
          dryRun,
          changes: [],
        });
        continue;
      }

      if (dryRun) {
        results.push({
          listingId,
          success: true,
          skipped: false,
          dryRun: true,
          changes: diff.changes,
        });
      } else {
        await etsyClient.updateListingInventory(
          parseInt(listingId),
          updatedProducts,
          currentInventory
        );
        results.push({
          listingId,
          success: true,
          skipped: false,
          dryRun: false,
          changes: diff.changes,
        });

        // Invalidate cache so next read gets fresh data
        invalidateListingInventory(parseInt(listingId));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        listingId,
        success: false,
        skipped: false,
        dryRun,
        error: message,
      });
    }
  }

  const successCount = results.filter((r) => r.success && !r.skipped).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const errorCount = results.filter((r) => !r.success).length;

  return {
    success: errorCount === 0,
    dryRun,
    updated: successCount,
    skipped: skippedCount,
    errors: errorCount,
    results,
  };
}
