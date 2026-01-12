import { prisma } from '../../prisma';
import { etsyClient } from '../../etsyClient';
import {
  isDryRunEnabled,
  computeDiff,
  shouldSkipUpdate,
  ThrottleManager,
  buildInventoryUpdateProducts,
  groupUpdatesByListing,
} from '../safety';
import { findEtsyProductByIdentifiers } from '../matching';

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

  const comparisons = [];

  for (const hamper of hampers) {
    let etsyInventory = null;
    try {
      etsyInventory = await etsyClient.getListingInventory(
        parseInt(hamper.etsyListingId!)
      );
    } catch (err) {
      console.warn(`Failed to fetch Etsy inventory for ${hamper.etsyListingId}:`, err);
    }

    const variantComparisons = [];

    if (hamper.hasVariants && hamper.variants.length > 0) {
      for (const variant of hamper.variants) {
        if (!variant.etsyProductId && !variant.etsySku) continue;

        let canMake = Infinity;

        const mappedByCategory = new Map(variant.mappings.map((m) => [m.categoryId, m]));

        for (const requirement of hamper.requirements) {
          if (requirement.isOptional) continue;

          const qtyNeeded = Number(requirement.quantity);
          if (!qtyNeeded) continue;

          const mapping = mappedByCategory.get(requirement.categoryId);

          if (mapping) {
            const productStock = mapping.product.lots.reduce(
              (sum, lot) => sum + Number(lot.remaining),
              0
            );
            const canMakeFromProduct = Math.floor(productStock / qtyNeeded);
            canMake = Math.min(canMake, canMakeFromProduct);
          } else {
            const categoryStock = requirement.category.products.reduce(
              (sum, product) => {
                const productStock = product.lots.reduce(
                  (lotSum, lot) => lotSum + Number(lot.remaining),
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

        if (canMake === Infinity) canMake = 0;

        let etsyQuantity = 0;
        if (etsyInventory && (variant.etsyProductId || variant.etsySku)) {
          const etsyProduct = findEtsyProductByIdentifiers(etsyInventory.products, {
            etsySku: variant.etsySku,
            etsyProductId: variant.etsyProductId,
          });
          if (etsyProduct && etsyProduct.offerings.length > 0) {
            etsyQuantity = etsyProduct.offerings[0].quantity;
          }
        }

        const difference = canMake - etsyQuantity;

        variantComparisons.push({
          etsySku: variant.etsySku,
          etsyProductId: variant.etsyProductId,
          variantId: variant.id,
          variantName: variant.name,
          etsyQuantity,
          inventoryQuantity: canMake,
          difference,
          needsSync: difference !== 0,
        });
      }
    } else {
      let canMake = Infinity;

      for (const requirement of hamper.requirements) {
        if (requirement.isOptional) continue;

        const categoryStock = requirement.category.products.reduce(
          (sum, product) => {
            const productStock = product.lots.reduce(
              (lotSum, lot) => lotSum + Number(lot.remaining),
              0
            );
            return sum + productStock;
          },
          0
        );

        const qtyNeeded = Number(requirement.quantity);
        const canMakeFromCategory = Math.floor(categoryStock / qtyNeeded);
        canMake = Math.min(canMake, canMakeFromCategory);
      }

      if (canMake === Infinity) canMake = 0;

      let etsyQuantity = 0;
      if (etsyInventory && etsyInventory.products.length > 0) {
        const firstProduct = etsyInventory.products[0];
        if (firstProduct.offerings.length > 0) {
          etsyQuantity = firstProduct.offerings[0].quantity;
        }
      }

      const difference = canMake - etsyQuantity;

      variantComparisons.push({
        etsySku: null,
        variantId: null,
        variantName: 'Default',
        etsyQuantity,
        inventoryQuantity: canMake,
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

  const throttle = new ThrottleManager();

  for (const [listingId, listingUpdates] of updatesByListing) {
    try {
      if (!dryRun) {
        await throttle.waitForSlot();
      }

      const currentInventory = await etsyClient.getListingInventory(
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
