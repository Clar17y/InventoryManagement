import { etsyClient } from '../etsyClient';
import { EtsyInventory, EtsyListingWithInventory } from './types';

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CACHE_TTL_MS = 30000; // 30 seconds

function getCacheTtlMs(): number {
    const envTtl = process.env.ETSY_INVENTORY_CACHE_TTL_MS;
    if (envTtl) {
        const parsed = parseInt(envTtl, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_CACHE_TTL_MS;
}

// =============================================================================
// Cache State
// =============================================================================

interface CacheEntry {
    expiresAt: number;
    value: EtsyInventory;
}

const cache = new Map<number, CacheEntry>();
const inflight = new Map<number, Promise<EtsyInventory>>();

// =============================================================================
// Public API
// =============================================================================

/**
 * Get listing inventory with caching.
 * - Returns cached value if within TTL
 * - Deduplicates concurrent requests for the same listing
 * - Falls through to etsyClient.getListingInventory() on cache miss
 */
export async function getListingInventoryCached(
    listingId: number
): Promise<EtsyInventory> {
    const now = Date.now();

    // Check cache first
    const cached = cache.get(listingId);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    // Check if request is already in-flight
    const existing = inflight.get(listingId);
    if (existing) {
        return existing;
    }

    // Create new request and store in inflight map
    const promise = fetchAndCache(listingId);
    inflight.set(listingId, promise);

    try {
        return await promise;
    } finally {
        // Clean up inflight entry after completion
        inflight.delete(listingId);
    }
}

/**
 * Invalidate a specific listing's cache entry.
 * Call this after any successful updateListingInventory().
 */
export function invalidateListingInventory(listingId: number): void {
    cache.delete(listingId);
}

/**
 * Clear the entire inventory cache.
 * Primarily for testing purposes.
 */
export function clearInventoryCache(): void {
    cache.clear();
    // Note: we don't clear inflight - let in-progress requests complete
}

/**
 * Get cache stats for debugging/monitoring.
 */
export function getInventoryCacheStats(): {
    cacheSize: number;
    inflightSize: number;
    ttlMs: number;
} {
    return {
        cacheSize: cache.size,
        inflightSize: inflight.size,
        ttlMs: getCacheTtlMs(),
    };
}

// =============================================================================
// Internal Helpers
// =============================================================================

async function fetchAndCache(listingId: number): Promise<EtsyInventory> {
    const inventory = await etsyClient.getListingInventory(listingId);

    cache.set(listingId, {
        expiresAt: Date.now() + getCacheTtlMs(),
        value: inventory,
    });

    return inventory;
}

/**
 * Populate cache from batch results.
 * Call this after using getListingsByListingIds with Inventory include.
 */
export function populateCacheFromBatchResults(
    listings: Array<{ listing_id: number; inventory?: EtsyInventory }>
): void {
    const now = Date.now();
    const ttlMs = getCacheTtlMs();
    for (const listing of listings) {
        if (listing.inventory) {
            cache.set(listing.listing_id, {
                expiresAt: now + ttlMs,
                value: listing.inventory,
            });
        }
    }
}

/**
 * Get listing inventories with cache awareness using batch API.
 * Returns a Map of listingId -> EtsyInventory.
 * Uses cache for already-cached listings and batches uncached ones.
 */
export async function getListingInventoriesBatched(
    listingIds: number[]
): Promise<Map<number, EtsyInventory>> {
    const result = new Map<number, EtsyInventory>();
    const uncachedIds: number[] = [];
    const now = Date.now();

    // Check cache first
    for (const id of listingIds) {
        const cached = cache.get(id);
        if (cached && cached.expiresAt > now) {
            result.set(id, cached.value);
        } else {
            uncachedIds.push(id);
        }
    }

    // Batch fetch uncached
    if (uncachedIds.length > 0) {
        const listings = await etsyClient.getListingsByListingIds(uncachedIds, ['Inventory']);
        populateCacheFromBatchResults(listings);
        for (const listing of listings) {
            if (listing.inventory) {
                result.set(listing.listing_id, listing.inventory);
            }
        }
    }

    return result;
}
