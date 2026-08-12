import { describe, it, expect, beforeEach } from 'vitest';
import { MockEtsyClient } from '../../lib/etsy/mockClient';
import { EtsyApiError, type EtsyPayment } from '../../lib/etsy/types';
import {
  SINGLE_VARIANT_LISTING,
  SINGLE_VARIANT_INVENTORY,
  MULTI_VARIANT_LISTING,
} from '../../lib/etsy/fixtures';

describe('MockEtsyClient', () => {
  let client: MockEtsyClient;

  beforeEach(() => {
    client = new MockEtsyClient();
  });

  describe('constructor', () => {
    it('initializes with default fixtures', async () => {
      const { listings } = await client.getActiveListings();
      expect(listings.length).toBeGreaterThan(0);
    });

    it('accepts custom configuration', async () => {
      const customClient = new MockEtsyClient({
        connected: false,
      });
      await expect(customClient.getActiveListings()).rejects.toThrow(EtsyApiError);
    });
  });

  describe('getActiveListings', () => {
    it('returns only active listings', async () => {
      const { listings } = await client.getActiveListings();
      const allActive = listings.every((l) => l.state === 'active');
      expect(allActive).toBe(true);
    });

    it('returns correct count (total before pagination)', async () => {
      const state = client.getInternalState();
      const expectedActiveCount = state.listings.filter(
        (l) => l.state === 'active'
      ).length;

      const { count } = await client.getActiveListings(1, 0);
      expect(count).toBe(expectedActiveCount);
    });

    it('supports pagination with limit', async () => {
      const { listings, count } = await client.getActiveListings(2, 0);
      expect(listings.length).toBeLessThanOrEqual(2);
      expect(count).toBeGreaterThanOrEqual(listings.length);
    });

    it('supports pagination with offset', async () => {
      const first = await client.getActiveListings(1, 0);
      const second = await client.getActiveListings(1, 1);

      if (first.count > 1) {
        expect(first.listings[0]?.listing_id).not.toBe(
          second.listings[0]?.listing_id
        );
      }
    });

    it('throws 401 when not connected', async () => {
      client.setConnected(false);
      await expect(client.getActiveListings()).rejects.toThrow(EtsyApiError);
    });
  });

  describe('getListingInventory', () => {
    it('returns inventory for valid listing', async () => {
      const inventory = await client.getListingInventory(
        SINGLE_VARIANT_LISTING.listing_id
      );
      expect(inventory.listing_id).toBe(SINGLE_VARIANT_LISTING.listing_id);
      expect(inventory.products.length).toBeGreaterThan(0);
    });

    it('throws 404 for non-existent listing', async () => {
      await expect(client.getListingInventory(99999)).rejects.toThrow(
        EtsyApiError
      );
      try {
        await client.getListingInventory(99999);
      } catch (error) {
        expect((error as EtsyApiError).status).toBe(404);
      }
    });

    it('returns deep copy (mutation safe)', async () => {
      const inventory1 = await client.getListingInventory(
        MULTI_VARIANT_LISTING.listing_id
      );
      inventory1.products[0].offerings[0].quantity = 999;

      const inventory2 = await client.getListingInventory(
        MULTI_VARIANT_LISTING.listing_id
      );
      expect(inventory2.products[0].offerings[0].quantity).not.toBe(999);
    });
  });

  describe('updateListingInventory', () => {
    it('persists state changes', async () => {
      const listingId = MULTI_VARIANT_LISTING.listing_id;
      const before = await client.getListingInventory(listingId);
      const originalQty = before.products[0].offerings[0].quantity;
      const target = before.products[0];

      await client.updateListingInventory(listingId, [
        {
          sku: target.sku,
          property_values: target.property_values.map((pv) => ({
            property_id: pv.property_id,
            property_name: pv.property_name,
            value_ids: pv.value_ids,
            values: pv.values,
          })),
          offerings: [{ quantity: originalQty + 10, price: 65, is_enabled: true }],
        },
      ]);

      const after = await client.getListingInventory(listingId);
      expect(after.products[0].offerings[0].quantity).toBe(originalQty + 10);
    });

    it('updates listing total quantity', async () => {
      const listingId = SINGLE_VARIANT_LISTING.listing_id;

      await client.updateListingInventory(listingId, [
        {
          sku: '',
          property_values: [],
          offerings: [{ quantity: 20, price: 45, is_enabled: true }],
        },
      ]);

      const { listings } = await client.getActiveListings(100, 0);
      const listing = listings.find((l) => l.listing_id === listingId);
      expect(listing?.quantity).toBe(20);
    });

    it('throws 404 for non-existent listing', async () => {
      await expect(
        client.updateListingInventory(99999, [
          { sku: 'TEST', property_values: [], offerings: [{ quantity: 1, price: 10, is_enabled: true }] },
        ])
      ).rejects.toThrow(EtsyApiError);
    });
  });

  describe('getReceipts', () => {
    it('returns receipts', async () => {
      const { receipts, count } = await client.getReceipts();
      expect(count).toBeGreaterThan(0);
      expect(receipts.length).toBeLessThanOrEqual(count);
    });

    it('filters by minCreated', async () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 24 * 60 * 60;

      const { receipts: recent } = await client.getReceipts(oneDayAgo);
      const { receipts: old } = await client.getReceipts(now + 86400);

      // Should have fewer or equal receipts when filtering to future
      expect(old.length).toBeLessThanOrEqual(recent.length);
    });

    it('respects limit', async () => {
      const { receipts } = await client.getReceipts(undefined, 2);
      expect(receipts.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getPaymentsForReceipt', () => {
    it('returns cloned configured payment fixtures without mutating the mock', async () => {
      const payment: EtsyPayment = {
        payment_id: 9001,
        receipt_id: 4137418052,
        currency: 'GBP',
        amount_gross: { amount: 3999, divisor: 100, currency_code: 'GBP' },
        amount_fees: { amount: 976, divisor: 100, currency_code: 'GBP' },
        amount_net: { amount: 3023, divisor: 100, currency_code: 'GBP' },
        adjusted_gross: { amount: 0, divisor: 100, currency_code: 'GBP' },
        adjusted_fees: { amount: 0, divisor: 100, currency_code: 'GBP' },
        adjusted_net: { amount: 0, divisor: 100, currency_code: 'GBP' },
      };
      const customClient = new MockEtsyClient({
        paymentsByReceiptId: new Map([[payment.receipt_id, [payment]]]),
      });

      const first = await customClient.getPaymentsForReceipt(payment.receipt_id);
      first[0]!.amount_gross.amount = 1;
      const second = await customClient.getPaymentsForReceipt(payment.receipt_id);

      expect(second).toEqual([payment]);
      await expect(customClient.getPaymentsForReceipt(99999)).resolves.toEqual([]);
    });

    it('honors the connection and error guards', async () => {
      const customClient = new MockEtsyClient({ errorMode: '404' });
      await expect(customClient.getPaymentsForReceipt(4137418052)).rejects.toMatchObject({
        status: 404,
      });
      customClient.setErrorMode(null);
      customClient.setConnected(false);
      await expect(customClient.getPaymentsForReceipt(4137418052)).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  describe('isConnected / disconnect', () => {
    it('returns true when connected', async () => {
      expect(await client.isConnected()).toBe(true);
    });

    it('returns false after disconnect', async () => {
      await client.disconnect();
      expect(await client.isConnected()).toBe(false);
    });

    it('throws errors after disconnect', async () => {
      await client.disconnect();
      await expect(client.getActiveListings()).rejects.toThrow(EtsyApiError);
    });
  });

  describe('error simulation', () => {
    it('throws 401 when error mode is set', async () => {
      client.setErrorMode('401');
      await expect(client.getActiveListings()).rejects.toThrow(EtsyApiError);

      try {
        await client.getActiveListings();
      } catch (error) {
        expect((error as EtsyApiError).status).toBe(401);
      }
    });

    it('throws 429 with retryAfter', async () => {
      const customClient = new MockEtsyClient({
        errorMode: '429',
        rateLimitRetryAfter: 120,
      });

      try {
        await customClient.getActiveListings();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as EtsyApiError).status).toBe(429);
        expect((error as EtsyApiError).retryAfter).toBe(120);
      }
    });

    it('only errors on specific listing when configured', async () => {
      client.setErrorMode('404', SINGLE_VARIANT_LISTING.listing_id);

      // Should succeed for other listings
      await expect(
        client.getListingInventory(MULTI_VARIANT_LISTING.listing_id)
      ).resolves.toBeDefined();

      // Should fail for targeted listing
      await expect(
        client.getListingInventory(SINGLE_VARIANT_LISTING.listing_id)
      ).rejects.toThrow(EtsyApiError);
    });

    it('clears error mode when set to null', async () => {
      client.setErrorMode('403');
      client.setErrorMode(null);
      await expect(client.getActiveListings()).resolves.toBeDefined();
    });
  });

  describe('reset', () => {
    it('restores initial state', async () => {
      const listingId = SINGLE_VARIANT_LISTING.listing_id;

      // Make changes
      await client.updateListingInventory(listingId, [
        {
          sku: '',
          property_values: [],
          offerings: [{ quantity: 999, price: 45, is_enabled: true }],
        },
      ]);

      // Reset
      client.reset();

      // Verify original quantity restored
      const inventory = await client.getListingInventory(listingId);
      expect(inventory.products[0].offerings[0].quantity).toBe(
        SINGLE_VARIANT_INVENTORY.products[0].offerings[0].quantity
      );
    });
  });

  describe('test helpers', () => {
    it('addListing adds listing and inventory', async () => {
      const newListing = {
        ...SINGLE_VARIANT_LISTING,
        listing_id: 9999,
        title: 'Test Listing',
      };
      const newInventory = {
        ...SINGLE_VARIANT_INVENTORY,
        listing_id: 9999,
      };

      client.addListing(newListing, newInventory);

      const inventory = await client.getListingInventory(9999);
      expect(inventory.listing_id).toBe(9999);
    });

    it('getInternalState returns current state', () => {
      const state = client.getInternalState();
      expect(state.listings).toBeDefined();
      expect(state.inventoryByListingId).toBeDefined();
      expect(state.receipts).toBeDefined();
      expect(state.shop).toBeDefined();
    });
  });
});
