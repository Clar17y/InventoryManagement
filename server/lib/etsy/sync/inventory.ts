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
import { findEtsyProductByIdentifiers, findEtsyProductByVariantName } from '../matching';
import {
  getListingInventoryCached,
  getListingInventoriesBatched,
  invalidateListingInventory,
} from '../inventoryCache';

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

  const throttle = new ThrottleManager();

  for (const [listingId, listingUpdates] of updatesByListing) {
    try {
      if (!dryRun) {
        await throttle.waitForSlot();
      }

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
