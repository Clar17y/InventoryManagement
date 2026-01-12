# Etsy Inventory Caching Plan

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

## Proposed Approach (In-Memory + TTL + Inflight Dedup)
Add a small in-memory cache in the server process keyed by `listingId`.

**Key design points**
- **TTL-based**: cache each `getListingInventory(listingId)` response for a short TTL (e.g. 30s).
- **Inflight dedupe**: if multiple requests ask for the same `listingId` concurrently, share a single promise.
- **Invalidate on write**: after any successful `updateListingInventory(listingId, ...)`, invalidate that listing's cached entry immediately.
- **Configurable**: env var for TTL (and optionally max entries).

## Implementation Sketch
1. Create `server/lib/etsy/inventoryCache.ts`
   - `getListingInventoryCached(listingId: number): Promise<EtsyInventory>`
   - `invalidateListingInventory(listingId: number): void`
   - `clearInventoryCache(): void` (optional; useful for tests)
   - module-level maps:
     - `cache: Map<number, { expiresAt: number; value: EtsyInventory }>`
     - `inflight: Map<number, Promise<EtsyInventory>>`
   - `ETSY_INVENTORY_CACHE_TTL_MS` default `30000`

2. Swap call-sites to use the cached helper
   - Replace `etsyClient.getListingInventory(...)` with `getListingInventoryCached(...)` in:
     - `server/lib/etsy/sync/inventory.ts`
     - `server/lib/etsy/sync/skus.ts`
     - `server/lib/etsy/sync/prices.ts`
     - (optional) reconciliation paths if they call inventory repeatedly

3. Invalidate on updates
   - After successful `etsyClient.updateListingInventory(...)`, call `invalidateListingInventory(listingId)` in:
     - `pushSyncUpdates` (inventory push)
     - `pushSkus`
     - `pushPriceUpdates`

4. Add server tests
   - New test file (e.g. `server/__tests__/etsy/inventoryCache.test.ts`) that:
     - verifies repeated calls within TTL only fetch once
     - verifies concurrent calls share a single fetch
     - verifies invalidation forces refetch
   - Use a stub/mocked `etsyClient.getListingInventory` and fake timers.

## Risks / Notes
- This is **per-process** caching; if you run multiple server instances, each has its own cache (still helpful).
- TTL should remain short to avoid hiding real Etsy changes for too long.
- Invalidation must happen on *all* code paths that update listing inventory.

## Rollout
- Start with `getSyncComparison` + `getPendingSkus` + `getPendingPriceUpdates` (read-heavy paths).
- Add invalidation to all push endpoints.
- Monitor Etsy rate-limit errors and response times before/after.
