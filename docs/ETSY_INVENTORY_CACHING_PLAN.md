# Etsy Inventory Caching (Implemented)

Status: implemented in `server/lib/etsy/inventoryCache.ts` and used by:
- `server/lib/etsy/sync/inventory.ts`
- `server/lib/etsy/sync/skus.ts`
- `server/lib/etsy/sync/prices.ts`

Includes:
- TTL-based in-memory cache + inflight dedupe for `getListingInventory`
- Cache invalidation after writes
- Batch inventory fetch via `getListingsByListingIds(..., ['Inventory'])` when possible

## Why
Several Etsy sync endpoints fetch listing inventory (`etsyClient.getListingInventory(listingId)`) per hamper/listing:
- `server/lib/etsy/sync/inventory.ts` (`getSyncComparison`)
- `server/lib/etsy/sync/skus.ts` (`getPendingSkus`, `pushSkus`)
- `server/lib/etsy/sync/prices.ts` (`getPendingPriceUpdates`, `pushPriceUpdates`)

When the UI refreshes multiple tabs (or multiple users/actions hit these endpoints), we can end up requesting the same listing inventory repeatedly within seconds.

## Goals
- Reduce duplicate Etsy API calls for the same listing.
- Keep behaviour safe: never use stale inventory after we push updates.
- Avoid adding external infrastructure (Redis) unless needed.

## Approach (In-Memory + TTL + Inflight Dedup)
Add a small in-memory cache in the server process keyed by `listingId`.

**Key design points**
- **TTL-based**: cache each `getListingInventory(listingId)` response for a short TTL (e.g. 30s).
- **Inflight dedupe**: if multiple requests ask for the same `listingId` concurrently, share a single promise.
- **Invalidate on write**: after any successful `updateListingInventory(listingId, ...)`, invalidate that listing's cached entry immediately.
- **Configurable**: env var for TTL (and optionally max entries).

## Implementation Notes
- Environment variable: `ETSY_INVENTORY_CACHE_TTL_MS` (default `30000`)
- Batch helper: `getListingInventoriesBatched(listingIds: number[])`
- Invalidation helper: `invalidateListingInventory(listingId: number)`

## Risks / Notes
- This is **per-process** caching; if you run multiple server instances, each has its own cache (still helpful).
- TTL should remain short to avoid hiding real Etsy changes for too long.
- Invalidation must happen on *all* code paths that update listing inventory.

## Rollout
- Monitor Etsy rate-limit errors and response times before/after.
