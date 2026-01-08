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
      sku: 'LBH-BLUE-001',
      offerings: [
        {
          offering_id: 100001,
          quantity: 5,
          price: { amount: 4500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
        },
      ],
      property_values: [],
    },
  ],
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
      sku: 'LPH-GS',
      offerings: [
        {
          offering_id: 100002,
          quantity: 4,
          price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Design',
          values: ['Grey Star'],
        },
      ],
    },
    {
      product_id: 10003,
      sku: 'LPH-FL',
      offerings: [
        {
          offering_id: 100003,
          quantity: 5,
          price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Design',
          values: ['Floral'],
        },
      ],
    },
    {
      product_id: 10004,
      sku: 'LPH-BEE',
      offerings: [
        {
          offering_id: 100004,
          quantity: 3,
          price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
          is_enabled: true,
        },
      ],
      property_values: [
        {
          property_id: 200,
          property_name: 'Design',
          values: ['Bee'],
        },
      ],
    },
  ],
};
