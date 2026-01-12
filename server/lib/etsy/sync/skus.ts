import { prisma } from '../../prisma';
import { etsyClient } from '../../etsyClient';
import { ThrottleManager } from '../safety';
import {
  logWorkflow,
  startLogSession,
  endLogSession,
} from '../debugLogger';
import { generateVariantSku } from '../skuGenerator';
import {
  findEtsyProductByIdentifiers,
  findEtsyProductByVariantName,
  findItemByEtsyProduct,
  findItemByVariantName,
  getEtsyVariantName,
} from '../matching';

export async function generateSkus() {
  try {
    const hampers = await prisma.hamper.findMany({
      where: {
        etsyListingId: { not: null },
        isActive: true,
        hasVariants: true,
      },
      include: {
        variants: {
          where: {
            isActive: true,
            etsySku: null,
          },
        },
      },
    });

    const existingSkus = new Set(
      (
        await prisma.hamperVariant.findMany({
          where: { etsySku: { not: null } },
          select: { etsySku: true },
        })
      ).map((v) => v.etsySku)
    );

    let generated = 0;
    const results: Array<{
      hamperName: string;
      variantName: string;
      sku: string;
    }> = [];

    for (const hamper of hampers) {
      for (const variant of hamper.variants) {
        const baseSku = generateVariantSku(
          hamper.name,
          variant.name,
          hamper.etsyListingId!
        );

        let sku = baseSku;
        let suffix = 2;
        while (existingSkus.has(sku)) {
          sku = `${baseSku}-${suffix}`;
          suffix++;
        }

        existingSkus.add(sku);

        await prisma.hamperVariant.update({
          where: { id: variant.id },
          data: { etsySku: sku },
        });

        results.push({
          hamperName: hamper.name,
          variantName: variant.name,
          sku,
        });
        generated++;
      }
    }

    return {
      success: true,
      generated,
      results,
    };
  } catch (error) {
    console.error('Error generating SKUs:', error);
    throw error;
  }
}

export async function getPendingSkus() {
  try {
    const hampers = await prisma.hamper.findMany({
      where: {
        etsyListingId: { not: null },
        isActive: true,
        hasVariants: true,
      },
      include: {
        variants: {
          where: { isActive: true },
        },
      },
    });

    const pendingSkus: Array<{
      hamperId: string;
      hamperName: string;
      etsyListingId: string;
      variantId: string;
      variantName: string;
      localSku: string;
      etsySku: string | null;
      etsyProductId: string | null;
      needsSync: boolean;
    }> = [];

    for (const hamper of hampers) {
      let etsyInventory = null;
      try {
        etsyInventory = await etsyClient.getListingInventory(
          parseInt(hamper.etsyListingId!)
        );
      } catch (err) {
        console.warn(
          `Failed to fetch Etsy inventory for ${hamper.etsyListingId}:`,
          err
        );
        continue;
      }

      for (const variant of hamper.variants) {
        if (!variant.etsySku) continue;

        const etsyProduct =
          findEtsyProductByIdentifiers(etsyInventory?.products ?? [], {
            etsySku: variant.etsySku,
            etsyProductId: variant.etsyProductId,
          }) ??
          findEtsyProductByVariantName(
            etsyInventory?.products ?? [],
            variant.name
          );

        const etsySku = etsyProduct?.sku || null;
        const needsSync = etsySku !== variant.etsySku;

        pendingSkus.push({
          hamperId: hamper.id,
          hamperName: hamper.name,
          etsyListingId: hamper.etsyListingId!,
          variantId: variant.id,
          variantName: variant.name,
          localSku: variant.etsySku,
          etsySku,
          etsyProductId: variant.etsyProductId,
          needsSync,
        });
      }
    }

    const needsSyncCount = pendingSkus.filter((s) => s.needsSync).length;

    return {
      skus: pendingSkus,
      needsSyncCount,
      totalVariants: pendingSkus.length,
    };
  } catch (error) {
    console.error('Error getting pending SKUs:', error);
    throw error;
  }
}

