import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
}));

import { inventory, type InventoryLot, type CategoryLot } from '../../../lib/api/inventory';
import { request } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);

describe('inventory API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  const sampleLot: InventoryLot = {
    id: 'lot-1',
    productId: 'prod-1',
    quantity: 20,
    remaining: 15,
    unitCost: 2.5,
    receivedAt: '2024-01-01T00:00:00Z',
    expiresAt: '2025-06-01T00:00:00Z',
  };

  const sampleCategoryLot: CategoryLot = {
    ...sampleLot,
    productName: 'Dark Chocolate',
  };

  describe('byCategory', () => {
    it('calls request with correct endpoint', async () => {
      mockRequest.mockResolvedValue([{ id: 'cat-1', name: 'Chocolates', productCount: 1, totalStock: 15 }]);

      await inventory.byCategory();

      expect(mockRequest).toHaveBeenCalledWith('/inventory/by-category');
    });

    it('returns category summaries', async () => {
      const summary = { id: 'cat-1', name: 'Chocolates', productCount: 1, totalStock: 15 };
      mockRequest.mockResolvedValue([summary]);

      const result = await inventory.byCategory();

      expect(result).toEqual([summary]);
    });
  });

  describe('lots', () => {
    it('calls request with product id', async () => {
      mockRequest.mockResolvedValue([sampleLot]);

      await inventory.lots('prod-1');

      expect(mockRequest).toHaveBeenCalledWith('/inventory/lots/prod-1');
    });
  });

  describe('lotsByCategory', () => {
    it('calls request with category id', async () => {
      mockRequest.mockResolvedValue([sampleCategoryLot]);

      await inventory.lotsByCategory('cat-1');

      expect(mockRequest).toHaveBeenCalledWith('/inventory/lots-by-category/cat-1');
    });
  });

  describe('addLot', () => {
    it('calls request with POST and lot data', async () => {
      mockRequest.mockResolvedValue(sampleLot);

      const data = {
        productId: 'prod-1',
        quantity: 20,
        unitCost: 2.5,
        expiresAt: '2025-06-01T00:00:00Z',
      };

      await inventory.addLot(data);

      expect(mockRequest).toHaveBeenCalledWith('/inventory/lots', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('updateLot', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequest.mockResolvedValue(sampleLot);

      await inventory.updateLot('lot-1', { remaining: 10 });

      expect(mockRequest).toHaveBeenCalledWith('/inventory/lots/lot-1', {
        method: 'PUT',
        body: JSON.stringify({ remaining: 10 }),
      });
    });
  });

  describe('deleteLot', () => {
    it('calls request with DELETE method', async () => {
      mockRequest.mockResolvedValue(undefined);

      await inventory.deleteLot('lot-1');

      expect(mockRequest).toHaveBeenCalledWith('/inventory/lots/lot-1', {
        method: 'DELETE',
      });
    });
  });

  describe('lowStock', () => {
    it('calls request for low stock alerts', async () => {
      mockRequest.mockResolvedValue([]);

      await inventory.lowStock();

      expect(mockRequest).toHaveBeenCalledWith('/inventory/alerts/low-stock');
    });
  });

  describe('expiring', () => {
    it('calls request without days parameter', async () => {
      mockRequest.mockResolvedValue([]);

      await inventory.expiring();

      expect(mockRequest).toHaveBeenCalledWith('/inventory/alerts/expiring');
    });

    it('calls request with days parameter', async () => {
      mockRequest.mockResolvedValue([sampleLot]);

      await inventory.expiring(30);

      expect(mockRequest).toHaveBeenCalledWith('/inventory/alerts/expiring?days=30');
    });
  });
});

