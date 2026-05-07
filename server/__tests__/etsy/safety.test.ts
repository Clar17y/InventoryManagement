import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeDiff,
  shouldSkipUpdate,
  ThrottleManager,
  groupUpdatesByListing,
  buildInventoryUpdateProducts,
} from '../../lib/etsy/safety';
import {
  SINGLE_VARIANT_INVENTORY,
  MULTI_VARIANT_INVENTORY,
} from '../../lib/etsy/fixtures';

describe('computeDiff', () => {
  it('detects quantity changes', () => {
    const updates = [
      {
        sku: '',
        property_values: [],
        offerings: [{ quantity: 10, price: 45, is_enabled: true }],
      },
    ];

    const result = computeDiff(SINGLE_VARIANT_INVENTORY, updates);

    expect(result.wouldUpdate).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toEqual({
      sku: String(SINGLE_VARIANT_INVENTORY.products[0].product_id),
      currentQuantity: 5,
      newQuantity: 10,
    });
  });

  it('returns no changes when quantities match', () => {
    const updates = [
      {
        sku: '',
        property_values: [],
        offerings: [{ quantity: 5, price: 45, is_enabled: true }],
      },
    ];

    const result = computeDiff(SINGLE_VARIANT_INVENTORY, updates);

    expect(result.wouldUpdate).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('handles multiple product updates', () => {
    const updates = MULTI_VARIANT_INVENTORY.products.map((p, idx) => ({
      sku: p.sku,
      property_values: p.property_values.map((pv) => ({
        property_id: pv.property_id,
        property_name: pv.property_name,
        value_ids: pv.value_ids,
        values: pv.values,
      })),
      offerings: [
        {
          quantity: idx === 0 ? 10 : idx === 1 ? 8 : 3, // last has no change
          price: 65,
          is_enabled: true,
        },
      ],
    }));

    const result = computeDiff(MULTI_VARIANT_INVENTORY, updates);

    expect(result.wouldUpdate).toBe(true);
    expect(result.changes).toHaveLength(2);
  });

  it('ignores updates that do not match any product', () => {
    const updates = [
      {
        sku: 'NON-EXISTENT',
        property_values: [],
        offerings: [{ quantity: 10, price: 45, is_enabled: true }],
      },
    ];

    const result = computeDiff(MULTI_VARIANT_INVENTORY, updates);

    expect(result.wouldUpdate).toBe(false);
    expect(result.changes).toHaveLength(0);
  });
});

describe('shouldSkipUpdate', () => {
  it('returns true when no changes needed', () => {
    const updates = [
      {
        sku: '',
        property_values: [],
        offerings: [{ quantity: 5, price: 45, is_enabled: true }],
      },
    ];

    expect(shouldSkipUpdate(SINGLE_VARIANT_INVENTORY, updates)).toBe(true);
  });

  it('returns false when changes are needed', () => {
    const updates = [
      {
        sku: '',
        property_values: [],
        offerings: [{ quantity: 10, price: 45, is_enabled: true }],
      },
    ];

    expect(shouldSkipUpdate(SINGLE_VARIANT_INVENTORY, updates)).toBe(false);
  });
});

describe('ThrottleManager', () => {
  describe('with real timers', () => {
    it('creates with default config from env', () => {
      const throttle = new ThrottleManager();
      const status = throttle.getStatus();
      expect(status.maxUpdatesPerMinute).toBeGreaterThan(0);
    });

    it('accepts custom config', () => {
      const throttle = new ThrottleManager({
        delayMs: 500,
        maxUpdatesPerMinute: 10,
      });
      const status = throttle.getStatus();
      expect(status.maxUpdatesPerMinute).toBe(10);
    });
  });

  describe('with injected dependencies', () => {
    let mockNow: () => number;
    let mockSleep: (ms: number) => Promise<void>;
    let currentTime: number;
    let sleepCalls: number[];

    beforeEach(() => {
      currentTime = 0;
      sleepCalls = [];
      mockNow = () => currentTime;
      mockSleep = vi.fn(async (ms: number) => {
        sleepCalls.push(ms);
        currentTime += ms;
      });
    });

    it('applies delay between updates', async () => {
      const throttle = new ThrottleManager(
        { delayMs: 100, maxUpdatesPerMinute: 100 },
        { now: mockNow, sleep: mockSleep }
      );

      await throttle.waitForSlot();

      expect(sleepCalls).toContain(100);
    });

    it('tracks updates in last minute', async () => {
      const throttle = new ThrottleManager(
        { delayMs: 0, maxUpdatesPerMinute: 100 },
        { now: mockNow, sleep: mockSleep }
      );

      await throttle.waitForSlot();
      await throttle.waitForSlot();
      await throttle.waitForSlot();

      const status = throttle.getStatus();
      expect(status.updatesInLastMinute).toBe(3);
    });

    it('rate limits when at max updates', async () => {
      const throttle = new ThrottleManager(
        { delayMs: 0, maxUpdatesPerMinute: 2 },
        { now: mockNow, sleep: mockSleep }
      );

      // First two should succeed quickly
      await throttle.waitForSlot();
      currentTime += 1000; // 1 second later
      await throttle.waitForSlot();

      // Third should wait until oldest timestamp expires
      currentTime += 1000; // 2 seconds in
      await throttle.waitForSlot();

      // Should have waited for rate limit
      expect(sleepCalls.length).toBeGreaterThan(0);
    });

    it('cleans old timestamps on getStatus', async () => {
      const throttle = new ThrottleManager(
        { delayMs: 0, maxUpdatesPerMinute: 100 },
        { now: mockNow, sleep: mockSleep }
      );

      await throttle.waitForSlot();
      currentTime += 61000; // Move past 1 minute

      const status = throttle.getStatus();
      expect(status.updatesInLastMinute).toBe(0);
    });

    it('reset clears timestamps', async () => {
      const throttle = new ThrottleManager(
        { delayMs: 0, maxUpdatesPerMinute: 100 },
        { now: mockNow, sleep: mockSleep }
      );

      await throttle.waitForSlot();
      await throttle.waitForSlot();

      throttle.reset();

      const status = throttle.getStatus();
      expect(status.updatesInLastMinute).toBe(0);
    });
  });
});

describe('groupUpdatesByListing', () => {
  it('groups updates by listing ID', () => {
    const updates = [
      { etsyListingId: '1001', etsySku: 'SKU-A', etsyProductId: null, quantity: 5 },
      { etsyListingId: '1001', etsySku: 'SKU-B', etsyProductId: null, quantity: 3 },
      { etsyListingId: '1002', etsySku: 'SKU-C', etsyProductId: null, quantity: 10 },
    ];

    const grouped = groupUpdatesByListing(updates);

    expect(grouped.size).toBe(2);
    expect(grouped.get('1001')?.length).toBe(2);
    expect(grouped.get('1002')?.length).toBe(1);
  });

  it('handles empty array', () => {
    const grouped = groupUpdatesByListing([]);
    expect(grouped.size).toBe(0);
  });
});

describe('buildInventoryUpdateProducts', () => {
  it('builds update products preserving original prices', () => {
    const updates = [{ etsySku: null, etsyProductId: null, quantity: 10 }];

    const products = buildInventoryUpdateProducts(SINGLE_VARIANT_INVENTORY, updates);

    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe('');
    expect(products[0].offerings[0].quantity).toBe(10);
    expect(products[0].offerings[0].price).toBe(45); // Original price preserved
  });

  it('handles null SKU (default variant)', () => {
    const updates = [{ etsySku: null, etsyProductId: null, quantity: 15 }];

    const products = buildInventoryUpdateProducts(SINGLE_VARIANT_INVENTORY, updates);

    expect(products[0].offerings[0].quantity).toBe(15);
  });

  it('rejects null SKU for multi-variant listings', () => {
    const updates = [{ etsySku: null, etsyProductId: null, quantity: 15 }];

    expect(() =>
      buildInventoryUpdateProducts(MULTI_VARIANT_INVENTORY, updates)
    ).toThrow(/Default-variant update/i);
  });

  it('preserves products without updates', () => {
    const updates = [
      {
        etsySku: null,
        etsyProductId: String(MULTI_VARIANT_INVENTORY.products[0].product_id),
        quantity: 20,
      },
    ];

    const products = buildInventoryUpdateProducts(MULTI_VARIANT_INVENTORY, updates);

    expect(products).toHaveLength(3);
    // Updated product
    expect(products[0].offerings[0].quantity).toBe(20);
    // Unchanged products keep original quantities
    expect(products[1].offerings[0].quantity).toBe(5);
    expect(products[2].offerings[0].quantity).toBe(3);
  });

  it('rejects SKU-only updates when the Etsy SKU is duplicated in the listing', () => {
    const inventoryWithDuplicateSkus = {
      ...MULTI_VARIANT_INVENTORY,
      products: MULTI_VARIANT_INVENTORY.products.map((product, index) => ({
        ...product,
        sku: index < 2 ? 'DUP-SKU' : product.sku,
      })),
    };

    expect(() =>
      buildInventoryUpdateProducts(inventoryWithDuplicateSkus, [
        { etsySku: 'DUP-SKU', etsyProductId: null, quantity: 20 },
      ])
    ).toThrow(/duplicate Etsy SKU/i);
  });

  it('allows product-id updates when the Etsy SKU is duplicated in the listing', () => {
    const inventoryWithDuplicateSkus = {
      ...MULTI_VARIANT_INVENTORY,
      products: MULTI_VARIANT_INVENTORY.products.map((product, index) => ({
        ...product,
        sku: index < 2 ? 'DUP-SKU' : product.sku,
      })),
    };

    const products = buildInventoryUpdateProducts(inventoryWithDuplicateSkus, [
      {
        etsySku: 'DUP-SKU',
        etsyProductId: String(inventoryWithDuplicateSkus.products[1].product_id),
        quantity: 20,
      },
    ]);

    expect(products[0].offerings[0].quantity).toBe(MULTI_VARIANT_INVENTORY.products[0].offerings[0].quantity);
    expect(products[1].offerings[0].quantity).toBe(20);
  });
});