export async function pushSkus(listingIds?: string[]) {
  const sessionId = startLogSession('SKU_PUSH');
  try {
    const whereClause: {
      etsyListingId: { not: null; in?: string[] };
      isActive: true;
      hasVariants: true;
    } = {
      etsyListingId: { not: null },
      isActive: true,
      hasVariants: true,
    };
    if (listingIds && listingIds.length > 0) {
      whereClause.etsyListingId = { not: null, in: listingIds };
    }

    const hampers = await prisma.hamper.findMany({
      where: whereClause,
      include: {
        variants: {
          where: { isActive: true, etsySku: { not: null } },
        },
      },
    });

    logWorkflow('SKU_PUSH', `Found ${hampers.length} hampers to process`);

    const results: Array<{
      etsyListingId: string;
      hamperName: string;
      success: boolean;
      updated: number;
      skipped: number;
      error?: string;
    }> = [];

    const throttle = new ThrottleManager();

    for (const hamper of hampers) {
      if (!hamper.etsyListingId || hamper.variants.length === 0) continue;

      try {
        await throttle.waitForSlot();

        const listingId = parseInt(hamper.etsyListingId);

        const currentInventory = await etsyClient.getListingInventory(listingId);

        logWorkflow('SKU_PUSH', `Processing listing ${listingId}`, {
          hamperName: hamper.name,
          variantCount: hamper.variants.length,
          etsyProductCount: currentInventory.products.length,
        });

        let updated = 0;
        let skipped = 0;

        const updatedProducts = currentInventory.products.map((etsyProduct) => {
          const localVariant =
            findItemByEtsyProduct(hamper.variants, etsyProduct) ??
            findItemByVariantName(
              hamper.variants,
              getEtsyVariantName(etsyProduct)
            );

          const newSku = localVariant?.etsySku || etsyProduct.sku;
          const skuChanged = newSku !== etsyProduct.sku;

          if (skuChanged && localVariant) {
            updated++;
            logWorkflow('SKU_PUSH', `Updating SKU for product ${etsyProduct.product_id}`, {
              oldSku: etsyProduct.sku,
              newSku,
              variantName: localVariant.name,
            });
          } else {
            skipped++;
          }

          return {
            sku: newSku,
            property_values: etsyProduct.property_values.map((pv) => ({
              property_id: pv.property_id,
              property_name: pv.property_name,
              value_ids: pv.value_ids,
              values: pv.values,
            })),
            offerings: etsyProduct.offerings.map((o) => ({
              quantity: o.quantity,
              price: o.price.amount / o.price.divisor,
              is_enabled: o.is_enabled,
              readiness_state_id: o.readiness_state_id,
            })),
          };
        });

        if (updated > 0) {
          await etsyClient.updateListingInventory(
            listingId,
            updatedProducts,
            currentInventory
          );

          logWorkflow(
            'SKU_PUSH',
            `Successfully updated ${updated} SKUs for listing ${listingId}`
          );
        }

        results.push({
          etsyListingId: hamper.etsyListingId,
          hamperName: hamper.name,
          success: true,
          updated,
          skipped,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWorkflow('SKU_PUSH', `Error updating listing ${hamper.etsyListingId}`, {
          error: message,
        });
        results.push({
          etsyListingId: hamper.etsyListingId!,
          hamperName: hamper.name,
          success: false,
          updated: 0,
          skipped: 0,
          error: message,
        });
      }
    }

    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    const totalErrors = results.filter((r) => !r.success).length;

    endLogSession(sessionId, {
      totalUpdated,
      totalErrors,
      listings: results.length,
    });

    return {
      success: totalErrors === 0,
      totalUpdated,
      totalListings: results.length,
      errors: totalErrors,
      results,
    };
  } catch (error) {
    console.error('Error pushing SKUs to Etsy:', error);
    logWorkflow('SKU_PUSH', 'ERROR', { error: String(error) });
    endLogSession(sessionId, { success: false, error: String(error) });
    throw error;
  }
}
