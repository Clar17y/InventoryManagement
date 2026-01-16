import { describe, it, expect, beforeEach } from 'vitest';
import { MockEtsyClient } from '../../lib/etsy/mockClient';
import { createEtsyClient, resetEtsyClient } from '../../lib/etsy/factory';
import { computeDiff, shouldSkipUpdate } from '../../lib/etsy/safety';
import {
  SINGLE_VARIANT_LISTING,
  MULTI_VARIANT_LISTING,
} from '../../lib/etsy/fixtures';

describe('Etsy Integration', () => {
  let client: MockEtsyClient;

  beforeEach(() => {
    client = new MockEtsyClient();
  });

  describe('Full sync flow', () => {
    it('fetches listings, computes availability, updates quantities', async () => {
      // 1. Fetch listings
      const { listings, count } = await client.getActiveListings();
      expect(listings.length).toBeGreaterThan(0);
      expect(count).toBeGreaterThan(0);

      // 2. Get inventory for each listing
      for (const listing of listings) {
        const inventory = await client.getListingInventory(listing.listing_id);
        expect(inventory.listing_id).toBe(listing.listing_id);
        expect(inventory.products.length).toBeGreaterThan(0);
      }

      // 3. Simulate computed can-make (would come from database in real scenario)
      const mockCanMake = 8;

      // 4. Push update to first listing
      const targetListing = listings[0];
      const inventory = await client.getListingInventory(targetListing.listing_id);
      const firstProduct = inventory.products[0];
      const sku = firstProduct.sku;
      const price =
        firstProduct.offerings[0].price.amount /
        firstProduct.offerings[0].price.divisor;

      await client.updateListingInventory(targetListing.listing_id, [
        { sku, property_values: [], offerings: [{ quantity: mockCanMake, price, is_enabled: true }] },
      ]);

      // 5. Verify update persisted
      const afterUpdate = await client.getListingInventory(targetListing.listing_id);
      expect(afterUpdate.products[0].offerings[0].quantity).toBe(mockCanMake);
    });

    it('handles multi-variant listing updates', async () => {
      const listingId = MULTI_VARIANT_LISTING.listing_id;

      // Get current inventory
      const inventory = await client.getListingInventory(listingId);
      expect(inventory.products.length).toBe(3);

      // Update all variants
      const updates = inventory.products.map((p, idx) => ({
        sku: p.sku,
        property_values: p.property_values.map((pv) => ({
          property_id: pv.property_id,
          property_name: pv.property_name,
          value_ids: pv.value_ids,
          values: pv.values,
        })),
        offerings: [
          {
            quantity: idx === 0 ? 2 : idx === 1 ? 3 : 1,
            price: 65,
            is_enabled: true,
          },
        ],
      }));

      await client.updateListingInventory(listingId, updates);

      // Verify all updates
      const afterUpdate = await client.getListingInventory(listingId);
      const product0Id = inventory.products[0]!.product_id;
      const product1Id = inventory.products[1]!.product_id;
      const product2Id = inventory.products[2]!.product_id;
      expect(
        afterUpdate.products.find((p) => p.product_id === product0Id)?.offerings[0]
          .quantity
      ).toBe(2);
      expect(
        afterUpdate.products.find((p) => p.product_id === product1Id)?.offerings[0]
          .quantity
      ).toBe(3);
      expect(
        afterUpdate.products.find((p) => p.product_id === product2Id)?.offerings[0]
          .quantity
      ).toBe(1);

      // Verify listing total quantity updated
      const { listings } = await client.getActiveListings();
      const listing = listings.find((l) => l.listing_id === listingId);
      expect(listing?.quantity).toBe(2 + 3 + 1);
    });
  });

  describe('Diff and idempotency flow', () => {
    it('skips update when no changes needed', async () => {
      const listingId = SINGLE_VARIANT_LISTING.listing_id;
      const inventory = await client.getListingInventory(listingId);

      // Build update with same quantity
      const currentQty = inventory.products[0].offerings[0].quantity;
      const updates = [
        {
          sku: inventory.products[0].sku,
          property_values: [],
          offerings: [{ quantity: currentQty, price: 45, is_enabled: true }],
        },
      ];

      // Should skip update
      expect(shouldSkipUpdate(inventory, updates)).toBe(true);

      // Diff should show no changes
      const diff = computeDiff(inventory, updates);
      expect(diff.wouldUpdate).toBe(false);
      expect(diff.changes).toHaveLength(0);
    });

    it('detects changes and performs update', async () => {
      const listingId = SINGLE_VARIANT_LISTING.listing_id;
      const inventory = await client.getListingInventory(listingId);

      // Build update with different quantity
      const newQty = inventory.products[0].offerings[0].quantity + 5;
      const updates = [
        {
          sku: inventory.products[0].sku,
          property_values: [],
          offerings: [{ quantity: newQty, price: 45, is_enabled: true }],
        },
      ];

      // Should not skip update
      expect(shouldSkipUpdate(inventory, updates)).toBe(false);

      // Diff should show changes
      const diff = computeDiff(inventory, updates);
      expect(diff.wouldUpdate).toBe(true);
      expect(diff.changes).toHaveLength(1);

      // Perform update
      await client.updateListingInventory(listingId, updates);

      // Verify
      const afterUpdate = await client.getListingInventory(listingId);
      expect(afterUpdate.products[0].offerings[0].quantity).toBe(newQty);
    });
  });

  describe('Factory function', () => {
    beforeEach(() => {
      resetEtsyClient();
    });

    it('creates mock client when mode is mock', () => {
      const mockClient = createEtsyClient({ mode: 'mock' });
      expect(mockClient).toBeInstanceOf(MockEtsyClient);
    });

    it('passes config to mock client', async () => {
      const mockClient = createEtsyClient({
        mode: 'mock',
        mockConfig: { connected: false },
      });

      await expect(mockClient.getActiveListings()).rejects.toThrow();
    });
  });

  describe('Error recovery', () => {
    it('handles listing not found gracefully', async () => {
      await expect(client.getListingInventory(99999)).rejects.toThrow();
    });

    it('continues processing after single listing error', async () => {
      const { listings } = await client.getActiveListings();

      // Set error for first listing only
      client.setErrorMode('404', listings[0].listing_id);

      // First listing should fail
      await expect(
        client.getListingInventory(listings[0].listing_id)
      ).rejects.toThrow();

      // Other listings should succeed
      if (listings.length > 1) {
        const inventory = await client.getListingInventory(listings[1].listing_id);
        expect(inventory).toBeDefined();
      }
    });

    it('recovers after clearing error mode', async () => {
      client.setErrorMode('401');
      await expect(client.getActiveListings()).rejects.toThrow();

      client.setErrorMode(null);
      await expect(client.getActiveListings()).resolves.toBeDefined();
    });
  });

  describe('Receipts flow', () => {
    it('fetches and processes receipts', async () => {
      const { receipts, count } = await client.getReceipts();

      expect(count).toBeGreaterThan(0);
      expect(receipts.length).toBeGreaterThan(0);

      // Verify receipt structure
      const receipt = receipts[0];
      expect(receipt.receipt_id).toBeDefined();
      expect(receipt.is_paid).toBeDefined();
      expect(receipt.transactions).toBeDefined();
      expect(receipt.transactions.length).toBeGreaterThan(0);
    });

    it('filters paid receipts', async () => {
      const { receipts } = await client.getReceipts();
      const paidReceipts = receipts.filter((r) => r.is_paid);
      expect(paidReceipts.length).toBeGreaterThan(0);
    });
  });
});
