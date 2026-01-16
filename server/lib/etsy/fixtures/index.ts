import { EtsyListing, EtsyInventory, EtsyReceipt, EtsyShop } from '../types';

// Re-export all fixtures
export * from './shop';
export * from './listings';
export * from './edgeCases';
export * from './orders';
export * from './bulk';

// Import for building default set
import { MOCK_SHOP } from './shop';
import {
  SINGLE_VARIANT_LISTING,
  SINGLE_VARIANT_INVENTORY,
  MULTI_VARIANT_LISTING,
  MULTI_VARIANT_INVENTORY,
  EMPTY_SKU_LISTING,
  EMPTY_SKU_INVENTORY,
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
import { generateBulkHamperFixtures } from './bulk';

// =============================================================================
// Default Fixture Set
// =============================================================================

export interface DefaultFixtures {
  shop: EtsyShop;
  listings: EtsyListing[];
  inventoryByListingId: Map<number, EtsyInventory>;
  receipts: EtsyReceipt[];
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function getDefaultFixtures(): DefaultFixtures {
  const listings: EtsyListing[] = [
    SINGLE_VARIANT_LISTING,
    MULTI_VARIANT_LISTING,
    EMPTY_SKU_LISTING,
    MISSING_SKU_LISTING,
    DUPLICATE_SKU_LISTING,
    ZERO_QTY_LISTING,
    DRAFT_LISTING,
    SKU_MISMATCH_LISTING,
  ];

  const inventoryByListingId = new Map<number, EtsyInventory>([
    [SINGLE_VARIANT_LISTING.listing_id, SINGLE_VARIANT_INVENTORY],
    [MULTI_VARIANT_LISTING.listing_id, MULTI_VARIANT_INVENTORY],
    [EMPTY_SKU_LISTING.listing_id, EMPTY_SKU_INVENTORY],
    [MISSING_SKU_LISTING.listing_id, MISSING_SKU_INVENTORY],
    [DUPLICATE_SKU_LISTING.listing_id, DUPLICATE_SKU_INVENTORY],
    [ZERO_QTY_LISTING.listing_id, ZERO_QTY_INVENTORY],
    [DRAFT_LISTING.listing_id, DRAFT_INVENTORY],
    [SKU_MISMATCH_LISTING.listing_id, SKU_MISMATCH_INVENTORY],
  ]);

  const desiredActiveCount = parsePositiveInt(process.env.ETSY_MOCK_ACTIVE_LISTINGS);
  if (desiredActiveCount) {
    const baseActiveCount = listings.filter((l) => l.state === 'active').length;

    if (desiredActiveCount > baseActiveCount) {
      const extraCount = desiredActiveCount - baseActiveCount;
      const multiVariantEvery =
        parsePositiveInt(process.env.ETSY_MOCK_MULTI_VARIANT_EVERY) ?? 10;
      const variantsPerListing =
        parsePositiveInt(process.env.ETSY_MOCK_VARIANTS_PER_LISTING) ?? 3;

      const bulk = generateBulkHamperFixtures(extraCount, {
        startListingId: 2000,
        currencyCode: 'GBP',
        multiVariantEvery,
        variantsPerListing,
      });

      listings.push(...bulk.listings);
      for (const [listingId, inventory] of bulk.inventoryByListingId.entries()) {
        inventoryByListingId.set(listingId, inventory);
      }
    }
  }

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
    listings: fixtures.listings.map((l) => ({ ...l, price: { ...l.price } })),
    inventoryByListingId: new Map(
      Array.from(fixtures.inventoryByListingId.entries()).map(([k, v]) => [
        k,
        {
          listing_id: v.listing_id,
          price_on_property: [...(v.price_on_property || [])],
          quantity_on_property: [...(v.quantity_on_property || [])],
          sku_on_property: [...(v.sku_on_property || [])],
          products: v.products.map((p) => ({
            ...p,
            offerings: p.offerings.map((o) => ({ ...o, price: { ...o.price } })),
            property_values: p.property_values.map((pv) => ({
              ...pv,
              value_ids: [...(pv.value_ids || [])],
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
