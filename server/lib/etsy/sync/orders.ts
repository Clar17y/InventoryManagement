import { prisma } from '../../prisma';
import { etsyClient } from '../../etsyClient';
import {
  allocateStockForRequirement,
  allocateStockForVariantRequirement,
} from '../../sales/allocation';
import { calculateEtsyFees, calculatePackagingOverhead, SaleChannel } from '../../sales/fees';
import { PickRule } from '@prisma/client';
import {
  logWorkflow,
  startLogSession,
  endLogSession,
} from '../debugLogger';
import { SyncHttpError } from './errors';
import { getListingInventoryCached } from '../inventoryCache';
import { hasDuplicateEtsySku } from '../matching';
import type { EtsyTransaction } from '../types';
import { decodeHtmlEntities } from '../utils';

type AllocationOverride = Array<{ lotId: string; quantity: number }>
type AllocationOverridesByNeedKey = Record<string, AllocationOverride>
type SkuFallbackSafetyCache = Map<string, Promise<boolean>>

async function canUseSkuFallbackForTransaction(
  tx: Pick<EtsyTransaction, 'listing_id' | 'sku'>,
  cache: SkuFallbackSafetyCache
): Promise<boolean> {
  const sku = tx.sku?.trim()
  if (!sku) return false

  const key = `${tx.listing_id}:${sku}`
  let lookup = cache.get(key)
  if (!lookup) {
    lookup = (async () => {
      try {
        const inventory = await getListingInventoryCached(tx.listing_id)
        const products = inventory.products.filter((product) => !product.is_deleted)
        return !hasDuplicateEtsySku(products, sku)
      } catch (error) {
        logWorkflow('IMPORT:PHASE1', 'Skipping SKU variant lookup because Etsy inventory could not be verified', {
          listingId: tx.listing_id,
          sku,
          error: error instanceof Error ? error.message : String(error),
        })
        return false
      }
    })()
    cache.set(key, lookup)
  }

  return lookup
}

function buildNeedKey(categoryId: string, variantId: string | null): string {
  return `${categoryId}-${variantId || 'all'}`;
}

async function validateAllocationOverride(params: {
  key: string;
  categoryId: string;
  quantityRequired: number;
  override: AllocationOverride;
}): Promise<{ quantitySelected: number }> {
  const { key, categoryId, quantityRequired, override } = params

  const requestedByLotId = override.reduce<Record<string, number>>((acc, o) => {
    acc[o.lotId] = (acc[o.lotId] ?? 0) + o.quantity
    return acc
  }, {})

  const lotIds = Object.keys(requestedByLotId)
  if (lotIds.length === 0) {
    throw new SyncHttpError(400, {
      error: 'Invalid substitution',
      message: `Substitution for ${key} is empty (need ${quantityRequired}).`,
    });
  }

  const lots = await prisma.inventoryLot.findMany({
    where: { id: { in: lotIds } },
    include: { product: true },
  })

  const lotsById = new Map(lots.map((l) => [l.id, l]))
  const missingLots = lotIds.filter((id) => !lotsById.has(id))
  if (missingLots.length > 0) {
    throw new SyncHttpError(400, {
      error: 'Invalid substitution',
      message: `Substitution contains unknown lot(s): ${missingLots.join(', ')}`,
    });
  }

  for (const [lotId, qty] of Object.entries(requestedByLotId)) {
    const lot = lotsById.get(lotId)!
    if (lot.product.categoryId !== categoryId) {
      throw new SyncHttpError(400, {
        error: 'Invalid substitution',
        message: `Lot ${lotId} is not in the required category for ${key}.`,
      });
    }

    if (Number(lot.remaining) < qty) {
      throw new SyncHttpError(400, {
        error: 'Invalid substitution',
        message: `Lot ${lotId} does not have enough remaining stock (selected ${qty}, remaining ${Number(lot.remaining)}).`,
      });
    }
  }

  const quantitySelected = Object.values(requestedByLotId).reduce((sum, qty) => sum + qty, 0)
  if (quantitySelected < quantityRequired) {
    throw new SyncHttpError(400, {
      error: 'Invalid substitution',
      message: `Substitution for ${key} does not cover the required quantity (selected ${quantitySelected}, need ${quantityRequired}).`,
    });
  }

  return { quantitySelected }
}

