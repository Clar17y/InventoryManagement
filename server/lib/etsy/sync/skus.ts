import { prisma } from '../../prisma';
import { etsyClient } from '../../etsyClient';
import { ThrottleManager } from '../safety';
import {
  logWorkflow,
  startLogSession,
  endLogSession,
} from '../debugLogger';
import { generateHamperSku, generateVariantSku } from '../skuGenerator';
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
      },
      include: {
        variants: { where: { isActive: true } },
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
      const treatAsVariantListing = hamper.hasVariants || hamper.variants.length > 1;

      if (treatAsVariantListing) {
        for (const variant of hamper.variants) {
          if (!variant.isActive || variant.etsySku) continue;

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
        continue;
      }

      // Non-variant listing: store SKU on a single "Default" hamperVariant.
      let defaultVariant = hamper.variants.find((v) => v.name === 'Default') ??
        (hamper.variants.length === 1 ? hamper.variants[0] : undefined);

      if (!defaultVariant) {
        defaultVariant = await prisma.hamperVariant.create({
          data: {
            hamperId: hamper.id,
            name: 'Default',
            sellingPrice: null,
            etsySku: null,
            etsyProductId: null,
            isActive: true,
          },
        });
      }

      if (defaultVariant.etsySku) continue;

      const baseSku = generateHamperSku(hamper.name, hamper.etsyListingId!);

      let sku = baseSku;
      let suffix = 2;
      while (existingSkus.has(sku)) {
        sku = `${baseSku}-${suffix}`;
        suffix++;
      }

      existingSkus.add(sku);

      await prisma.hamperVariant.update({
        where: { id: defaultVariant.id },
        data: { etsySku: sku },
      });

      results.push({
        hamperName: hamper.name,
        variantName: defaultVariant.name,
        sku,
      });
      generated++;
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

      const products = etsyInventory?.products ?? [];
      if (products.length === 0) continue;

      if (products.length === 1) {
        const product = products[0];

        const defaultVariant =
          hamper.variants.find((v) => v.name === 'Default') ??
          (hamper.variants.length === 1 ? hamper.variants[0] : undefined);

        if (defaultVariant?.etsySku) {
          const etsySku = product.sku?.trim() ? product.sku : null;
          const needsSync = etsySku !== defaultVariant.etsySku;

          pendingSkus.push({
            hamperId: hamper.id,
            hamperName: hamper.name,
            etsyListingId: hamper.etsyListingId!,
            variantId: defaultVariant.id,
            variantName: defaultVariant.name,
            localSku: defaultVariant.etsySku,
            etsySku,
            etsyProductId: defaultVariant.etsyProductId ?? String(product.product_id),
            needsSync,
          });
        }

        continue;
      }

      for (const variant of hamper.variants) {
        if (!variant.etsySku) continue;

        const etsyProduct =
          findEtsyProductByIdentifiers(products, {
            etsySku: variant.etsySku,
            etsyProductId: variant.etsyProductId,
          }) ??
          findEtsyProductByVariantName(products, variant.name);

        const etsySku = etsyProduct?.sku?.trim() ? etsyProduct.sku : null;
        const needsSync = etsySku !== variant.etsySku;

        pendingSkus.push({
          hamperId: hamper.id,
          hamperName: hamper.name,
          etsyListingId: hamper.etsyListingId!,
          variantId: variant.id,
          variantName: variant.name,
          localSku: variant.etsySku,
          etsySku,
          etsyProductId: variant.etsyProductId ?? (etsyProduct ? String(etsyProduct.product_id) : null),
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
    } = {
      etsyListingId: { not: null },
      isActive: true,
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

        const listingHasSingleProduct = currentInventory.products.length === 1;

        const updatedProducts = currentInventory.products.map((etsyProduct) => {
          let localVariant =
            findItemByEtsyProduct(hamper.variants, etsyProduct) ??
            findItemByVariantName(hamper.variants, getEtsyVariantName(etsyProduct));

          if (!localVariant && listingHasSingleProduct) {
            localVariant =
              hamper.variants.find((v) => v.name === 'Default') ??
              (hamper.variants.length === 1 ? hamper.variants[0] : undefined);
          }

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
