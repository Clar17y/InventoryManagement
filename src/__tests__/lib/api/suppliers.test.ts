import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
}));

import {
  suppliersResponseSchema,
  supplierResponseSchema,
  supplierLowStockResponseSchema,
  productSupplierIdsResponseSchema,
} from '#contracts/routes/suppliers';
import { suppliers } from '../../../lib/api/suppliers';
import { request, requestWithSchema } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);
const mockRequestWithSchema = vi.mocked(requestWithSchema);

describe('suppliers API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequestWithSchema.mockReset();
  });

  const sampleSupplier = {
    id: 's1',
    name: 'Home Bargains',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  describe('list', () => {
    it('calls request with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue([sampleSupplier]);

      await suppliers.list();

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/suppliers',
        suppliersResponseSchema
      );
    });

    it('returns array of suppliers', async () => {
      mockRequestWithSchema.mockResolvedValue([sampleSupplier]);

      const result = await suppliers.list();

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Home Bargains');
    });
  });

  describe('create', () => {
    it('calls request with POST and supplier data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleSupplier);

      await suppliers.create({ name: 'Home Bargains' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/suppliers',
        supplierResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Home Bargains' }),
        }
      );
    });
  });

  describe('update', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleSupplier);

      await suppliers.update('s1', { name: 'Updated' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/suppliers/s1',
        supplierResponseSchema,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );
    });
  });

  describe('delete', () => {
    it('calls request with DELETE method', async () => {
      mockRequest.mockResolvedValue(undefined);

      await suppliers.delete('s1');

      expect(mockRequest).toHaveBeenCalledWith('/suppliers/s1', {
        method: 'DELETE',
      });
    });
  });

  describe('lowStock', () => {
    const sampleLowStock = [
      {
        id: 'p1',
        name: 'Ribbon',
        categoryName: 'Packaging',
        unit: 'units',
        totalStock: 2,
        lowStockThreshold: 5,
      },
    ];

    it('calls request with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleLowStock);

      await suppliers.lowStock('s1');

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/suppliers/s1/low-stock',
        supplierLowStockResponseSchema
      );
    });

    it('returns array of low stock items', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleLowStock);

      const result = await suppliers.lowStock('s1');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Ribbon');
      expect(result[0]!.totalStock).toBe(2);
    });
  });

  describe('getProductSuppliers', () => {
    it('calls request with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue(['s1', 's2']);

      await suppliers.getProductSuppliers('prod-1');

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/suppliers/by-product/prod-1',
        productSupplierIdsResponseSchema
      );
    });

    it('returns array of supplier IDs', async () => {
      mockRequestWithSchema.mockResolvedValue(['s1', 's2']);

      const result = await suppliers.getProductSuppliers('prod-1');

      expect(result).toEqual(['s1', 's2']);
    });
  });

  describe('setProductSuppliers', () => {
    it('calls request with PUT and supplier IDs', async () => {
      mockRequestWithSchema.mockResolvedValue(['s1', 's2']);

      await suppliers.setProductSuppliers('prod-1', ['s1', 's2']);

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/suppliers/by-product/prod-1',
        productSupplierIdsResponseSchema,
        {
          method: 'PUT',
          body: JSON.stringify({ supplierIds: ['s1', 's2'] }),
        }
      );
    });
  });
});