export async function getPendingOrders() {
  const sessionId = startLogSession('PENDING_ORDERS');
  try {
    const thirtyDaysAgo = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );
    logWorkflow('PENDING', 'Fetching receipts from Etsy', {
      minCreated: thirtyDaysAgo,
      minCreatedDate: new Date(thirtyDaysAgo * 1000).toISOString(),
      limit: 100,
    });

    const { receipts } = await etsyClient.getReceipts(thirtyDaysAgo, 100);
    logWorkflow('PENDING', `Received ${receipts.length} receipts from Etsy`, {
      receiptIds: receipts.map((r) => r.receipt_id),
      receipts: receipts.map((r) => ({
        receipt_id: r.receipt_id,
        name: r.name,
        is_paid: r.is_paid,
        is_shipped: r.is_shipped,
        create_timestamp: r.create_timestamp,
        grandtotal: r.grandtotal,
        subtotal: r.subtotal,
        total_shipping_cost: r.total_shipping_cost,
        transactions: r.transactions.map((tx) => ({
          transaction_id: tx.transaction_id,
          listing_id: tx.listing_id,
          title: tx.title,
          quantity: tx.quantity,
          price: tx.price,
          sku: tx.sku,
          product_id: tx.product_id,
          variations: tx.variations,
        })),
      })),
    });

    const existingSales = await prisma.sale.findMany({
      where: { etsyOrderId: { not: null } },
      select: { etsyOrderId: true },
    });
    const importedOrderIds = new Set(existingSales.map((s) => s.etsyOrderId));
    logWorkflow('PENDING', 'Checked existing sales', {
      importedCount: importedOrderIds.size,
      importedIds: Array.from(importedOrderIds),
    });

    const pendingOrders = receipts
      .filter((receipt) => receipt.is_paid)
      .filter((receipt) => !importedOrderIds.has(String(receipt.receipt_id)))
      .map((receipt) => ({
        receiptId: receipt.receipt_id,
        buyerName: receipt.name,
        createdAt: new Date(receipt.create_timestamp * 1000).toISOString(),
        isPaid: receipt.is_paid,
        isShipped: receipt.is_shipped,
        grandTotal: receipt.grandtotal.amount / receipt.grandtotal.divisor,
        subtotal: receipt.subtotal.amount / receipt.subtotal.divisor,
        shippingCost:
          receipt.total_shipping_cost.amount /
          receipt.total_shipping_cost.divisor,
        items: receipt.transactions.map((tx) => {
          const variantName = tx.variations?.length
            ? tx.variations.map((v) => v.formatted_value).join(', ')
            : null;
          return {
            transactionId: tx.transaction_id,
            listingId: tx.listing_id,
            title: decodeHtmlEntities(tx.title),
            quantity: tx.quantity,
            price: tx.price.amount / tx.price.divisor,
            sku: tx.sku,
            productId: tx.product_id,
            variantName,
          };
        }),
      }));

    logWorkflow('PENDING', 'Filtered to pending orders', {
      pendingCount: pendingOrders.length,
      pendingOrders,
    });

    endLogSession(sessionId, { success: true, pendingCount: pendingOrders.length });
    return pendingOrders;
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    logWorkflow('PENDING', 'ERROR fetching pending orders', {
      error:
        error instanceof Error
          ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
          : error,
    });
    endLogSession(sessionId, { success: false, error: String(error) });
    throw error;
  }
}

