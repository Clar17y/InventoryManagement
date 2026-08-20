import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
}));

import {
  productBarcodeResponseSchema,
  productResponseSchema,
  productsListQuerySchema,
  productsListResponseSchema,
} from '#contracts/routes/products';
import { listAllProducts, products, Product } from '../../../lib/api/products';
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
    it('serializes and validates paginated filters', async () => {
      const categoryId = `c${'1'.repeat(24)}`;
      const params = {
        page: 2,
        pageSize: 50 as const,
        categoryId,
        search: 'tea',
        sort: 'name' as const,
        direction: 'asc' as const,
      };
      const response = {
        items: [sampleProduct],
        pagination: { page: 2, pageSize: 50 as const, totalItems: 51, totalPages: 2 },
      };
      mockRequestWithSchema.mockResolvedValue(response);

      expect(productsListQuerySchema.parse({
        ...params,
        page: '2',
        pageSize: '50',
        search: ' tea ',
      })).toEqual({ ...params, search: 'tea' });
      expect(() => productsListQuerySchema.parse({ pageSize: '10' })).toThrow();

      const controller = new AbortController();
      await products.list(params, { signal: controller.signal });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        `/products?page=2&pageSize=50&categoryId=${categoryId}&search=tea&sort=name&direction=asc`,
        productsListResponseSchema,
        { signal: controller.signal },
      );
    });

    it('calls request without filters and returns the shared response envelope', async () => {
      const response = {
        items: [sampleProduct],
        pagination: { page: 1, pageSize: 25 as const, totalItems: 1, totalPages: 1 },
      };
      mockRequestWithSchema.mockResolvedValue(response);

      const result = await products.list();

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/products', productsListResponseSchema);
      expect(result).toEqual(response);
    });
  });

  describe('listAllProducts', () => {
    it('follows every page at the compatibility limit and preserves pagination metadata', async () => {
      const pageOne = {
        items: Array.from({ length: 100 }, (_, index) => ({ ...sampleProduct, id: `prod-${index}` })),
        pagination: { page: 1, pageSize: 100 as const, totalItems: 101, totalPages: 2 },
      };
      const pageTwo = {
        items: [{ ...sampleProduct, id: 'prod-100' }],
        pagination: { page: 2, pageSize: 100 as const, totalItems: 101, totalPages: 2 },
      };
      mockRequestWithSchema.mockResolvedValueOnce(pageOne).mockResolvedValueOnce(pageTwo);
      const controller = new AbortController();

      const result = await listAllProducts({}, { signal: controller.signal });

      expect(result.items).toHaveLength(101);
      expect(result.pagination).toEqual(pageOne.pagination);
      expect(mockRequestWithSchema).toHaveBeenNthCalledWith(
        1,
        '/products?page=1&pageSize=100',
        productsListResponseSchema,
        { signal: controller.signal },
      );
      expect(mockRequestWithSchema).toHaveBeenNthCalledWith(
        2,
        '/products?page=2&pageSize=100',
        productsListResponseSchema,
        { signal: controller.signal },
      );
    });

    it('stops before merging when its signal is aborted', async () => {
      const controller = new AbortController();
      const pageOne = {
        items: [{ ...sampleProduct, id: 'prod-1' }],
        pagination: { page: 1, pageSize: 100 as const, totalItems: 101, totalPages: 2 },
      };
      mockRequestWithSchema.mockImplementationOnce(async () => {
        controller.abort();
        return pageOne;
      });

      await expect(listAllProducts({}, { signal: controller.signal })).rejects.toThrow('aborted');
      expect(mockRequestWithSchema).toHaveBeenCalledTimes(1);
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
