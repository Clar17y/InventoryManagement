import { prisma } from '../../prisma';
import { etsyClient } from '../../etsyClient';
import {
  logWorkflow,
  startLogSession,
  endLogSession,
} from '../debugLogger';
import { generateHamperSku, generateVariantSku } from '../skuGenerator';
import {
  findEtsyProductByIdentifiers,
  findEtsyProductByVariantName,
  findDuplicateEtsySkus,
  findItemByEtsyProduct,
  findItemByVariantName,
  getEtsyVariantName,
} from '../matching';
import {
  getListingInventoryCached,
  getListingInventoriesBatched,
  invalidateListingInventory,
} from '../inventoryCache';
import type { EtsyInventory, EtsyInventoryUpdateProduct, EtsyProduct } from '../types';

type DuplicateSkuProductReport = {
  etsyProductId: string;
  variantName: string;
  sku: string;
  localVariantId: string | null;
  localVariantName: string | null;
};

type DuplicateSkuGroupReport = {
  sku: string;
  count: number;
  products: DuplicateSkuProductReport[];
};

type DuplicateSkuListingReport = {
  etsyListingId: string;
  hamperId: string;
  hamperName: string;
  duplicateGroups: DuplicateSkuGroupReport[];
};

type DuplicateSkuRepairChange = {
  etsyProductId: string;
  variantName: string;
  oldSku: string;
  newSku: string;
  localVariantId: string | null;
};

type DuplicateSkuRepairResult = {
  etsyListingId: string;
  hamperName: string;
  success: boolean;
  dryRun: boolean;
  changed: number;
  updated: number;
  changes: DuplicateSkuRepairChange[];
  error?: string;
};

type HamperForSkuRepair = {
  id: string;
  name: string;
  etsyListingId: string | null;
  variants: Array<{
    id: string;
    name: string;
    etsySku: string | null;
    etsyProductId: string | null;
  }>;
};

type RepairDuplicateSkusOptions = {
  listingIds?: string[];
  dryRun?: boolean;
};

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

export async function getPendingSkus(listingIds?: string[]) {
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
          where: { isActive: true },
        },
      },
    });

    // Collect all listing IDs and fetch inventories in batch
    const allListingIds = hampers
      .filter(h => h.etsyListingId)
      .map(h => parseInt(h.etsyListingId!));
    const inventoryMap = await getListingInventoriesBatched(allListingIds);

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
      const etsyInventory = inventoryMap.get(parseInt(hamper.etsyListingId!));
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

export async function getDuplicateSkuReport(listingIds?: string[]) {
  const hampers = await getActiveEtsyHampers(listingIds);
  const allListingIds = hampers
    .filter((hamper) => hamper.etsyListingId)
    .map((hamper) => parseInt(hamper.etsyListingId!, 10));

  const listings = await etsyClient.getListingsByListingIds(allListingIds, ['Inventory']);
  const listingsById = new Map(listings.map((listing) => [listing.listing_id, listing]));

  const listingReports: DuplicateSkuListingReport[] = [];
  let duplicateSkuGroups = 0;
  let productsInDuplicateGroups = 0;

  for (const hamper of hampers) {
    if (!hamper.etsyListingId) continue;

    const listingId = parseInt(hamper.etsyListingId, 10);
    const listing = listingsById.get(listingId);
    const products = (listing?.inventory?.products ?? []).filter((product) => !product.is_deleted);
    const groups = buildDuplicateSkuGroups(products, hamper);

    if (groups.length === 0) continue;

    duplicateSkuGroups += groups.length;
    productsInDuplicateGroups += groups.reduce((sum, group) => sum + group.count, 0);
    listingReports.push({
      etsyListingId: hamper.etsyListingId,
      hamperId: hamper.id,
      hamperName: hamper.name,
      duplicateGroups: groups,
    });
  }

  return {
    summary: {
      scannedListings: hampers.length,
      listingsWithDuplicateSkus: listingReports.length,
      duplicateSkuGroups,
      productsInDuplicateGroups,
    },
    listings: listingReports,
  };
}

