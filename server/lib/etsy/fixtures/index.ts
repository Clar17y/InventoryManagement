import { EtsyListing, EtsyInventory, EtsyReceipt, EtsyShop } from '../types';

// Re-export all fixtures
export * from './shop';
export * from './listings';
export * from './edgeCases';
export * from './orders';

// Import for building default set
import { MOCK_SHOP } from './shop';
import {
  SINGLE_VARIANT_LISTING,
  SINGLE_VARIANT_INVENTORY,
  MULTI_VARIANT_LISTING,
  MULTI_VARIANT_INVENTORY,
} from './listings';
import {
  MISSING_SKU_LISTING,
  MISSING_SKU_INVENTORY,
  DUPLICATE_SKU_LISTING,
  DUPLICATE_SKU_INVENTORY,
  ZERO_QTY_LISTING,
  ZERO_QTY_INVENTORY,
  DRAFT_LISTING,
  DRAFT_INVENTORY,
  SKU_MISMATCH_LISTING,
  SKU_MISMATCH_INVENTORY,
} from './edgeCases';
import { MOCK_RECEIPTS } from './orders';

// =============================================================================
// Default Fixture Set
// =============================================================================

export interface DefaultFixtures {
  shop: EtsyShop;
  listings: EtsyListing[];
  inventoryByListingId: Map<number, EtsyInventory>;
  receipts: EtsyReceipt[];
}

export function getDefaultFixtures(): DefaultFixtures {
  const listings = [
    SINGLE_VARIANT_LISTING,
    MULTI_VARIANT_LISTING,
    MISSING_SKU_LISTING,
    DUPLICATE_SKU_LISTING,
    ZERO_QTY_LISTING,
    DRAFT_LISTING,
    SKU_MISMATCH_LISTING,
  ];

  const inventoryByListingId = new Map<number, EtsyInventory>([
    [SINGLE_VARIANT_LISTING.listing_id, SINGLE_VARIANT_INVENTORY],
    [MULTI_VARIANT_LISTING.listing_id, MULTI_VARIANT_INVENTORY],
    [MISSING_SKU_LISTING.listing_id, MISSING_SKU_INVENTORY],
    [DUPLICATE_SKU_LISTING.listing_id, DUPLICATE_SKU_INVENTORY],
    [ZERO_QTY_LISTING.listing_id, ZERO_QTY_INVENTORY],
    [DRAFT_LISTING.listing_id, DRAFT_INVENTORY],
    [SKU_MISMATCH_LISTING.listing_id, SKU_MISMATCH_INVENTORY],
  ]);

  return {
    shop: MOCK_SHOP,
    listings,
    inventoryByListingId,
    receipts: [...MOCK_RECEIPTS],
  };
}

// Helper to deep clone fixtures (for isolated test instances)
export function cloneFixtures(fixtures: DefaultFixtures): DefaultFixtures {
  return {
    shop: { ...fixtures.shop },
    listings: fixtures.listings.map((l) => ({ ...l })),
    inventoryByListingId: new Map(
      Array.from(fixtures.inventoryByListingId.entries()).map(([k, v]) => [
        k,
        {
          listing_id: v.listing_id,
          products: v.products.map((p) => ({
            ...p,
            offerings: p.offerings.map((o) => ({ ...o, price: { ...o.price } })),
            property_values: p.property_values.map((pv) => ({
              ...pv,
              values: [...pv.values],
            })),
          })),
        },
      ])
    ),
    receipts: fixtures.receipts.map((r) => ({
      ...r,
      grandtotal: { ...r.grandtotal },
      subtotal: { ...r.subtotal },
      total_shipping_cost: { ...r.total_shipping_cost },
      total_tax_cost: { ...r.total_tax_cost },
      transactions: r.transactions.map((t) => ({ ...t, price: { ...t.price } })),
    })),
  };
}
