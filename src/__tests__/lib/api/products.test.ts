import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
}));

import { products, Product } from '../../../lib/api/products';
import { request } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);

describe('products API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  const sampleProduct: Product = {
    id: 'prod-1',
    name: 'Dark Chocolate Bar',
    barcode: '1234567890123',
    barcodes: [{ id: 'bar-1', barcode: '1234567890123' }],
    categoryId: 'cat-1',
    category: {
      id: 'cat-1',
      name: 'Chocolates',
      description: null,
      pickRule: 'FIFO',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    unit: 'units',
    lowStockThreshold: 10,
    isActive: true,
    totalStock: 25,
    currentCost: 2.5,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  describe('list', () => {
    it('calls request without categoryId', async () => {
      mockRequest.mockResolvedValue([sampleProduct]);

      await products.list();

      expect(mockRequest).toHaveBeenCalledWith('/products');
    });

    it('calls request with categoryId filter', async () => {
      mockRequest.mockResolvedValue([sampleProduct]);

      await products.list('cat-1');

      expect(mockRequest).toHaveBeenCalledWith('/products?categoryId=cat-1');
    });

    it('returns array of products', async () => {
      mockRequest.mockResolvedValue([sampleProduct]);

      const result = await products.list();

      expect(result).toEqual([sampleProduct]);
    });
  });

  describe('get', () => {
    it('calls request with product id', async () => {
      mockRequest.mockResolvedValue(sampleProduct);

      await products.get('prod-1');

      expect(mockRequest).toHaveBeenCalledWith('/products/prod-1');
    });
  });

  describe('getByBarcode', () => {
    it('calls request with barcode', async () => {
      mockRequest.mockResolvedValue(sampleProduct);

      await products.getByBarcode('1234567890123');

      expect(mockRequest).toHaveBeenCalledWith('/products/barcode/1234567890123');
    });

    it('returns product or null', async () => {
      mockRequest.mockResolvedValue(null);

      const result = await products.getByBarcode('unknown');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('calls request with POST and product data', async () => {
      mockRequest.mockResolvedValue(sampleProduct);

      const data = {
        name: 'Dark Chocolate Bar',
        categoryId: 'cat-1',
        barcode: '1234567890123',
      };

      await products.create(data);

      expect(mockRequest).toHaveBeenCalledWith('/products', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('update', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequest.mockResolvedValue(sampleProduct);

      await products.update('prod-1', { name: 'Updated Name' });

      expect(mockRequest).toHaveBeenCalledWith('/products/prod-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });
    });
  });

  describe('delete', () => {
    it('calls request with DELETE method', async () => {
      mockRequest.mockResolvedValue(undefined);

      await products.delete('prod-1');

      expect(mockRequest).toHaveBeenCalledWith('/products/prod-1', {
        method: 'DELETE',
      });
    });
  });

  describe('addBarcode', () => {
    it('calls request with POST to add barcode', async () => {
      const barcode = { id: 'bar-2', barcode: '9876543210987' };
      mockRequest.mockResolvedValue(barcode);

      await products.addBarcode('prod-1', '9876543210987');

      expect(mockRequest).toHaveBeenCalledWith('/products/prod-1/barcodes', {
        method: 'POST',
        body: JSON.stringify({ barcode: '9876543210987' }),
      });
    });
  });

  describe('removeBarcode', () => {
    it('calls request with DELETE to remove barcode', async () => {
      mockRequest.mockResolvedValue(undefined);

      await products.removeBarcode('prod-1', 'bar-1');

      expect(mockRequest).toHaveBeenCalledWith('/products/prod-1/barcodes/bar-1', {
        method: 'DELETE',
      });
    });
  });
});
