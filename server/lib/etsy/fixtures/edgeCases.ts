import { EtsyListing, EtsyInventory } from '../types';

// =============================================================================
// Missing SKU - one variant has empty SKU string
// =============================================================================

export const MISSING_SKU_LISTING: EtsyListing = {
  listing_id: 1003,
  title: 'Gift Basket - No SKU Variant',
  description: 'One variant is missing its SKU',
  price: { amount: 3500, divisor: 100, currency_code: 'GBP' },
  quantity: 8,
  state: 'active',
  url: 'https://www.etsy.com/listing/1003',
  has_variations: true,
};

export const MISSING_SKU_INVENTORY: EtsyInventory = {
  listing_id: 1003,
  products: [
    {
      product_id: 10005,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100005,
          quantity: 4,
          price: { amount: 3500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 201,
          property_name: 'Color',
          scale_id: null,
          scale_name: null,
          value_ids: [55181013885],
          values: ['Red'],
        },
      ],
    },
    {
      product_id: 10006,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100006,
          quantity: 4,
          price: { amount: 3500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 201,
          property_name: 'Color',
          scale_id: null,
          scale_name: null,
          value_ids: [55181013993],
          values: ['Blue'],
        },
      ],
    },
  ],
  price_on_property: [],
  quantity_on_property: [],
  sku_on_property: [],
};

// =============================================================================
// Duplicate SKU - two products share the same SKU (error case)
// =============================================================================

export const DUPLICATE_SKU_LISTING: EtsyListing = {
  listing_id: 1004,
  title: 'Size Variants with Duplicate SKU',
  description: 'Two variants accidentally have the same SKU',
  price: { amount: 4000, divisor: 100, currency_code: 'GBP' },
  quantity: 5,
  state: 'active',
  url: 'https://www.etsy.com/listing/1004',
  has_variations: true,
};

export const DUPLICATE_SKU_INVENTORY: EtsyInventory = {
  listing_id: 1004,
  products: [
    {
      product_id: 10007,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100007,
          quantity: 3,
          price: { amount: 4000, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 202,
          property_name: 'Size',
          scale_id: null,
          scale_name: null,
          value_ids: [55998730757],
          values: ['Small'],
        },
      ],
    },
    {
      product_id: 10008,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100008,
          quantity: 2,
          price: { amount: 4500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 202,
          property_name: 'Size',
          scale_id: null,
          scale_name: null,
          value_ids: [55998730799],
          values: ['Large'],
        },
      ],
    },
  ],
  price_on_property: [],
  quantity_on_property: [],
  sku_on_property: [],
};

// =============================================================================
// Zero Quantity Listing
// =============================================================================

export const ZERO_QTY_LISTING: EtsyListing = {
  listing_id: 1005,
  title: 'Out of Stock Hamper',
  description: 'Currently unavailable',
  price: { amount: 5000, divisor: 100, currency_code: 'GBP' },
  quantity: 0,
  state: 'active',
  url: 'https://www.etsy.com/listing/1005',
  has_variations: false,
};

export const ZERO_QTY_INVENTORY: EtsyInventory = {
  listing_id: 1005,
  products: [
    {
      product_id: 10009,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100009,
          quantity: 0,
          price: { amount: 5000, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [],
    },
  ],
  price_on_property: [],
  quantity_on_property: [],
  sku_on_property: [],
};

// =============================================================================
// Draft/Inactive Listing
// =============================================================================

export const DRAFT_LISTING: EtsyListing = {
  listing_id: 1006,
  title: 'Upcoming Summer Hamper',
  description: 'Coming soon!',
  price: { amount: 5500, divisor: 100, currency_code: 'GBP' },
  quantity: 10,
  state: 'draft',
  url: 'https://www.etsy.com/listing/1006',
  has_variations: false,
};

export const DRAFT_INVENTORY: EtsyInventory = {
  listing_id: 1006,
  products: [
    {
      product_id: 10010,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100010,
          quantity: 10,
          price: { amount: 5500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [],
    },
  ],
  price_on_property: [],
  quantity_on_property: [],
  sku_on_property: [],
};

// =============================================================================
// SKU Mismatch - SKU changed from what local DB might have
// =============================================================================

export const SKU_MISMATCH_LISTING: EtsyListing = {
  listing_id: 1007,
  title: 'Hamper with Changed SKU',
  description: 'SKU was updated on Etsy',
  price: { amount: 4200, divisor: 100, currency_code: 'GBP' },
  quantity: 6,
  state: 'active',
  url: 'https://www.etsy.com/listing/1007',
  has_variations: false,
};

export const SKU_MISMATCH_INVENTORY: EtsyInventory = {
  listing_id: 1007,
  products: [
    {
      product_id: 10011,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100011,
          quantity: 6,
          price: { amount: 4200, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [],
    },
  ],
  price_on_property: [],
  quantity_on_property: [],
  sku_on_property: [],
};
