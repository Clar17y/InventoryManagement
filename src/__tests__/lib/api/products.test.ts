import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
}));

import {
  productBarcodeResponseSchema,
  productResponseSchema,
  productsListResponseSchema,
} from '#contracts/routes/products';
import { products, Product } from '../../../lib/api/products';
import { request, requestWithSchema } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);
const mockRequestWithSchema = vi.mocked(requestWithSchema);

describe('products API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequestWithSchema.mockReset();
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
      mockRequestWithSchema.mockResolvedValue([sampleProduct]);

      await products.list();

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/products', productsListResponseSchema);
    });

    it('calls request with categoryId filter', async () => {
      mockRequestWithSchema.mockResolvedValue([sampleProduct]);

      await products.list('cat-1');

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/products?categoryId=cat-1',
        productsListResponseSchema
      );
    });

    it('returns array of products', async () => {
      mockRequestWithSchema.mockResolvedValue([sampleProduct]);

      const result = await products.list();

      expect(result).toEqual([sampleProduct]);
    });
  });

  describe('get', () => {
    it('calls request with product id', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleProduct);

      await products.get('prod-1');

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/products/prod-1', productResponseSchema);
    });
  });

  describe('getByBarcode', () => {
    it('calls request with barcode', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleProduct);

      await products.getByBarcode('1234567890123');

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/products/barcode/1234567890123',
        productResponseSchema
      );
    });
  });

  describe('create', () => {
    it('calls request with POST and product data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleProduct);

      const data = {
        name: 'Dark Chocolate Bar',
        categoryId: 'cat-1',
        barcode: '1234567890123',
      };

      await products.create(data);

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/products', productResponseSchema, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('update', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleProduct);

      await products.update('prod-1', { name: 'Updated Name' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/products/prod-1', productResponseSchema, {
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
      mockRequestWithSchema.mockResolvedValue(barcode);

      await products.addBarcode('prod-1', '9876543210987');

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/products/prod-1/barcodes',
        productBarcodeResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify({ barcode: '9876543210987' }),
        }
      );
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
