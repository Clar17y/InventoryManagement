import { EtsyListing, EtsyInventory } from '../types';

// =============================================================================
// Single Variant Listing
// =============================================================================

export const SINGLE_VARIANT_LISTING: EtsyListing = {
  listing_id: 1001,
  title: 'Luxury Baby Hamper - Blue',
  description: 'A beautiful baby hamper with premium items',
  price: { amount: 4500, divisor: 100, currency_code: 'GBP' },
  quantity: 5,
  state: 'active',
  url: 'https://www.etsy.com/listing/1001',
  has_variations: false,
};

export const SINGLE_VARIANT_INVENTORY: EtsyInventory = {
  listing_id: 1001,
  products: [
    {
      product_id: 10001,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100001,
          quantity: 5,
          price: { amount: 4500, divisor: 100, currency_code: 'GBP' },
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
// Multi-Variant Listing (3 variants)
// =============================================================================

export const MULTI_VARIANT_LISTING: EtsyListing = {
  listing_id: 1002,
  title: 'Luxury Pamper Hamper',
  description: 'Choose from three stunning designs',
  price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
  quantity: 12, // Total across all variants
  state: 'active',
  url: 'https://www.etsy.com/listing/1002',
  has_variations: true,
};

export const MULTI_VARIANT_INVENTORY: EtsyInventory = {
  listing_id: 1002,
  products: [
    {
      product_id: 10002,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100002,
          quantity: 4,
          price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Design',
          scale_id: null,
          scale_name: null,
          value_ids: [55181013885],
          values: ['Grey Star'],
        },
      ],
    },
    {
      product_id: 10003,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100003,
          quantity: 5,
          price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Design',
          scale_id: null,
          scale_name: null,
          value_ids: [55181013993],
          values: ['Floral'],
        },
      ],
    },
    {
      product_id: 10004,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 100004,
          quantity: 3,
          price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Design',
          scale_id: null,
          scale_name: null,
          value_ids: [55998730757],
          values: ['Bee'],
        },
      ],
    },
  ],
  price_on_property: [],
  quantity_on_property: [],
  sku_on_property: [],
};

// =============================================================================
// Multi-Variant Listing with Empty SKUs (common case)
// =============================================================================

export const EMPTY_SKU_LISTING: EtsyListing = {
  listing_id: 1008,
  title: 'T-Shirt with Color Options',
  description: 'Available in multiple colors',
  price: { amount: 4000, divisor: 100, currency_code: 'GBP' },
  quantity: 15,
  state: 'active',
  url: 'https://www.etsy.com/listing/1008',
  has_variations: true,
};

export const EMPTY_SKU_INVENTORY: EtsyInventory = {
  listing_id: 1008,
  products: [
    {
      product_id: 29058571210,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 28949854196,
          quantity: 5,
          price: { amount: 4000, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Primary color',
          scale_id: null,
          scale_name: null,
          value_ids: [55181013885],
          values: ['Black'],
        },
      ],
    },
    {
      product_id: 29058571216,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 28949854202,
          quantity: 4,
          price: { amount: 4100, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Primary color',
          scale_id: null,
          scale_name: null,
          value_ids: [55181013993],
          values: ['Blue'],
        },
      ],
    },
    {
      product_id: 29058571226,
      sku: '',
      is_deleted: false,
      offerings: [
        {
          offering_id: 28853688907,
          quantity: 3,
          price: { amount: 4200, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
          is_deleted: false,
          readiness_state_id: 1452994454691,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Primary color',
          scale_id: null,
          scale_name: null,
          value_ids: [55998730757],
          values: ['Brown'],
        },
      ],
    },
  ],
  price_on_property: [200],
  quantity_on_property: [200],
  sku_on_property: [],
};
