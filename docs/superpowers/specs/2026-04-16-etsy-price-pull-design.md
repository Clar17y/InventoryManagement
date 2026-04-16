# Etsy Price Pull Design

## Summary

The hamper Etsy sync flow currently supports price comparison and `local -> Etsy` price pushes, but it does not support `Etsy -> local` price updates. This creates drift when prices are changed in the Etsy shop, because later sync actions can push stale local prices back to Etsy.

This design makes Etsy the source of truth during listing import for any already-linked hamper or variant price, while preserving the existing manual push flow for intentional local edits. It also adds an explicit `Pull from Etsy` action to the Price Sync tab so price differences can be applied selectively without running a full import.

## Goals

- Update local hamper and variant prices from Etsy during `Import from Etsy`.
- Keep explicit bidirectional price sync controls in the Price Sync tab.
- Preserve the current `Push to Etsy` flow for intentional local pricing changes.
- Reuse existing listing and variant matching rules instead of introducing a separate matching model.

## Non-Goals

- Do not update prices for hampers or variants that are not Etsy-linked.
- Do not mutate local prices merely by opening or refreshing the Etsy sync panel.
- Do not change requirement mappings or broader hamper structure outside the existing import behavior.
- Do not change inventory quantity sync behavior.

## User-Facing Behavior

### Import From Etsy

`Import from Etsy` will continue importing and refreshing Etsy-linked hamper records. In addition:

- For non-variant listings, if the linked hamper price differs from the Etsy listing price, update `Hamper.sellingPrice` to match Etsy.
- For variant listings, if a linked local variant matches an Etsy product and the prices differ, update `HamperVariant.sellingPrice` to match Etsy.
- Unlinked local hampers and variants remain unchanged because there is no reliable Etsy source price to pull.

This makes import the normal recovery path when Etsy prices were changed in the shop UI.

### Price Sync Tab

The Price Sync tab will continue showing local/Etsy price comparisons and will support two explicit actions:

- `Push to Etsy`: update Etsy prices from the selected local values.
- `Pull from Etsy`: update local prices from the selected Etsy values.

Both actions operate only on selected rows with differences. This keeps the sync direction explicit and avoids surprise local writes.

## Matching Rules

Price pull and import refresh must use the same variant matching order already used elsewhere in Etsy sync:

1. Match by `etsyProductId`
2. Then by `etsySku`
3. Then by Etsy-derived variant name when there is a single clear match

For non-variant listings, the update target is the linked hamper itself.

No new matching identifiers are introduced in this change.

## Server Design

### 1. Extend Etsy Import Price Refresh

Update the existing Etsy import route so that price differences are refreshed for linked records instead of only filling missing prices.

Current behavior:

- import creates hampers and variants
- import links missing `etsyProductId` / `etsySku`
- import only sets local variant price when local `sellingPrice` is currently `null`

New behavior:

- when a linked existing hamper maps to a non-variant Etsy listing, update `Hamper.sellingPrice` if it differs from Etsy
- when a linked existing variant maps to an Etsy product, update `HamperVariant.sellingPrice` if it differs from Etsy
- record a `set_price` detail when a local price is changed from Etsy during import

This keeps Etsy as source of truth during import for linked records.

### 2. Add Local Price Pull Endpoint

Add a new Etsy sync route for `Etsy -> local` price application. The route will accept selected rows from the Price Sync tab and update local records:

- variant row: update `HamperVariant.sellingPrice`
- default/non-variant row: update `Hamper.sellingPrice`

The route should validate identifiers with the same contract-driven approach already used by other Etsy sync endpoints.

Proposed route:

- `POST /api/etsy/sync/prices/pull`

Proposed request fields per row:

- `hamperId`
- `variantId`
- `etsyPrice`

`variantId` uses the existing `default:<hamperId>` sentinel for non-variant rows so the client can reuse current row identity.

### 3. Reuse Existing Comparison Data

The existing `GET /api/etsy/sync/prices/pending` response already contains the data needed for a pull action:

- target hamper
- target variant row identity
- local price
- Etsy price
- sync-needed flag

No new comparison endpoint is required.

## Client Design

### API Client

Extend `src/lib/api/etsy.ts` with a `pullPrices(...)` method that posts selected price rows to the new `prices/pull` endpoint.

### Price Sync Hook

Extend `useEtsyPriceSync` to support:

- separate pull loading state/result state
- collecting selected rows for local updates using current row identities
- refreshing pending price rows after a successful pull for only the affected listing IDs

The existing push flow remains intact.

### Price Sync UI

Update `EtsyPriceSyncTab` so the sync direction is explicit:

- keep export
- keep selected-row behavior
- rename or clarify the current button as `Push to Etsy`
- add `Pull from Etsy`

Success messaging should distinguish between:

- prices updated on Etsy
- prices updated locally

## Data Update Rules

- Use a small numeric tolerance consistent with current price comparison behavior.
- Only update records that are already linked to Etsy listings/products.
- Skip rows that cannot be matched to a unique local target.
- Do not null out prices from Etsy pulls; Etsy always supplies a numeric price for synced rows.
- For variant listings, local variant overrides remain supported, but Etsy import/pull can overwrite them because Etsy is the source of truth for linked prices.

## Error Handling

- If listing inventory cannot be loaded during import, skip that listing's price refresh rather than guessing.
- If a selected pull row no longer resolves to a valid hamper or variant, return a per-row failure and continue processing other rows.
- If some rows fail, return partial success details so the UI can report the count and refresh the affected listings.

## Testing

### Server

- import updates linked non-variant hamper price from Etsy
- import updates linked variant price from Etsy
- import leaves unlinked/local-only items unchanged
- price pull updates `Hamper.sellingPrice` for default rows
- price pull updates `HamperVariant.sellingPrice` for variant rows
- existing push price behavior still passes

### Client

- Price Sync tab shows both `Push to Etsy` and `Pull from Etsy`
- pull action posts selected Etsy prices to the new endpoint
- successful pull refreshes pending rows
- push action remains unchanged

## Rollout Notes

This is intentionally scoped to pricing only. Inventory and SKU sync remain unchanged. The implementation should preserve the current comparison UI model and extend it with an explicit local pull path rather than creating a second parallel price reconciliation experience.