export async function importOrder(
  receiptId: number,
  postageCost: number,
  isHistorical = false,
  allocationOverrides?: AllocationOverridesByNeedKey
) {
  const sessionId = startLogSession('ORDER_IMPORT');
  try {
    logWorkflow('IMPORT', 'Starting order import', {
      receiptId,
      postageCost,
      isHistorical,
      hasAllocationOverrides: !!allocationOverrides && Object.keys(allocationOverrides).length > 0,
      allocationOverrideKeys: allocationOverrides ? Object.keys(allocationOverrides) : [],
    });

    if (!receiptId || postageCost === undefined) {
      logWorkflow('IMPORT', 'Validation failed - missing required fields', {
        receiptId,
        postageCost,
      });
      endLogSession(sessionId, { success: false, error: 'validation' });
      throw new SyncHttpError(400, {
        error: 'receiptId and postageCost are required',
      });
    }

    const existing = await prisma.sale.findFirst({
      where: { etsyOrderId: String(receiptId) },
    });
    if (existing) {
      logWorkflow('IMPORT', 'Order already imported', {
        existingSaleId: existing.id,
      });
      endLogSession(sessionId, { success: false, error: 'already_imported' });
      throw new SyncHttpError(400, {
        error: 'Order already imported',
        saleId: existing.id,
      });
    }

    logWorkflow('IMPORT', 'Fetching receipt from Etsy API');
    const thirtyDaysAgo = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );
    const { receipts } = await etsyClient.getReceipts(thirtyDaysAgo, 100);
    const receipt = receipts.find((r) => r.receipt_id === receiptId);

    logWorkflow('IMPORT', 'Receipt lookup result', {
      found: !!receipt,
      receiptId,
      totalReceipts: receipts.length,
      receipt: receipt
        ? {
          receipt_id: receipt.receipt_id,
          name: receipt.name,
          is_paid: receipt.is_paid,
          is_shipped: receipt.is_shipped,
          grandtotal: receipt.grandtotal,
          subtotal: receipt.subtotal,
          total_shipping_cost: receipt.total_shipping_cost,
          transactions: receipt.transactions,
        }
        : null,
    });

    if (!receipt) {
      endLogSession(sessionId, { success: false, error: 'receipt_not_found' });
      throw new SyncHttpError(404, { error: 'Receipt not found on Etsy' });
    }

    const postageCharged =
      receipt.total_shipping_cost.amount / receipt.total_shipping_cost.divisor;
    const subtotal = receipt.subtotal.amount / receipt.subtotal.divisor;

    const feeConfig = await prisma.etsyFeeConfig.findFirst({
      where: { isActive: true },
    });

    const overheads = await prisma.packagingOverhead.findMany({
      where: { isActive: true },
    });

    const packagingOverhead = calculatePackagingOverhead(overheads);

    const grossRevenue = subtotal + postageCharged;
    const fees = calculateEtsyFees({
      grossRevenue,
      postageCharged,
      saleChannel: 'etsy' as SaleChannel,
      feeConfig,
    });

    logWorkflow('IMPORT', 'Fee calculation complete', {
      feeConfig: feeConfig
        ? {
          id: feeConfig.id,
          name: feeConfig.name,
          transactionFee: String(feeConfig.transactionFee),
          regulatoryFee: String(feeConfig.regulatoryFee),
          paymentFeePercent: String(feeConfig.paymentFeePercent),
          paymentFeeFixed: String(feeConfig.paymentFeeFixed),
          vatRate: String(feeConfig.vatRate),
          listingFee: String(feeConfig.listingFee),
        }
        : null,
      overheadCount: overheads.length,
      packagingOverhead,
      subtotal,
      postageCharged,
      fees,
    });

    logWorkflow('IMPORT:PHASE1', 'Starting mapping validation');
    interface LineMeta {
      transactionId: number;
      title: string;
      quantity: number;
      unitPrice: number;
      hamperId: string;
      variantId: string | null;
      requirements: Array<{
        categoryId: string;
        quantity: number;
        categoryName: string;
        pickRule: string;
      }>;
    }

    const lineMetas: LineMeta[] = [];
    const missingMappings: string[] = [];
    const variantFallbackWarnings: string[] = [];
    const skuFallbackSafetyCache: SkuFallbackSafetyCache = new Map();

    const aggregatedNeeds = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        variantId: string | null;
        totalNeeded: number;
        pickRule: string;
      }
    >();

    for (const tx of receipt.transactions) {
      logWorkflow('IMPORT:PHASE1', `Processing transaction ${tx.transaction_id}`, {
        transaction_id: tx.transaction_id,
        listing_id: tx.listing_id,
        title: tx.title,
        quantity: tx.quantity,
        price: tx.price,
        sku: tx.sku,
        product_id: tx.product_id,
        variations: tx.variations,
      });

      const hamper = await prisma.hamper.findFirst({
        where: { etsyListingId: String(tx.listing_id) },
        include: {
          requirements: {
            include: {
              category: true,
            },
          },
          variants: true,
        },
      });

      logWorkflow('IMPORT:PHASE1', `Hamper lookup for listing ${tx.listing_id}`, {
        found: !!hamper,
        hamper: hamper
          ? {
            id: hamper.id,
            name: hamper.name,
            etsyListingId: hamper.etsyListingId,
            hasVariants: hamper.hasVariants,
            requirementsCount: hamper.requirements.length,
            requirements: hamper.requirements.map((r) => ({
              categoryId: r.categoryId,
              categoryName: r.category.name,
              quantity: r.quantity,
              pickRule: r.category.pickRule,
            })),
          }
          : null,
      });

      if (!hamper) {
        missingMappings.push(`"${decodeHtmlEntities(tx.title)}" (listing ${tx.listing_id})`);
        continue;
      }

      let variantId: string | null = null;
      if (hamper.hasVariants) {
        let variant = null;

        if (tx.product_id) {
          variant = await prisma.hamperVariant.findFirst({
            where: { hamperId: hamper.id, etsyProductId: String(tx.product_id) },
          });
          logWorkflow(
            'IMPORT:PHASE1',
            `Variant lookup by product_id ${tx.product_id}`,
            {
              hamperId: hamper.id,
              productId: tx.product_id,
              found: !!variant,
              variant: variant
                ? {
                  id: variant.id,
                  name: variant.name,
                  etsySku: variant.etsySku,
                  etsyProductId: variant.etsyProductId,
                }
                : null,
            }
          );
        }

        if (!variant && tx.sku && await canUseSkuFallbackForTransaction(tx, skuFallbackSafetyCache)) {
          variant = await prisma.hamperVariant.findFirst({
            where: { hamperId: hamper.id, etsySku: tx.sku },
          });
          logWorkflow('IMPORT:PHASE1', `Variant lookup by SKU "${tx.sku}"`, {
            hamperId: hamper.id,
            sku: tx.sku,
            found: !!variant,
            variant: variant
              ? {
                id: variant.id,
                name: variant.name,
                etsySku: variant.etsySku,
                etsyProductId: variant.etsyProductId,
              }
              : null,
          });
        } else if (!variant && tx.sku) {
          logWorkflow('IMPORT:PHASE1', `Skipped variant lookup by duplicate or unverified SKU "${tx.sku}"`, {
            hamperId: hamper.id,
            listingId: tx.listing_id,
            sku: tx.sku,
          });
        }

        if (variant) {
          variantId = variant.id;

          // Update variant's sellingPrice from Etsy if not already set
          const etsyPrice = tx.price.amount / tx.price.divisor;
          if (variant.sellingPrice === null) {
            await prisma.hamperVariant.update({
              where: { id: variant.id },
              data: { sellingPrice: etsyPrice },
            });
            logWorkflow('IMPORT:PHASE1', `Updated variant sellingPrice from Etsy`, {
              variantId: variant.id,
              variantName: variant.name,
              sellingPrice: etsyPrice,
            });
          }
        } else {
          const identifier = tx.sku
            ? `SKU "${tx.sku}"`
            : tx.product_id
              ? `product_id ${tx.product_id}`
              : 'unknown variant';
          variantFallbackWarnings.push(
            `"${decodeHtmlEntities(tx.title)}" ${identifier} not mapped to variant, using category-wide allocation`
          );
        }
      }


      const lineRequirements = hamper.requirements
        .filter((r) => !r.isOptional)
        .map((r) => ({
          categoryId: r.categoryId,
          quantity: Number(r.quantity),
          categoryName: r.category.name,
          pickRule: r.category.pickRule,
        }));

      lineMetas.push({
        transactionId: tx.transaction_id,
        title: tx.title,
        quantity: tx.quantity,
        unitPrice: tx.price.amount / tx.price.divisor,
        hamperId: hamper.id,
        variantId,
        requirements: lineRequirements,
      });

      for (const req of lineRequirements) {
        const key = `${req.categoryId}-${variantId || 'all'}`;
        const existing = aggregatedNeeds.get(key);
        const totalNeeded = req.quantity * tx.quantity;
        if (existing) {
          existing.totalNeeded += totalNeeded;
        } else {
          aggregatedNeeds.set(key, {
            categoryId: req.categoryId,
            categoryName: req.categoryName,
            variantId,
            totalNeeded,
            pickRule: req.pickRule,
          });
        }
      }
    }

    logWorkflow('IMPORT:PHASE1', 'Phase 1 complete - mapping validation', {
      lineMetas: lineMetas.map((lm) => ({
        transactionId: lm.transactionId,
        title: lm.title,
        quantity: lm.quantity,
        hamperId: lm.hamperId,
        variantId: lm.variantId,
        requirementsCount: lm.requirements.length,
      })),
      missingMappings,
      variantFallbackWarnings,
      aggregatedNeeds: [...aggregatedNeeds].map(([key, need]) => ({
        key,
        ...need,
      })),
    });

    if (missingMappings.length > 0) {
      logWorkflow('IMPORT', 'FAILED - Missing hamper mappings', {
        missingMappings,
      });
      endLogSession(sessionId, {
        success: false,
        error: 'missing_mappings',
        missingMappings,
      });
      throw new SyncHttpError(400, {
        error: 'Items missing hamper mapping',
        missingMappings,
        message: `Cannot import: ${missingMappings.join(
          ', '
        )} not linked to any hamper. Import these listings first.`,
      });
    }

    // Phase 2: Stock availability pre-check (skip for historical imports)
    if (!isHistorical) {
      logWorkflow('IMPORT:PHASE2', 'Starting stock availability pre-check');
      const stockShortages: Array<{
        key: string;
        categoryId: string;
        categoryName: string;
        variantId: string | null;
        pickRule: string;
        productName?: string;
        need: number;
        have: number;
        missing: number;
      }> = [];

      for (const [key, need] of aggregatedNeeds) {
        logWorkflow('IMPORT:PHASE2', `Checking stock for ${key}`, {
          categoryId: need.categoryId,
          categoryName: need.categoryName,
          variantId: need.variantId,
          totalNeeded: need.totalNeeded,
          pickRule: need.pickRule,
        });

        const override = allocationOverrides?.[key];
        if (override) {
          await validateAllocationOverride({
            key,
            categoryId: need.categoryId,
            quantityRequired: need.totalNeeded,
            override,
          });

          logWorkflow('IMPORT:PHASE2', `Override validated for ${key}`, {
            overrideLots: override.length,
          });
          continue;
        }

        const allocation = need.variantId
          ? await allocateStockForVariantRequirement(
            need.variantId,
            need.categoryId,
            need.totalNeeded,
            need.pickRule as PickRule
          )
          : await allocateStockForRequirement(
            need.categoryId,
            need.totalNeeded,
            need.pickRule as PickRule
          );

        logWorkflow('IMPORT:PHASE2', `Stock allocation result for ${key}`, {
          fulfilled: allocation.fulfilled,
          categoryName: allocation.categoryName,
          productName: allocation.productName,
          allocations: allocation.allocations.map((a) => ({
            lotId: a.lotId,
            quantity: a.quantity,
            unitCost: a.unitCost,
          })),
        });

        if (!allocation.fulfilled) {
          const have = allocation.allocations.reduce((sum, a) => sum + a.quantity, 0);
          const missing = Math.max(0, need.totalNeeded - have);

          const uniqueProducts = Array.from(
            new Set(allocation.allocations.map((a) => a.productName).filter(Boolean))
          );
          const productName =
            allocation.productName ||
            (uniqueProducts.length === 1 ? uniqueProducts[0] : undefined);
          stockShortages.push({
            key,
            categoryId: need.categoryId,
            categoryName: allocation.categoryName,
            variantId: need.variantId,
            pickRule: need.pickRule,
            productName,
            need: need.totalNeeded,
            have,
            missing,
          });
        }
      }

      logWorkflow('IMPORT:PHASE2', 'Phase 2 complete - stock pre-check', {
        shortagesCount: stockShortages.length,
        stockShortages,
      });

      if (stockShortages.length > 0) {
        logWorkflow('IMPORT', 'FAILED - Insufficient stock', { stockShortages });
        endLogSession(sessionId, {
          success: false,
          error: 'insufficient_stock',
          stockShortages,
        });
        const message = `Insufficient stock \u2192 ${stockShortages
          .map((s) => {
            const product = s.productName ? ` (${s.productName})` : '';
            return `${s.categoryName}${product}: need ${s.need}, have ${s.have}`;
          })
          .join(', ')}`;
        throw new SyncHttpError(400, {
          error: 'Insufficient stock to fulfill order',
          code: 'insufficient_stock',
          receiptId,
          message,
          shortages: stockShortages,
        });
      }
    } else {
      logWorkflow('IMPORT:PHASE2', 'SKIPPED - Historical import mode');
    }

    logWorkflow('IMPORT:PHASE3', 'Starting transactional import');
    const sale = await prisma.$transaction(async (tx) => {
      let totalCost = 0;

      const overridePools = new Map<string, Array<{ lotId: string; remainingQty: number }>>();
      if (allocationOverrides) {
        for (const [key, override] of Object.entries(allocationOverrides)) {
          const requestedByLotId = override.reduce<Record<string, number>>((acc, o) => {
            acc[o.lotId] = (acc[o.lotId] ?? 0) + o.quantity;
            return acc;
          }, {});

          overridePools.set(
            key,
            Object.entries(requestedByLotId).map(([lotId, qty]) => ({
              lotId,
              remainingQty: qty,
            }))
          );
        }
      }

      const saleLines: Array<{
        hamperId: string;
        variantId: string | null;
        description: string | null;
        quantity: number;
        unitPrice: number;
        lineCost: number;
        consumptions: Array<{ lotId: string; quantity: number; unitCost: number }>;
      }> = [];

      for (const lineMeta of lineMetas) {
        // For historical imports, skip stock allocation and consumption
        if (isHistorical) {
          saleLines.push({
            hamperId: lineMeta.hamperId,
            variantId: lineMeta.variantId,
            description: null,
            quantity: lineMeta.quantity,
            unitPrice: lineMeta.unitPrice,
            lineCost: 0, // No stock cost for historical imports
            consumptions: [],
          });

          // Atomically reduce indicative quantity for historical imports (NULLIF normalizes 0 to null)
          if (lineMeta.variantId) {
            await tx.$executeRaw`
              UPDATE "HamperVariant"
              SET "indicativeQuantity" = NULLIF(GREATEST(0, "indicativeQuantity" - ${lineMeta.quantity}), 0)
              WHERE id = ${lineMeta.variantId}
                AND "indicativeQuantity" IS NOT NULL
                AND "indicativeQuantity" > 0
            `;
          } else {
            await tx.$executeRaw`
              UPDATE "Hamper"
              SET "indicativeQuantity" = NULLIF(GREATEST(0, "indicativeQuantity" - ${lineMeta.quantity}), 0)
              WHERE id = ${lineMeta.hamperId}
                AND "indicativeQuantity" IS NOT NULL
                AND "indicativeQuantity" > 0
            `;
          }

          continue;
        }

        const consumptions: Array<{
          lotId: string;
          quantity: number;
          unitCost: number;
        }> = [];

        for (const requirement of lineMeta.requirements) {
          const totalNeeded = requirement.quantity * lineMeta.quantity;

          const needKey = buildNeedKey(requirement.categoryId, lineMeta.variantId);
          const overridePool = overridePools.get(needKey);

          if (overridePool) {
            let remaining = totalNeeded;
            const selected: Array<{ lotId: string; quantity: number; unitCost: number }> = [];

            for (const entry of overridePool) {
              if (remaining <= 0) break;
              if (entry.remainingQty <= 0) continue;

              const qty = Math.min(remaining, entry.remainingQty);
              if (qty <= 0) continue;

              const lot = await tx.inventoryLot.findUnique({
                where: { id: entry.lotId },
              });
              if (!lot) throw new Error(`Lot ${entry.lotId} not found`);
              if (Number(lot.remaining) < qty) {
                throw new Error(
                  `Lot ${entry.lotId} does not have enough remaining stock (need ${qty}, remaining ${Number(
                    lot.remaining
                  )})`
                );
              }

              selected.push({
                lotId: entry.lotId,
                quantity: qty,
                unitCost: Number(lot.unitCost),
              });

              entry.remainingQty -= qty;
              remaining -= qty;
            }

            if (remaining > 0) {
              throw new Error(
                `Substitution did not cover required quantity for ${needKey} (need ${totalNeeded}, missing ${remaining})`
              );
            }

            for (const alloc of selected) {
              await tx.inventoryLot.update({
                where: { id: alloc.lotId },
                data: { remaining: { decrement: alloc.quantity } },
              });

              consumptions.push({
                lotId: alloc.lotId,
                quantity: alloc.quantity,
                unitCost: alloc.unitCost,
              });
              totalCost += alloc.quantity * alloc.unitCost;
            }

            continue;
          }

          const allocation = lineMeta.variantId
            ? await allocateStockForVariantRequirement(
              lineMeta.variantId,
              requirement.categoryId,
              totalNeeded,
              requirement.pickRule as PickRule,
              tx
            )
            : await allocateStockForRequirement(
              requirement.categoryId,
              totalNeeded,
              requirement.pickRule as PickRule,
              tx
            );

          for (const alloc of allocation.allocations) {
            // Deduct from lot - CRITICAL: this actually reduces the stock
            await tx.inventoryLot.update({
              where: { id: alloc.lotId },
              data: { remaining: { decrement: alloc.quantity } },
            });

            consumptions.push({
              lotId: alloc.lotId,
              quantity: alloc.quantity,
              unitCost: alloc.unitCost,
            });
            totalCost += alloc.quantity * alloc.unitCost;
          }
        }

        const lineTotalCost = consumptions.reduce(
          (sum, c) => sum + c.quantity * c.unitCost,
          0
        );

        saleLines.push({
          hamperId: lineMeta.hamperId,
          variantId: lineMeta.variantId,
          description: null,
          quantity: lineMeta.quantity,
          unitPrice: lineMeta.unitPrice,
          lineCost: lineTotalCost,
          consumptions,
        });
      }

      const grossRevenue = subtotal + postageCharged;
      const totalCostWithFees = totalCost + fees.etsyFees;
      const margin = grossRevenue - totalCostWithFees;
      const netRevenue = grossRevenue - fees.etsyFees;

      // Build notes in format: "Hamper Name(s) - Customer Name"
      const hamperNames = lineMetas.map((lm) => decodeHtmlEntities(lm.title)).join(', ');
      const notes = `${hamperNames} - ${receipt.name}`;

      const createdSale = await tx.sale.create({
        data: {
          saleDate: new Date(receipt.create_timestamp * 1000),
          grossRevenue,
          etsyOrderId: String(receipt.receipt_id),
          saleChannel: 'etsy',
          notes,
          // Individual fee breakdown
          transactionFee: fees.transactionFee,
          postageTransactionFee: fees.postageTransactionFee,
          regulatoryFee: fees.regulatoryFee,
          processingFee: fees.processingFee,
          vatOnProcessingFee: fees.vatOnProcessingFee,
          listingFee: fees.listingFee,
          etsyFees: fees.etsyFees,
          postageCost,
          postageCharged,
          packagingOverhead,
          netRevenue,
          totalCost,
          margin,
          isHistorical,
          lines: {
            create: saleLines.map((sl) => ({
              hamperId: sl.hamperId,
              variantId: sl.variantId,
              description: null,
              quantity: sl.quantity,
              unitPrice: sl.unitPrice,
              lineCost: sl.lineCost,
              consumptions: {
                create: sl.consumptions.map((c) => ({
                  lotId: c.lotId,
                  quantity: c.quantity,
                  unitCost: c.unitCost,
                })),
              },
            })),
          },
        },
        include: {
          lines: {
            include: {
              hamper: true,
              variant: true,
              consumptions: {
                include: {
                  lot: { include: { product: true } },
                },
              },
            },
          },
        },
      });

      return { createdSale, saleLines };
    });

    const { createdSale: saleResult, saleLines: saleLinesResult } = sale;

    logWorkflow('IMPORT:PHASE3', 'Sale created successfully', {
      saleId: saleResult.id,
      etsyOrderId: saleResult.etsyOrderId,
      grossRevenue: Number(saleResult.grossRevenue),
      totalCost: Number(saleResult.totalCost),
      margin: Number(saleResult.margin),
      netRevenue: Number(saleResult.netRevenue),
      etsyFees: Number(saleResult.etsyFees),
      packagingOverhead: Number(saleResult.packagingOverhead),
      linesCount: saleLinesResult.length,
      lines: saleLinesResult.map((sl) => ({
        hamperId: sl.hamperId,
        variantId: sl.variantId,
        quantity: sl.quantity,
        unitPrice: sl.unitPrice,
        lineCost: sl.lineCost,
        consumptionsCount: sl.consumptions.length,
      })),
    });

    endLogSession(sessionId, {
      success: true,
      saleId: saleResult.id,
      margin: Number(saleResult.margin),
      warnings: variantFallbackWarnings,
    });

    return {
      success: true,
      sale: {
        id: saleResult.id,
        etsyOrderId: saleResult.etsyOrderId,
        totalCost: Number(saleResult.totalCost),
        margin: Number(saleResult.margin),
        lines: saleLinesResult.length,
      },
      warnings:
        variantFallbackWarnings.length > 0 ? variantFallbackWarnings : undefined,
    };
  } catch (error) {
    if (!(error instanceof SyncHttpError)) {
      console.error('Error importing order:', error);
      logWorkflow('IMPORT', 'ERROR during import', {
        error:
          error instanceof Error
            ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
            : error,
      });
      endLogSession(sessionId, { success: false, error: String(error) });
    }
    throw error;
  }
}

