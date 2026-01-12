import {
  EtsyInventory,
  EtsyInventoryUpdateProduct,
  DryRunResult,
  DryRunChange,
  ThrottleConfig,
  ThrottleDeps,
} from './types';
import { findItemByEtsyProduct } from './matching';

// =============================================================================
// Dry Run Mode
// =============================================================================

/**
 * Check if dry run mode is enabled globally via environment variable.
 */
export function isDryRunEnabled(): boolean {
  return process.env.ETSY_DRY_RUN === 'true';
}

/**
 * Compute the difference between current inventory and proposed updates.
 *
 * @param current - Current inventory state from Etsy
 * @param updates - Proposed inventory updates
 * @returns DryRunResult with changes that would be made
 */
export function computeDiff(
  current: EtsyInventory,
  updates: EtsyInventoryUpdateProduct[]
): DryRunResult {
  const changes: DryRunChange[] = [];

  for (const update of updates) {
    const existingProduct = current.products.find((p) => p.sku === update.sku);
    if (!existingProduct) continue;

    const currentQty = existingProduct.offerings[0]?.quantity ?? 0;
    const newQty = update.offerings[0]?.quantity ?? currentQty;

    if (currentQty !== newQty) {
      changes.push({
        sku: update.sku,
        currentQuantity: currentQty,
        newQuantity: newQty,
      });
    }
  }

  return {
    wouldUpdate: changes.length > 0,
    listingId: current.listing_id,
    changes,
  };
}

// =============================================================================
// Idempotency
// =============================================================================

/**
 * Check if an update should be skipped because no changes are needed.
 *
 * @param current - Current inventory state from Etsy
 * @param updates - Proposed inventory updates
 * @returns true if update should be skipped (no changes)
 */
export function shouldSkipUpdate(
  current: EtsyInventory,
  updates: EtsyInventoryUpdateProduct[]
): boolean {
  const diff = computeDiff(current, updates);
  return !diff.wouldUpdate;
}

// =============================================================================
// Throttling
// =============================================================================

const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  delayMs: 1000,
  maxUpdatesPerMinute: 30,
};

/**
 * Default sleep implementation using setTimeout
 */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ThrottleManager - Rate limits API calls with configurable delays.
 *
 * Accepts injectable dependencies for testability:
 * - now(): current timestamp function
 * - sleep(): async delay function
 */
export class ThrottleManager {
  private timestamps: number[] = [];
  private config: ThrottleConfig;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;

  constructor(config?: Partial<ThrottleConfig>, deps?: ThrottleDeps) {
    this.config = {
      delayMs:
        config?.delayMs ??
        parseInt(process.env.ETSY_THROTTLE_DELAY_MS || String(DEFAULT_THROTTLE_CONFIG.delayMs), 10),
      maxUpdatesPerMinute:
        config?.maxUpdatesPerMinute ??
        parseInt(
          process.env.ETSY_MAX_UPDATES_PER_MIN || String(DEFAULT_THROTTLE_CONFIG.maxUpdatesPerMinute),
          10
        ),
    };
    this.now = deps?.now ?? Date.now;
    this.sleep = deps?.sleep ?? defaultSleep;
  }

  /**
   * Wait for an available slot within rate limits.
   *
   * This method:
   * 1. Cleans up timestamps older than 1 minute
   * 2. If at rate limit, waits until a slot frees up
   * 3. Applies configured delay between updates
   * 4. Records the current timestamp
   */
  async waitForSlot(): Promise<void> {
    const currentTime = this.now();
    const oneMinuteAgo = currentTime - 60000;

    // Clean old timestamps
    this.timestamps = this.timestamps.filter((t) => t > oneMinuteAgo);

    // Check rate limit
    if (this.timestamps.length >= this.config.maxUpdatesPerMinute) {
      // Wait until the oldest timestamp expires
      const waitTime = this.timestamps[0] - oneMinuteAgo;
      if (waitTime > 0) {
        await this.sleep(waitTime);
        // Recurse to recheck after waiting
        return this.waitForSlot();
      }
    }

    // Apply delay between updates
    if (this.config.delayMs > 0) {
      await this.sleep(this.config.delayMs);
    }

    // Record this update
    this.timestamps.push(this.now());
  }

  /**
   * Get current rate limit status
   */
  getStatus(): { updatesInLastMinute: number; maxUpdatesPerMinute: number } {
    const currentTime = this.now();
    const oneMinuteAgo = currentTime - 60000;
    this.timestamps = this.timestamps.filter((t) => t > oneMinuteAgo);

    return {
      updatesInLastMinute: this.timestamps.length,
      maxUpdatesPerMinute: this.config.maxUpdatesPerMinute,
    };
  }

  /**
   * Reset the throttle manager (for tests)
   */
  reset(): void {
    this.timestamps = [];
  }
}

// =============================================================================
// Batch Update Helpers
// =============================================================================

/**
 * Group updates by listing ID for batch processing.
 */
export function groupUpdatesByListing(
  updates: Array<{
    etsyListingId: string;
    etsySku: string | null;
    etsyProductId: string | null;
    quantity: number;
  }>
): Map<string, Array<{ etsySku: string | null; etsyProductId: string | null; quantity: number }>> {
  const grouped = new Map<string, Array<{ etsySku: string | null; etsyProductId: string | null; quantity: number }>>();

  for (const update of updates) {
    const existing = grouped.get(update.etsyListingId) || [];
    existing.push({ etsySku: update.etsySku, etsyProductId: update.etsyProductId, quantity: update.quantity });
    grouped.set(update.etsyListingId, existing);
  }

  return grouped;
}

/**
 * Convert grouped updates to EtsyInventoryUpdateProduct format.
 *
 * @param currentInventory - Current inventory to get price/enabled state from
 * @param updates - Updates to apply (matches by SKU first, then product_id)
 * @returns Products in Etsy API format
 */
export function buildInventoryUpdateProducts(
  currentInventory: EtsyInventory,
  updates: Array<{ etsySku: string | null; etsyProductId: string | null; quantity: number }>
): EtsyInventoryUpdateProduct[] {
  const defaultVariantUpdate = updates.find((u) => u.etsySku === null && u.etsyProductId === null);

  if (defaultVariantUpdate && currentInventory.products.length !== 1) {
    throw new Error(
      'Default-variant update is only supported for listings with a single product. Provide explicit product IDs or SKUs for multi-variant listings.'
    );
  }

  return currentInventory.products.map((product) => {
    // Match by SKU first (preferred), then fall back to product_id
    const productUpdate = findItemByEtsyProduct(updates, product);

    return {
      sku: product.sku,
      // Include property_values to identify variants (required when SKUs are empty)
      property_values: product.property_values.map((pv) => ({
        property_id: pv.property_id,
        property_name: pv.property_name,
        value_ids: pv.value_ids,
        values: pv.values,
      })),
      offerings: product.offerings.map((offering) => ({
        quantity: (productUpdate ?? defaultVariantUpdate)?.quantity ?? offering.quantity,
        price: offering.price.amount / offering.price.divisor,
        is_enabled: offering.is_enabled,
        readiness_state_id: offering.readiness_state_id,
      })),
    };
  });
}
