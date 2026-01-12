import { prisma } from '../../prisma';
import { etsyClient } from '../../etsyClient';
import {
    ThrottleManager,
    isDryRunEnabled,
} from '../safety';
import {
    logWorkflow,
    startLogSession,
    endLogSession,
} from '../debugLogger';
import {
    findEtsyProductByIdentifiers,
    findEtsyProductByVariantName,
    findItemByEtsyProduct,
} from '../matching';
import { EtsyInventory, EtsyInventoryUpdateProduct } from '../types';

export interface PriceUpdate {
    etsyListingId: string;
    etsySku: string | null;
    etsyProductId: string | null;
    price: number;
}

/**
 * Get variants that have price differences between local and Etsy
 * Logic adapted for PUSH sync (Local -> Etsy):
 * - Only sync if Local price is set (cannot push null)
 * - Difference > tolerance
 */
export async function getPendingPriceUpdates() {
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

        const updates: Array<{
            hamperId: string;
            hamperName: string;
            etsyListingId: string;
            variantId: string;
            variantName: string;
            etsySku: string | null;
            etsyProductId: string | null;
            localPrice: number | null;
            etsyPrice: number;
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

            if (hamper.hasVariants && hamper.variants.length > 0) {
                for (const variant of hamper.variants) {
                    const etsyProduct =
                        findEtsyProductByIdentifiers(products, {
                            etsySku: variant.etsySku,
                            etsyProductId: variant.etsyProductId,
                        }) ??
                        findEtsyProductByVariantName(products, variant.name);

                    if (!etsyProduct) continue;

                    const offering = etsyProduct.offerings?.[0];
                    if (!offering) continue;

                    const etsyPrice = offering.price.amount / offering.price.divisor;
                    const localPrice = Number(variant.sellingPrice ?? hamper.sellingPrice);
                    const needsSync = Math.abs(localPrice - etsyPrice) > 0.001;

                    updates.push({
                        hamperId: hamper.id,
                        hamperName: hamper.name,
                        etsyListingId: hamper.etsyListingId!,
                        variantId: variant.id,
                        variantName: variant.name,
                        etsySku: etsyProduct.sku?.trim() ? etsyProduct.sku : null,
                        etsyProductId: String(etsyProduct.product_id),
                        localPrice,
                        etsyPrice,
                        needsSync,
                    });
                }
            } else {
                const product = products[0];
                const offering = product?.offerings?.[0];
                if (!offering) continue;

                const etsyPrice = offering.price.amount / offering.price.divisor;
                const localPrice = Number(hamper.sellingPrice);
                const needsSync = Math.abs(localPrice - etsyPrice) > 0.001;

                updates.push({
                    hamperId: hamper.id,
                    hamperName: hamper.name,
                    etsyListingId: hamper.etsyListingId!,
                    variantId: `default:${hamper.id}`,
                    variantName: 'Default',
                    etsySku: product.sku?.trim() ? product.sku : null,
                    etsyProductId: String(product.product_id),
                    localPrice,
                    etsyPrice,
                    needsSync,
                });
            }
        }

        return {
            updates,
            count: updates.length,
            needsSyncCount: updates.filter((u) => u.needsSync).length,
        };
    } catch (error) {
        console.error('Error getting pending price updates:', error);
        throw error;
    }
}

/**
 * Group updates by listing ID
 */
function groupPriceUpdatesByListing(updates: PriceUpdate[]) {
    const grouped = new Map<string, Array<{ etsySku: string | null; etsyProductId: string | null; price: number }>>();

    for (const update of updates) {
        const existing = grouped.get(update.etsyListingId) || [];
        existing.push({
            etsySku: update.etsySku,
            etsyProductId: update.etsyProductId,
            price: update.price
        });
        grouped.set(update.etsyListingId, existing);
    }

    return grouped;
}

/**
 * Update logic for Price Sync (Push)
 */
export async function pushPriceUpdates(
    updates: PriceUpdate[],
    requestDryRun?: boolean
) {
    const sessionId = startLogSession('PRICE_PUSH');
    const dryRun = requestDryRun === true || isDryRunEnabled();

    try {
        logWorkflow('PRICE_PUSH', `Processing ${updates.length} price updates`);

        const updatesByListing = groupPriceUpdatesByListing(updates);
        const results: Array<{
            listingId: string;
            success: boolean;
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

                const updatedProducts = buildPriceUpdateProducts(
                    currentInventory,
                    listingUpdates
                );

                if (dryRun) {
                    // Just log in dry run
                    console.log(`[DryRun] Would update prices for listing ${listingId}`, updatedProducts);
                    results.push({ listingId, success: true });
                } else {
                    await etsyClient.updateListingInventory(
                        parseInt(listingId),
                        updatedProducts,
                        currentInventory
                    );
                    results.push({ listingId, success: true });
                }

            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`Error updating listing ${listingId}:`, message);
                results.push({ listingId, success: false, error: message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;

        endLogSession(sessionId, {
            totalUpdated: successCount,
            totalErrors: errorCount,
        });

        return {
            success: errorCount === 0,
            updated: successCount,
            errors: errorCount,
            results,
        };
    } catch (error) {
        console.error('Error pushing prices to Etsy:', error);
        logWorkflow('PRICE_PUSH', 'ERROR', { error: String(error) });
        endLogSession(sessionId, { success: false, error: String(error) });
        throw error;
    }
}

function buildPriceUpdateProducts(
    currentInventory: EtsyInventory,
    updates: Array<{ etsySku: string | null; etsyProductId: string | null; price: number }>
): EtsyInventoryUpdateProduct[] {
    const defaultVariantUpdate = updates.find((u) => u.etsySku === null && u.etsyProductId === null);

    return currentInventory.products.map((product) => {
        // Match by SKU first, then product_id
        const productUpdate = findItemByEtsyProduct(updates, product);

        // Determine new price: Update > Default Update > Existing
        // Note: Offerings usually share same price in simple variations, 
        // but can differ if price_on_property is set.
        // We apply the update price to ALL matching offerings.

        return {
            sku: product.sku,
            property_values: product.property_values.map((pv) => ({
                property_id: pv.property_id,
                property_name: pv.property_name,
                value_ids: pv.value_ids,
                values: pv.values,
            })),
            offerings: product.offerings.map((offering) => ({
                quantity: offering.quantity, // Preserve quantity
                price: (productUpdate ?? defaultVariantUpdate)?.price ?? (offering.price.amount / offering.price.divisor),
                is_enabled: offering.is_enabled,
                readiness_state_id: offering.readiness_state_id,
            })),
        };
    });
}
