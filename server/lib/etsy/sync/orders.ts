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
            title: tx.title,
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

export async function importOrder(receiptId: number, postageCost: number) {
  const sessionId = startLogSession('ORDER_IMPORT');
  try {
    logWorkflow('IMPORT', 'Starting order import', { receiptId, postageCost });

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
        missingMappings.push(`"${tx.title}" (listing ${tx.listing_id})`);
        continue;
      }

      let variantId: string | null = null;
      if (hamper.hasVariants) {
        let variant = null;

        if (tx.sku) {
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
        }

        if (!variant && tx.product_id) {
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
            `"${tx.title}" ${identifier} not mapped to variant, using category-wide allocation`
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

    logWorkflow('IMPORT:PHASE2', 'Starting stock availability pre-check');
    const stockShortages: Array<{
      category: string;
      product?: string;
      need: number;
      have: number;
    }> = [];

    for (const [key, need] of aggregatedNeeds) {
      logWorkflow('IMPORT:PHASE2', `Checking stock for ${key}`, {
        categoryId: need.categoryId,
        categoryName: need.categoryName,
        variantId: need.variantId,
        totalNeeded: need.totalNeeded,
        pickRule: need.pickRule,
      });

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
        stockShortages.push({
          category: allocation.categoryName,
          product: allocation.productName,
          need: need.totalNeeded,
          have,
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
      throw new SyncHttpError(400, {
        error: 'Insufficient stock to fulfill order',
        shortages: stockShortages,
      });
    }

    logWorkflow('IMPORT:PHASE3', 'Starting transactional import');
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
        const consumptions: Array<{
          lotId: string;
          quantity: number;
          unitCost: number;
        }> = [];

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

      const createdSale = await tx.sale.create({
        data: {
          saleDate: new Date(receipt.create_timestamp * 1000),
          grossRevenue,
          etsyOrderId: String(receipt.receipt_id),
          etsyFees: fees.etsyFees,
          postageCost,
          postageCharged,
          packagingOverhead,
          netRevenue,
          totalCost,
          margin,
          isHistorical: false,
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
