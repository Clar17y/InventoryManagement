import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
}));

import { etsy } from '../../../lib/api/etsy';
import { request } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);

describe('etsy API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  describe('getStatus', () => {
    it('calls request with correct endpoint', async () => {
      mockRequest.mockResolvedValue({ connected: true, shopId: '123', shopName: 'Test Shop' });

      await etsy.getStatus();

      expect(mockRequest).toHaveBeenCalledWith('/etsy/status');
    });

    it('returns connection status', async () => {
      const status = { connected: true, shopId: '123', shopName: 'Test Shop' };
      mockRequest.mockResolvedValue(status);

      const result = await etsy.getStatus();

      expect(result).toEqual(status);
    });

    it('returns disconnected status', async () => {
      mockRequest.mockResolvedValue({ connected: false });

      const result = await etsy.getStatus();

      expect(result.connected).toBe(false);
    });
  });

  describe('initiateAuth', () => {
    it('calls request with correct endpoint', async () => {
      mockRequest.mockResolvedValue({ authUrl: 'https://etsy.com/oauth', state: 'abc123' });

      await etsy.initiateAuth();

      expect(mockRequest).toHaveBeenCalledWith('/etsy/auth');
    });

    it('returns auth URL and state', async () => {
      const authResponse = { authUrl: 'https://etsy.com/oauth?client_id=...', state: 'random-state' };
      mockRequest.mockResolvedValue(authResponse);

      const result = await etsy.initiateAuth();

      expect(result.authUrl).toContain('etsy.com');
      expect(result.state).toBeTruthy();
    });
  });

  describe('disconnect', () => {
    it('calls request with POST method', async () => {
      mockRequest.mockResolvedValue({ success: true });

      await etsy.disconnect();

      expect(mockRequest).toHaveBeenCalledWith('/etsy/disconnect', { method: 'POST' });
    });

    it('returns success status', async () => {
      mockRequest.mockResolvedValue({ success: true });

      const result = await etsy.disconnect();

      expect(result.success).toBe(true);
    });
  });

  describe('getListings', () => {
    it('calls request with correct endpoint', async () => {
      mockRequest.mockResolvedValue({ listings: [], count: 0 });

      await etsy.getListings();

      expect(mockRequest).toHaveBeenCalledWith('/etsy/listings');
    });

    it('returns listings array and count', async () => {
      const listings = [
        { listing_id: 1, title: 'Test Product', quantity: 5, state: 'active' },
      ];
      mockRequest.mockResolvedValue({ listings, count: 1 });

      const result = await etsy.getListings();

      expect(result.listings).toHaveLength(1);
      expect(result.count).toBe(1);
    });
  });

  describe('importListings', () => {
    it('calls request with POST method', async () => {
      mockRequest.mockResolvedValue({ created: 0, updated: 0, skipped: 0, errors: [] });

      await etsy.importListings();

      expect(mockRequest).toHaveBeenCalledWith('/etsy/import', { method: 'POST' });
    });

    it('returns import results', async () => {
      const importResult = { created: 5, updated: 2, skipped: 1, errors: [] };
      mockRequest.mockResolvedValue(importResult);

      const result = await etsy.importListings();

      expect(result.created).toBe(5);
      expect(result.updated).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors when import fails for some listings', async () => {
      const importResult = { created: 3, updated: 0, skipped: 0, errors: ['Listing 123 failed'] };
      mockRequest.mockResolvedValue(importResult);

      const result = await etsy.importListings();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('failed');
    });
  });

  describe('getComparison', () => {
    it('calls request with correct endpoint', async () => {
      mockRequest.mockResolvedValue({ comparisons: [] });

      await etsy.getComparison();

      expect(mockRequest).toHaveBeenCalledWith('/etsy/sync/comparison');
    });

    it('returns comparison data', async () => {
      const comparisons = [
        {
          etsyListingId: '123',
          title: 'Test Hamper',
          hamperName: 'Test Hamper',
          hamperId: 'ham-1',
          variants: [
            {
              etsySku: null,
              variantId: null,
              variantName: 'Default',
              etsyQuantity: 5,
              inventoryQuantity: 10,
              difference: 5,
              needsSync: true,
            },
          ],
        },
      ];
      mockRequest.mockResolvedValue({ comparisons });

      const result = await etsy.getComparison();

      expect(result.comparisons).toHaveLength(1);
      const comparison = result.comparisons[0]!;
      expect(comparison.variants).toHaveLength(1);
      const variant = comparison.variants[0]!;
      expect(variant.needsSync).toBe(true);
    });
  });

  describe('pushUpdates', () => {
    it('calls request with POST and update data', async () => {
      mockRequest.mockResolvedValue({ success: true, updated: 1 });

      const updates = {
        updates: [{ etsyListingId: '123', etsySku: null, etsyProductId: '456', quantity: 10 }],
      };

      await etsy.pushUpdates(updates);

      expect(mockRequest).toHaveBeenCalledWith('/etsy/sync/push', {
        method: 'POST',
        body: JSON.stringify(updates),
      });
    });

    it('returns success result', async () => {
      mockRequest.mockResolvedValue({ success: true, updated: 3 });

      const result = await etsy.pushUpdates({ updates: [] });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(3);
    });

    it('returns error on failure', async () => {
      mockRequest.mockResolvedValue({ success: false, updated: 0, error: 'Rate limited' });

      const result = await etsy.pushUpdates({ updates: [] });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limited');
    });
  });

  describe('getPendingOrders', () => {
    it('calls request with correct endpoint', async () => {
      mockRequest.mockResolvedValue({ orders: [] });

      await etsy.getPendingOrders();

      expect(mockRequest).toHaveBeenCalledWith('/etsy/sync/orders/pending');
    });

    it('returns pending orders', async () => {
      const orders = [
        {
          receiptId: 12345,
          buyerName: 'John Doe',
          createdAt: '2024-01-15T10:00:00Z',
          isPaid: true,
          isShipped: false,
          grandTotal: 35,
          subtotal: 30,
          shippingCost: 5,
          items: [{ transactionId: 1, listingId: 123, title: 'Test', quantity: 1, price: 30, sku: null }],
        },
      ];
      mockRequest.mockResolvedValue({ orders });

      const result = await etsy.getPendingOrders();

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]!.buyerName).toBe('John Doe');
    });
  });

  describe('importOrder', () => {
    it('calls request with POST and order data', async () => {
      mockRequest.mockResolvedValue({
        success: true,
        sale: { id: 'sale-1', etsyOrderId: '12345', lines: 1 },
      });

      await etsy.importOrder({ receiptId: 12345, postageCost: 3.5 });

      expect(mockRequest).toHaveBeenCalledWith('/etsy/sync/orders/import', {
        method: 'POST',
        body: JSON.stringify({ receiptId: 12345, postageCost: 3.5 }),
      });
    });

    it('returns imported sale info', async () => {
      mockRequest.mockResolvedValue({
        success: true,
        sale: { id: 'sale-1', etsyOrderId: '12345', lines: 2 },
      });

      const result = await etsy.importOrder({ receiptId: 12345, postageCost: 3.5 });

      expect(result.success).toBe(true);
      expect(result.sale.id).toBe('sale-1');
      expect(result.sale.lines).toBe(2);
    });
  });
});
