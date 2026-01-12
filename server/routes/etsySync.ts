import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { etsyClient } from '../lib/etsyClient';
import { generateReconciliationReport } from '../lib/etsy/reconciliation';
import { getSyncComparison, pushSyncUpdates } from '../lib/etsy/sync/inventory';
import { getPendingOrders, importOrder } from '../lib/etsy/sync/orders';
import { generateSkus, getPendingSkus, pushSkus } from '../lib/etsy/sync/skus';
import { getPendingPriceUpdates, pushPriceUpdates } from '../lib/etsy/sync/prices';
import { SyncHttpError } from '../lib/etsy/sync/errors';

const router = Router();

/**
 * GET /api/etsy/sync/comparison
 * Get comparison between Etsy inventory and local availability
 */
router.get('/comparison', async (req, res) => {
    try {
        const comparisons = await getSyncComparison();
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
                etsyProductId: string | null;
                quantity: number;
            }>;
            dryRun?: boolean;
        };

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        const result = await pushSyncUpdates(updates, requestDryRun);
        res.json(result);
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
        const orders = await getPendingOrders();
        res.json({ orders });
    } catch {
        res.status(500).json({ error: 'Failed to fetch pending orders' });
    }
});

/**
 * POST /api/etsy/sync/orders/import
 * Import a single Etsy order as a sale
 *
 * Validates:
 * - Hampers must exist for each listing
 * - Optional variant mapping (by SKU) if available
 * - Stock availability across all required categories
 *
 * Behavior:
 * - Hard error if any item lacks hamper mapping
 * - Hard error if insufficient stock for any required category
 * - Warns (but allows) variant SKU fallback to category-wide allocation
 */
router.post('/orders/import', async (req, res) => {
    try {
        const { receiptId, postageCost } = req.body as { receiptId: number; postageCost: number };
        const result = await importOrder(receiptId, postageCost);
        res.json(result);
    } catch (error) {
        if (error instanceof SyncHttpError) {
            return res.status(error.status).json(error.body);
        }
        const message = error instanceof Error ? error.message : 'Failed to import order';
        res.status(500).json({ error: message });
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

/**
 * POST /api/etsy/sync/skus/generate
 * Generate SKUs for all variants that don't have one
 */
router.post('/skus/generate', async (req, res) => {
    try {
        const result = await generateSkus();
        res.json(result);
    } catch {
        res.status(500).json({ error: 'Failed to generate SKUs' });
    }
});

/**
 * GET /api/etsy/sync/skus/pending
 * Get variants that have local SKUs but Etsy has empty/different SKUs
 */
router.get('/skus/pending', async (req, res) => {
    try {
        const result = await getPendingSkus();
        res.json(result);
    } catch {
        res.status(500).json({ error: 'Failed to get pending SKUs' });
    }
});

/**
 * POST /api/etsy/sync/skus/push
 * Push local SKUs to Etsy for variants where they differ
 *
 * Body: { listingIds?: string[] } - optional filter to specific listings
 */
router.post('/skus/push', async (req, res) => {
    try {
        const { listingIds } = req.body as { listingIds?: string[] };
        const result = await pushSkus(listingIds);
        res.json(result);
    } catch {
        res.status(500).json({ error: 'Failed to push SKUs to Etsy' });
    }
});

/**
 * GET /api/etsy/sync/prices/pending
 * Get local vs Etsy price comparisons (includes in-sync rows; use `needsSync` to filter)
 */
router.get('/prices/pending', async (req, res) => {
    try {
        const result = await getPendingPriceUpdates();
        res.json(result);
    } catch {
        res.status(500).json({ error: 'Failed to get pending price updates' });
    }
});

/**
 * POST /api/etsy/sync/prices/push
 * Push local variant prices to Etsy
 */
router.post('/prices/push', async (req, res) => {
    try {
        const { updates } = req.body as {
            updates: Array<{
                etsyListingId: string;
                etsySku: string | null;
                etsyProductId: string | null;
                price: number
            }>
        };
        const result = await pushPriceUpdates(updates);
        res.json(result);
    } catch {
        res.status(500).json({ error: 'Failed to push prices to Etsy' });
    }
});

export default router;