export async function repairDuplicateSkus(options: RepairDuplicateSkusOptions = {}) {
  const dryRun = options.dryRun !== false;
  const hampers = await getActiveEtsyHampers(options.listingIds);
  const existingSkus = new Set(
    (
      await prisma.hamperVariant.findMany({
        where: { etsySku: { not: null } },
        select: { etsySku: true },
      })
    )
      .map((variant) => variant.etsySku)
      .filter((sku): sku is string => !!sku)
  );

  const results: DuplicateSkuRepairResult[] = [];

  for (const hamper of hampers) {
    if (!hamper.etsyListingId) continue;

    try {
      const listingId = parseInt(hamper.etsyListingId, 10);
      invalidateListingInventory(listingId);
      const currentInventory = await etsyClient.getListingInventory(listingId);
      for (const product of currentInventory.products) {
        const sku = product.sku?.trim();
        if (sku) existingSkus.add(sku);
      }
      const changes = planDuplicateSkuRepair(hamper, currentInventory, existingSkus);

      if (!dryRun && changes.length > 0) {
        const updatedProducts = buildSkuRepairUpdateProducts(currentInventory, changes);
        await etsyClient.updateListingInventory(listingId, updatedProducts, currentInventory);

        for (const change of changes) {
          if (!change.localVariantId) continue;
          await prisma.hamperVariant.update({
            where: { id: change.localVariantId },
            data: { etsySku: change.newSku },
          });
        }

        invalidateListingInventory(listingId);
      }

      results.push({
        etsyListingId: hamper.etsyListingId,
        hamperName: hamper.name,
        success: true,
        dryRun,
        changed: changes.length,
        updated: dryRun ? 0 : changes.length,
        changes,
      });
    } catch (error) {
      results.push({
        etsyListingId: hamper.etsyListingId,
        hamperName: hamper.name,
        success: false,
        dryRun,
        changed: 0,
        updated: 0,
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const totalWouldChange = results.reduce((sum, result) => sum + result.changed, 0);
  const totalUpdated = results.reduce((sum, result) => sum + result.updated, 0);
  const totalErrors = results.filter((result) => !result.success).length;

  return {
    success: totalErrors === 0,
    dryRun,
    totalListings: results.length,
    totalWouldChange,
    totalUpdated,
    errors: totalErrors,
    results,
  };
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

    for (const hamper of hampers) {
      if (!hamper.etsyListingId || hamper.variants.length === 0) continue;

      try {
        const listingId = parseInt(hamper.etsyListingId);

        const currentInventory = await getListingInventoryCached(listingId);

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
            findItemByEtsyProduct(hamper.variants, etsyProduct, currentInventory.products) ??
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

          // Invalidate cache so next read gets fresh data
          invalidateListingInventory(listingId);
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

async function getActiveEtsyHampers(listingIds?: string[]): Promise<HamperForSkuRepair[]> {
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

  return prisma.hamper.findMany({
    where: whereClause,
    include: {
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          etsySku: true,
          etsyProductId: true,
        },
      },
    },
  }) as Promise<HamperForSkuRepair[]>;
}

function buildDuplicateSkuGroups(
  products: EtsyProduct[],
  hamper: HamperForSkuRepair
): DuplicateSkuGroupReport[] {
  const duplicateSkus = findDuplicateEtsySkus(products);
  const variantsByProductId = new Map(
    hamper.variants
      .filter((variant) => variant.etsyProductId)
      .map((variant) => [variant.etsyProductId!, variant])
  );

  return [...duplicateSkus].map((sku) => {
    const productsForSku = products.filter((product) => product.sku?.trim() === sku);
    return {
      sku,
      count: productsForSku.length,
      products: productsForSku.map((product) => {
        const localVariant = variantsByProductId.get(String(product.product_id)) ?? null;
        return {
          etsyProductId: String(product.product_id),
          variantName: getEtsyVariantName(product) ?? `Variant ${product.product_id}`,
          sku,
          localVariantId: localVariant?.id ?? null,
          localVariantName: localVariant?.name ?? null,
        };
      }),
    };
  });
}

function planDuplicateSkuRepair(
  hamper: HamperForSkuRepair,
  currentInventory: EtsyInventory,
  usedSkus: Set<string>
): DuplicateSkuRepairChange[] {
  const products = currentInventory.products.filter((product) => !product.is_deleted);
  const duplicateSkus = findDuplicateEtsySkus(products);
  const variantsByProductId = new Map(
    hamper.variants
      .filter((variant) => variant.etsyProductId)
      .map((variant) => [variant.etsyProductId!, variant])
  );
  const changes: DuplicateSkuRepairChange[] = [];

  for (const sku of duplicateSkus) {
    const productsForSku = products.filter((product) => product.sku?.trim() === sku);
    const productToKeep =
      productsForSku.find((product) => {
        const localVariant = variantsByProductId.get(String(product.product_id));
        return localVariant?.etsySku === sku;
      }) ?? productsForSku[0];

    for (const product of productsForSku) {
      if (product.product_id === productToKeep.product_id) continue;

      const localVariant = variantsByProductId.get(String(product.product_id)) ?? null;
      const variantName = localVariant?.name ?? getEtsyVariantName(product) ?? `Variant ${product.product_id}`;
      const preferredSku = localVariant?.etsySku && localVariant.etsySku !== sku
        ? localVariant.etsySku
        : generateVariantSku(hamper.name, variantName, hamper.etsyListingId!);
      const allowedExistingSku =
        localVariant?.etsySku === preferredSku &&
          !isSkuUsedByOtherCurrentProduct(preferredSku, product.product_id, products)
          ? preferredSku
          : undefined;
      const newSku = makeUniqueSku(preferredSku, usedSkus, allowedExistingSku);
      usedSkus.add(newSku);

      changes.push({
        etsyProductId: String(product.product_id),
        variantName,
        oldSku: sku,
        newSku,
        localVariantId: localVariant?.id ?? null,
      });
    }
  }

  return changes;
}

function isSkuUsedByOtherCurrentProduct(
  sku: string,
  productId: number,
  products: EtsyProduct[]
): boolean {
  const normalizedSku = sku.trim();

  return products.some(
    (product) => product.product_id !== productId && product.sku?.trim() === normalizedSku
  );
}

function makeUniqueSku(baseSku: string, usedSkus: Set<string>, allowedExistingSku?: string): string {
  if (!usedSkus.has(baseSku) || baseSku === allowedExistingSku) {
    return baseSku;
  }

  let suffix = 2;
  let candidate = `${baseSku}-${suffix}`;
  while (usedSkus.has(candidate)) {
    suffix++;
    candidate = `${baseSku}-${suffix}`;
  }

  return candidate;
}

function buildSkuRepairUpdateProducts(
  currentInventory: EtsyInventory,
  changes: DuplicateSkuRepairChange[]
): EtsyInventoryUpdateProduct[] {
  const changesByProductId = new Map(changes.map((change) => [change.etsyProductId, change]));

  return currentInventory.products.map((product) => {
    const change = changesByProductId.get(String(product.product_id));
    return {
      sku: change?.newSku ?? product.sku,
      property_values: product.property_values.map((pv) => ({
        property_id: pv.property_id,
        property_name: pv.property_name,
        value_ids: pv.value_ids,
        values: pv.values,
      })),
      offerings: product.offerings.map((offering) => ({
        quantity: offering.quantity,
        price: offering.price.amount / offering.price.divisor,
        is_enabled: offering.is_enabled,
        readiness_state_id: offering.readiness_state_id,
      })),
    };
  });
}