/**
 * Bulk import multiple Etsy orders with a single API call
 * Much more efficient than calling importOrder multiple times
 */
export async function importOrdersBulk(
  orders: Array<{ receiptId: number; postageCost: number }>,
  isHistorical = false
) {
  const sessionId = startLogSession('BULK_ORDER_IMPORT');

  try {
    logWorkflow('BULK_IMPORT', 'Starting bulk import', {
      orderCount: orders.length,
      receiptIds: orders.map(o => o.receiptId),
      isHistorical,
    });

    // Validate input
    if (!orders || orders.length === 0) {
      throw new SyncHttpError(400, { error: 'No orders provided' });
    }

    // Fetch ALL receipts once from Etsy
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const { receipts } = await etsyClient.getReceipts(thirtyDaysAgo, 100);

    logWorkflow('BULK_IMPORT', `Fetched ${receipts.length} receipts from Etsy (single API call)`);

    // Check for already imported orders
    const receiptIds = orders.map(o => String(o.receiptId));
    const existingSales = await prisma.sale.findMany({
      where: { etsyOrderId: { in: receiptIds } },
      select: { etsyOrderId: true },
    });
    const alreadyImported = new Set(existingSales.map(s => s.etsyOrderId));

    // Load fee config and overheads once
    const feeConfig = await prisma.etsyFeeConfig.findFirst({
      where: { isActive: true },
    });
    const overheads = await prisma.packagingOverhead.findMany({
      where: { isActive: true },
    });
    const packagingOverhead = calculatePackagingOverhead(overheads);

    // Process each order
    const results: Array<{
      receiptId: number;
      success: boolean;
      saleId?: string;
      error?: string;
    }> = [];

    for (const order of orders) {
      const { receiptId, postageCost } = order;

      // Skip already imported
      if (alreadyImported.has(String(receiptId))) {
        results.push({
          receiptId,
          success: false,
          error: 'Already imported',
        });
        continue;
      }

      // Find receipt in our cached data
      const receipt = receipts.find(r => r.receipt_id === receiptId);
      if (!receipt) {
        results.push({
          receiptId,
          success: false,
          error: 'Receipt not found on Etsy',
        });
        continue;
      }

      try {
        // Process this order using the cached receipt
        const saleResult = await processReceiptImport(
          receipt,
          postageCost,
          isHistorical,
          feeConfig,
          packagingOverhead
        );
        results.push({
          receiptId,
          success: true,
          saleId: saleResult.id,
        });
      } catch (err) {
        results.push({
          receiptId,
          success: false,
          error: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }

    const imported = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logWorkflow('BULK_IMPORT', 'Bulk import complete', {
      imported,
      failed,
      results,
    });

    endLogSession(sessionId, { success: true, imported, failed });

    return {
      success: true,
      imported,
      failed,
      results,
    };
  } catch (error) {
    console.error('Error in bulk import:', error);
    logWorkflow('BULK_IMPORT', 'ERROR during bulk import', {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
    endLogSession(sessionId, { success: false, error: String(error) });
    throw error;
  }
}

/**
 * Internal helper to process a single receipt import
 * Used by both importOrder and importOrdersBulk
 */
async function processReceiptImport(
  receipt: Awaited<ReturnType<typeof etsyClient.getReceipts>>['receipts'][0],
  postageCost: number,
  isHistorical: boolean,
  feeConfig: Awaited<ReturnType<typeof prisma.etsyFeeConfig.findFirst>>,
  packagingOverhead: number
) {
  const postageCharged = receipt.total_shipping_cost.amount / receipt.total_shipping_cost.divisor;
  const subtotal = receipt.subtotal.amount / receipt.subtotal.divisor;
  const grossRevenue = subtotal + postageCharged;

  const fees = calculateEtsyFees({
    grossRevenue,
    postageCharged,
    saleChannel: 'etsy' as SaleChannel,
    feeConfig,
  });

  // Build line metadata
  interface LineMeta {
    transactionId: number;
    title: string;
    quantity: number;
    unitPrice: number;
    hamperId: string;
    variantId: string | null;
    requirements: Array<{
      categoryId: string;
      quantity: number;
      categoryName: string;
      pickRule: string;
    }>;
  }

  const lineMetas: LineMeta[] = [];
  const missingMappings: string[] = [];
  const skuFallbackSafetyCache: SkuFallbackSafetyCache = new Map();

  for (const tx of receipt.transactions) {
    const hamper = await prisma.hamper.findFirst({
      where: { etsyListingId: String(tx.listing_id) },
      include: {
        requirements: { include: { category: true } },
        variants: true,
      },
    });

    if (!hamper) {
      missingMappings.push(`"${decodeHtmlEntities(tx.title)}" (listing ${tx.listing_id})`);
      continue;
    }

    let variantId: string | null = null;
    if (hamper.hasVariants) {
      let variant = null;
      if (tx.product_id) {
        variant = await prisma.hamperVariant.findFirst({
          where: { hamperId: hamper.id, etsyProductId: String(tx.product_id) },
        });
      }
      if (!variant && tx.sku && await canUseSkuFallbackForTransaction(tx, skuFallbackSafetyCache)) {
        variant = await prisma.hamperVariant.findFirst({
          where: { hamperId: hamper.id, etsySku: tx.sku },
        });
      } else if (!variant && tx.sku) {
        logWorkflow('BULK_IMPORT', `Skipped variant lookup by duplicate or unverified SKU "${tx.sku}"`, {
          hamperId: hamper.id,
          listingId: tx.listing_id,
          sku: tx.sku,
        });
      }
      if (variant) {
        variantId = variant.id;
        // Update variant's sellingPrice from Etsy if not already set
        const etsyPrice = tx.price.amount / tx.price.divisor;
        if (variant.sellingPrice === null) {
          await prisma.hamperVariant.update({
            where: { id: variant.id },
            data: { sellingPrice: etsyPrice },
          });
        }
      }
    }

    const lineRequirements = hamper.requirements
      .filter(r => !r.isOptional)
      .map(r => ({
        categoryId: r.categoryId,
        quantity: Number(r.quantity),
        categoryName: r.category.name,
        pickRule: r.category.pickRule,
      }));

    lineMetas.push({
      transactionId: tx.transaction_id,
      title: tx.title,
      quantity: tx.quantity,
      unitPrice: tx.price.amount / tx.price.divisor,
      hamperId: hamper.id,
      variantId,
      requirements: lineRequirements,
    });
  }

  if (missingMappings.length > 0) {
    throw new Error(`Items missing hamper mapping: ${missingMappings.join(', ')}`);
  }

  // Skip stock validation for historical imports
  if (!isHistorical) {
    // Aggregate needs and check stock
    const aggregatedNeeds = new Map<string, {
      categoryId: string;
      categoryName: string;
      variantId: string | null;
      totalNeeded: number;
      pickRule: string;
    }>();

    for (const lineMeta of lineMetas) {
      for (const req of lineMeta.requirements) {
        const key = `${req.categoryId}-${lineMeta.variantId || 'all'}`;
        const existing = aggregatedNeeds.get(key);
        const totalNeeded = req.quantity * lineMeta.quantity;
        if (existing) {
          existing.totalNeeded += totalNeeded;
        } else {
          aggregatedNeeds.set(key, {
            categoryId: req.categoryId,
            categoryName: req.categoryName,
            variantId: lineMeta.variantId,
            totalNeeded,
            pickRule: req.pickRule,
          });
        }
      }
    }

    // Check stock availability
    for (const [, need] of aggregatedNeeds) {
      const allocation = need.variantId
        ? await allocateStockForVariantRequirement(
          need.variantId,
          need.categoryId,
          need.totalNeeded,
          need.pickRule as PickRule
        )
        : await allocateStockForRequirement(
          need.categoryId,
          need.totalNeeded,
          need.pickRule as PickRule
        );

      if (!allocation.fulfilled) {
        throw new Error(`Insufficient stock for ${need.categoryName}`);
      }
    }
  }

  // Create sale in transaction
  const sale = await prisma.$transaction(async (tx) => {
    let totalCost = 0;
    const saleLines: Array<{
      hamperId: string;
      variantId: string | null;
      description: string | null;
      quantity: number;
      unitPrice: number;
      lineCost: number;
      consumptions: Array<{ lotId: string; quantity: number; unitCost: number }>;
    }> = [];

    for (const lineMeta of lineMetas) {
      if (isHistorical) {
        saleLines.push({
          hamperId: lineMeta.hamperId,
          variantId: lineMeta.variantId,
          description: null,
          quantity: lineMeta.quantity,
          unitPrice: lineMeta.unitPrice,
          lineCost: 0,
          consumptions: [],
        });
        continue;
      }

      const consumptions: Array<{ lotId: string; quantity: number; unitCost: number }> = [];

      for (const requirement of lineMeta.requirements) {
        const totalNeeded = requirement.quantity * lineMeta.quantity;
        const allocation = lineMeta.variantId
          ? await allocateStockForVariantRequirement(
            lineMeta.variantId,
            requirement.categoryId,
            totalNeeded,
            requirement.pickRule as PickRule,
            tx
          )
          : await allocateStockForRequirement(
            requirement.categoryId,
            totalNeeded,
            requirement.pickRule as PickRule,
            tx
          );

        for (const alloc of allocation.allocations) {
          await tx.inventoryLot.update({
            where: { id: alloc.lotId },
            data: { remaining: { decrement: alloc.quantity } },
          });
          consumptions.push({
            lotId: alloc.lotId,
            quantity: alloc.quantity,
            unitCost: alloc.unitCost,
          });
          totalCost += alloc.quantity * alloc.unitCost;
        }
      }

      saleLines.push({
        hamperId: lineMeta.hamperId,
        variantId: lineMeta.variantId,
        description: null,
        quantity: lineMeta.quantity,
        unitPrice: lineMeta.unitPrice,
        lineCost: consumptions.reduce((sum, c) => sum + c.quantity * c.unitCost, 0),
        consumptions,
      });
    }

    const netRevenue = grossRevenue - fees.etsyFees;
    const margin = grossRevenue - (totalCost + fees.etsyFees);

    // Build notes in format: "Hamper Name(s) - Customer Name"
    const hamperNames = lineMetas.map(lm => decodeHtmlEntities(lm.title)).join(', ');
    const notes = `${hamperNames} - ${receipt.name}`;

    return tx.sale.create({
      data: {
        saleDate: new Date(receipt.create_timestamp * 1000),
        grossRevenue,
        etsyOrderId: String(receipt.receipt_id),
        saleChannel: 'etsy',
        notes,
        transactionFee: fees.transactionFee,
        postageTransactionFee: fees.postageTransactionFee,
        regulatoryFee: fees.regulatoryFee,
        processingFee: fees.processingFee,
        vatOnProcessingFee: fees.vatOnProcessingFee,
        listingFee: fees.listingFee,
        etsyFees: fees.etsyFees,
        postageCost,
        postageCharged,
        packagingOverhead,
        netRevenue,
        totalCost,
        margin,
        isHistorical,
        lines: {
          create: saleLines.map(sl => ({
            hamperId: sl.hamperId,
            variantId: sl.variantId,
            description: null,
            quantity: sl.quantity,
            unitPrice: sl.unitPrice,
            lineCost: sl.lineCost,
            consumptions: {
              create: sl.consumptions.map(c => ({
                lotId: c.lotId,
                quantity: c.quantity,
                unitCost: c.unitCost,
              })),
            },
          })),
        },
      },
    });
  });

  return sale;
}
