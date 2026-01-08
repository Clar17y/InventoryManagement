import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { etsyClient } from '../lib/etsyClient';
import {
  isDryRunEnabled,
  computeDiff,
  shouldSkipUpdate,
  ThrottleManager,
  buildInventoryUpdateProducts,
  groupUpdatesByListing,
} from '../lib/etsy/safety';
import { generateReconciliationReport } from '../lib/etsy/reconciliation';

const router = Router();

/**
 * GET /api/etsy/sync/comparison
 * Get comparison between Etsy inventory and local availability
 */
router.get('/comparison', async (req, res) => {
    try {
        // Get all hampers with Etsy listing IDs
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
            // Fetch Etsy inventory for this listing
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
                // For hampers with variants
                for (const variant of hamper.variants) {
                    // Variants must have an Etsy SKU to be syncable
                    if (!variant.etsySku) continue;

                    // Calculate local availability for this variant
                    let canMake = Infinity;

                    const mappedByCategory = new Map(variant.mappings.map(m => [m.categoryId, m]));

                    for (const requirement of hamper.requirements) {
                        if (requirement.isOptional) continue;

                        const qtyNeeded = Number(requirement.quantity);
                        if (!qtyNeeded) continue;

                        const mapping = mappedByCategory.get(requirement.categoryId);

                        if (mapping) {
                            // Use mapped product's stock only
                            const productStock = mapping.product.lots.reduce(
                                (sum, lot) => sum + Number(lot.remaining),
                                0
                            );
                            const canMakeFromProduct = Math.floor(productStock / qtyNeeded);
                            canMake = Math.min(canMake, canMakeFromProduct);
                        } else {
                            // Fall back to category-wide aggregation for unmapped requirements
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

                    // Find Etsy quantity for this SKU
                    let etsyQuantity = 0;
                    if (etsyInventory && variant.etsySku) {
                        const etsyProduct = etsyInventory.products.find(
                            p => p.sku === variant.etsySku
                        );
                        if (etsyProduct && etsyProduct.offerings.length > 0) {
                            etsyQuantity = etsyProduct.offerings[0].quantity;
                        }
                    }

                    const difference = canMake - etsyQuantity;

                    variantComparisons.push({
                        etsySku: variant.etsySku,
                        variantId: variant.id,
                        variantName: variant.name,
                        etsyQuantity,
                        inventoryQuantity: canMake,
                        difference,
                        needsSync: difference !== 0,
                    });
                }
            } else {
                // For hampers without variants
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

                // Find Etsy quantity (first product with quantity in offerings)
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

        res.json({ comparisons });
    } catch (error) {
        console.error('Error getting sync comparison:', error);
        res.status(500).json({ error: 'Failed to get sync comparison' });
    }
});

/**
 * POST /api/etsy/sync/push
 * Push inventory updates to Etsy
 *
 * Safety features:
 * - Dry run mode: Set `dryRun: true` in body or ETSY_DRY_RUN=true env var
 * - Throttling: Configurable via ETSY_THROTTLE_DELAY_MS and ETSY_MAX_UPDATES_PER_MIN
 * - Idempotency: Skips updates where quantities haven't changed
 */
router.post('/push', async (req, res) => {
    try {
        const { updates, dryRun: requestDryRun } = req.body as {
            updates: Array<{
                etsyListingId: string;
                etsySku: string | null;
                quantity: number;
            }>;
            dryRun?: boolean;
        };

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        // Check dry run mode (request-level or global env var)
        const dryRun = requestDryRun === true || isDryRunEnabled();

        // Group updates by listing ID
        const updatesByListing = groupUpdatesByListing(updates);

        // Results tracking
        const results: Array<{
            listingId: string;
            success: boolean;
            skipped: boolean;
            dryRun: boolean;
            changes?: Array<{ sku: string; currentQuantity: number; newQuantity: number }>;
            error?: string;
        }> = [];

        // Throttle manager for rate limiting
        const throttle = new ThrottleManager();

        // Process each listing
        for (const [listingId, listingUpdates] of updatesByListing) {
            try {
                // Wait for rate limit slot
                if (!dryRun) {
                    await throttle.waitForSlot();
                }

                // Get current inventory
                const currentInventory = await etsyClient.getListingInventory(
                    parseInt(listingId)
                );

                // Build update products with current prices preserved
                const updatedProducts = buildInventoryUpdateProducts(
                    currentInventory,
                    listingUpdates
                );

                // Compute diff for reporting
                const diff = computeDiff(currentInventory, updatedProducts);

                // Check idempotency - skip if no changes needed
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
                    // Dry run - return diff without making changes
                    results.push({
                        listingId,
                        success: true,
                        skipped: false,
                        dryRun: true,
                        changes: diff.changes,
                    });
                } else {
                    // Actually push update to Etsy
                    await etsyClient.updateListingInventory(
                        parseInt(listingId),
                        updatedProducts
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

        // Summary counts
        const successCount = results.filter(r => r.success && !r.skipped).length;
        const skippedCount = results.filter(r => r.skipped).length;
        const errorCount = results.filter(r => !r.success).length;

        res.json({
            success: errorCount === 0,
            dryRun,
            updated: successCount,
            skipped: skippedCount,
            errors: errorCount,
            results,
        });
    } catch (error) {
        console.error('Error pushing sync updates:', error);
        const message = error instanceof Error ? error.message : 'Failed to push updates';
        res.status(500).json({ success: false, error: message, updated: 0 });
    }
});

/**
 * GET /api/etsy/sync/orders/pending
 * Get Etsy orders that haven't been imported as sales yet
 */
router.get('/orders/pending', async (req, res) => {
    try {
        // Get receipts from Etsy (last 30 days by default)
        const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        const { receipts } = await etsyClient.getReceipts(thirtyDaysAgo, 100);

        // Get all existing sales with Etsy order IDs
        const existingSales = await prisma.sale.findMany({
            where: { etsyOrderId: { not: null } },
            select: { etsyOrderId: true },
        });
        const importedOrderIds = new Set(existingSales.map(s => s.etsyOrderId));

        // Filter to only pending (not yet imported) and paid orders
        const pendingOrders = receipts
            .filter(r => r.is_paid && !importedOrderIds.has(String(r.receipt_id)))
            .map(receipt => ({
                receiptId: receipt.receipt_id,
                buyerName: receipt.name,
                createdAt: new Date(receipt.create_timestamp * 1000).toISOString(),
                isPaid: receipt.is_paid,
                isShipped: receipt.is_shipped,
                grandTotal: receipt.grandtotal.amount / receipt.grandtotal.divisor,
                subtotal: receipt.subtotal.amount / receipt.subtotal.divisor,
                shippingCost: receipt.total_shipping_cost.amount / receipt.total_shipping_cost.divisor,
                items: receipt.transactions.map(tx => ({
                    transactionId: tx.transaction_id,
                    listingId: tx.listing_id,
                    title: tx.title,
                    quantity: tx.quantity,
                    price: tx.price.amount / tx.price.divisor,
                    sku: tx.sku,
                })),
            }));

        res.json({ orders: pendingOrders });
    } catch (error) {
        console.error('Error fetching pending orders:', error);
        res.status(500).json({ error: 'Failed to fetch pending orders' });
    }
});

/**
 * POST /api/etsy/sync/orders/import
 * Import an Etsy order as a sale
 */
router.post('/orders/import', async (req, res) => {
    try {
        const { receiptId, postageCost } = req.body as { receiptId: number; postageCost: number };

        if (!receiptId || postageCost === undefined) {
            return res.status(400).json({ error: 'receiptId and postageCost are required' });
        }

        const existing = await prisma.sale.findFirst({ where: { etsyOrderId: String(receiptId) } });
        if (existing) {
            return res.status(400).json({ error: 'Order already imported', saleId: existing.id });
        }

        const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        const { receipts } = await etsyClient.getReceipts(thirtyDaysAgo, 100);
        const receipt = receipts.find(r => r.receipt_id === receiptId);
        if (!receipt) return res.status(404).json({ error: 'Receipt not found on Etsy' });

        const [feeConfig, overheads] = await Promise.all([
            prisma.etsyFeeConfig.findFirst({ where: { isActive: true, effectiveTo: null } }),
            prisma.packagingOverhead.findMany({ where: { isActive: true, effectiveTo: null } }),
        ]);

        const packagingOverhead = overheads.reduce((sum, o) => sum + Number(o.costPerOrder), 0);
        const subtotal = receipt.subtotal.amount / receipt.subtotal.divisor;
        const postageCharged = receipt.total_shipping_cost.amount / receipt.total_shipping_cost.divisor;
        const grandTotal = receipt.grandtotal.amount / receipt.grandtotal.divisor;

        let etsyFees = 0, transactionFee = 0, postageTransactionFee = 0;
        let regulatoryFee = 0, processingFee = 0, vatOnProcessingFee = 0, listingFee = 0;

        if (feeConfig) {
            transactionFee = subtotal * Number(feeConfig.transactionFee);
            postageTransactionFee = postageCharged * Number(feeConfig.transactionFee);
            regulatoryFee = subtotal * Number(feeConfig.regulatoryFee);
            processingFee = grandTotal * Number(feeConfig.paymentFeePercent) + Number(feeConfig.paymentFeeFixed);
            vatOnProcessingFee = processingFee * Number(feeConfig.vatRate);
            listingFee = Number(feeConfig.listingFee) * receipt.transactions.length;
            etsyFees = transactionFee + postageTransactionFee + regulatoryFee + processingFee + vatOnProcessingFee + listingFee;
        }

        const saleLines = await Promise.all(receipt.transactions.map(async tx => {
            const hamper = await prisma.hamper.findFirst({ where: { etsyListingId: String(tx.listing_id) } });
            let variantId: string | null = null;
            if (hamper && tx.sku) {
                const variant = await prisma.hamperVariant.findFirst({ where: { hamperId: hamper.id, etsySku: tx.sku } });
                if (variant) variantId = variant.id;
            }
            return {
                hamperId: hamper?.id || null,
                variantId,
                description: hamper ? null : tx.title,
                quantity: tx.quantity,
                unitPrice: tx.price.amount / tx.price.divisor,
                lineCost: 0,
            };
        }));

        const netRevenue = subtotal + postageCharged - etsyFees - packagingOverhead;

        const sale = await prisma.sale.create({
            data: {
                saleDate: new Date(receipt.create_timestamp * 1000),
                etsyOrderId: String(receipt.receipt_id),
                saleChannel: 'etsy',
                grossRevenue: subtotal,
                postageCharged,
                postageCost,
                etsyFees,
                packagingOverhead,
                netRevenue,
                totalCost: 0,
                margin: netRevenue,
                isHistorical: true,
                transactionFee,
                postageTransactionFee,
                regulatoryFee,
                processingFee,
                vatOnProcessingFee,
                listingFee,
                lines: { create: saleLines },
            },
            include: { lines: true },
        });

        res.json({ success: true, sale: { id: sale.id, etsyOrderId: sale.etsyOrderId, lines: sale.lines.length } });
    } catch (error) {
        console.error('Error importing order:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to import order' });
    }
});

/**
 * GET /api/etsy/sync/reconciliation
 * Generate a reconciliation report comparing Etsy listings with local hampers
 *
 * Returns a report with:
 * - newListings: Etsy listings not yet imported as hampers
 * - changedSkus: SKUs that differ between local and Etsy
 * - variantsMissingSku: Local variants without etsySku set
 * - orphanedHampers: Local hampers with etsyListingId pointing to non-existent listings
 * - quantityDifferences: Listings where Etsy qty differs from computed can-make
 * - summary: Overview counts
 */
router.get('/reconciliation', async (req, res) => {
    try {
        const report = await generateReconciliationReport(etsyClient, prisma);
        res.json(report);
    } catch (error) {
        console.error('Error generating reconciliation report:', error);
        res.status(500).json({ error: 'Failed to generate reconciliation report' });
    }
});

export default router;
