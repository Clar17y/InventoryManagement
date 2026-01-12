import { EtsyReceipt } from '../types';

// Helper to get timestamps relative to now
const now = () => Math.floor(Date.now() / 1000);
const daysAgo = (days: number) => now() - days * 24 * 60 * 60;
const hoursAgo = (hours: number) => now() - hours * 60 * 60;

// =============================================================================
// Mock Receipts/Orders
// =============================================================================

export const MOCK_RECEIPTS: EtsyReceipt[] = [
  // Completed and shipped order
  {
    receipt_id: 3001,
    receipt_type: 0,
    seller_user_id: 87654321,
    buyer_user_id: 67890,
    name: 'Jane Smith',
    first_line: '123 High Street',
    city: 'London',
    state: '',
    zip: 'SW1A 1AA',
    status: 'Completed',
    is_paid: true,
    is_shipped: true,
    create_timestamp: daysAgo(1),
    update_timestamp: now(),
    grandtotal: { amount: 7000, divisor: 100, currency_code: 'GBP' },
    subtotal: { amount: 6500, divisor: 100, currency_code: 'GBP' },
    total_shipping_cost: { amount: 500, divisor: 100, currency_code: 'GBP' },
    total_tax_cost: { amount: 0, divisor: 100, currency_code: 'GBP' },
    transactions: [
      {
        transaction_id: 4001,
        listing_id: 1002,
        title: 'Luxury Pamper Hamper - Grey Star',
        quantity: 1,
        price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
        sku: 'LPH-GS',
        product_id: 20020001,
        variations: [
          { property_id: 200, value_id: 1001, formatted_name: 'Style', formatted_value: 'Grey Star' },
        ],
      },
    ],
  },

  // Paid but not shipped order
  {
    receipt_id: 3002,
    receipt_type: 0,
    seller_user_id: 87654321,
    buyer_user_id: 11111,
    name: 'John Doe',
    first_line: '456 Oak Lane',
    city: 'Manchester',
    state: '',
    zip: 'M1 1AA',
    status: 'Paid',
    is_paid: true,
    is_shipped: false,
    create_timestamp: hoursAgo(1),
    update_timestamp: now(),
    grandtotal: { amount: 9500, divisor: 100, currency_code: 'GBP' },
    subtotal: { amount: 9000, divisor: 100, currency_code: 'GBP' },
    total_shipping_cost: { amount: 500, divisor: 100, currency_code: 'GBP' },
    total_tax_cost: { amount: 0, divisor: 100, currency_code: 'GBP' },
    transactions: [
      {
        transaction_id: 4002,
        listing_id: 1001,
        title: 'Luxury Baby Hamper - Blue',
        quantity: 2,
        price: { amount: 4500, divisor: 100, currency_code: 'GBP' },
        sku: 'LBH-BLUE-001',
        product_id: 20010001,
        variations: [
          { property_id: 200, value_id: 2001, formatted_name: 'Color', formatted_value: 'Blue' },
        ],
      },
    ],
  },

  // Multi-item order
  {
    receipt_id: 3003,
    receipt_type: 0,
    seller_user_id: 87654321,
    buyer_user_id: 22222,
    name: 'Sarah Williams',
    first_line: '789 Garden Road',
    city: 'Birmingham',
    state: '',
    zip: 'B1 2AB',
    status: 'Paid',
    is_paid: true,
    is_shipped: false,
    create_timestamp: hoursAgo(3),
    update_timestamp: now(),
    grandtotal: { amount: 11500, divisor: 100, currency_code: 'GBP' },
    subtotal: { amount: 11000, divisor: 100, currency_code: 'GBP' },
    total_shipping_cost: { amount: 500, divisor: 100, currency_code: 'GBP' },
    total_tax_cost: { amount: 0, divisor: 100, currency_code: 'GBP' },
    transactions: [
      {
        transaction_id: 4003,
        listing_id: 1001,
        title: 'Luxury Baby Hamper - Blue',
        quantity: 1,
        price: { amount: 4500, divisor: 100, currency_code: 'GBP' },
        sku: 'LBH-BLUE-001',
        product_id: 20010001,
        variations: [
          { property_id: 200, value_id: 2001, formatted_name: 'Color', formatted_value: 'Blue' },
        ],
      },
      {
        transaction_id: 4004,
        listing_id: 1002,
        title: 'Luxury Pamper Hamper - Floral',
        quantity: 1,
        price: { amount: 6500, divisor: 100, currency_code: 'GBP' },
        sku: 'LPH-FL',
        product_id: 20020002,
        variations: [
          { property_id: 200, value_id: 1002, formatted_name: 'Style', formatted_value: 'Floral' },
        ],
      },
    ],
  },

  // Order with null SKU but valid product_id (like real Etsy data)
  {
    receipt_id: 3004,
    receipt_type: 0,
    seller_user_id: 87654321,
    buyer_user_id: 33333,
    name: 'Mike Johnson',
    first_line: '101 Park Avenue',
    city: 'Leeds',
    state: '',
    zip: 'LS1 3BH',
    status: 'Paid',
    is_paid: true,
    is_shipped: false,
    create_timestamp: daysAgo(2),
    update_timestamp: now(),
    grandtotal: { amount: 4000, divisor: 100, currency_code: 'GBP' },
    subtotal: { amount: 3500, divisor: 100, currency_code: 'GBP' },
    total_shipping_cost: { amount: 500, divisor: 100, currency_code: 'GBP' },
    total_tax_cost: { amount: 0, divisor: 100, currency_code: 'GBP' },
    transactions: [
      {
        transaction_id: 4005,
        listing_id: 1003,
        title: 'Gift Basket - Blue',
        quantity: 1,
        price: { amount: 3500, divisor: 100, currency_code: 'GBP' },
        sku: null,
        product_id: 20030001,
        variations: [
          { property_id: 200, value_id: 3001, formatted_name: 'Color', formatted_value: 'Blue' },
        ],
      },
    ],
  },

  // Unpaid order (should be filtered out during import)
  {
    receipt_id: 3005,
    receipt_type: 0,
    seller_user_id: 87654321,
    buyer_user_id: 44444,
    name: 'Pending Customer',
    first_line: '999 Wait Street',
    city: 'Edinburgh',
    state: '',
    zip: 'EH1 1AA',
    status: 'Pending',
    is_paid: false,
    is_shipped: false,
    create_timestamp: hoursAgo(12),
    update_timestamp: now(),
    grandtotal: { amount: 5000, divisor: 100, currency_code: 'GBP' },
    subtotal: { amount: 4500, divisor: 100, currency_code: 'GBP' },
    total_shipping_cost: { amount: 500, divisor: 100, currency_code: 'GBP' },
    total_tax_cost: { amount: 0, divisor: 100, currency_code: 'GBP' },
    transactions: [
      {
        transaction_id: 4006,
        listing_id: 1005,
        title: 'Out of Stock Hamper',
        quantity: 1,
        price: { amount: 4500, divisor: 100, currency_code: 'GBP' },
        sku: 'OOS-001',
        product_id: 20050001,
        variations: [],
      },
    ],
  },
];

// Helper to get only paid receipts (common filter)
export function getPaidReceipts(): EtsyReceipt[] {
  return MOCK_RECEIPTS.filter((r) => r.is_paid);
}
