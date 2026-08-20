import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
}));

import {
  hamperDetailResponseSchema,
  hamperResponseSchema,
  hamperVariantResponseSchema,
  hamperVariantsListResponseSchema,
  hampersListResponseSchema,
} from '#contracts/routes/hampers';
import { hampers, hamperVariants, Hamper, HamperDetail, HamperVariant } from '../../../lib/api/hampers';
import { request, requestWithSchema } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);
const mockRequestWithSchema = vi.mocked(requestWithSchema);

describe('hampers API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequestWithSchema.mockReset();
  });

  const sampleHamper: Hamper = {
    id: 'ham-1',
    name: 'Chocolate Lovers',
    sellingPrice: 35,
    etsyListingId: '12345',
    etsyIsEnabled: true,
    hasVariants: false,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    requirements: [
      { id: 'req-1', categoryId: 'cat-1', category: { id: 'cat-1', name: 'Chocolates' }, quantity: 3, isOptional: false },
    ],
    canMake: 5,
  };

  const sampleHamperDetail: HamperDetail = {
    ...sampleHamper,
    requirements: [
      {
        id: 'req-1',
        category: { id: 'cat-1', name: 'Chocolates' },
        isOptional: false,
        quantityRequired: 3,
        availableStock: 15,
        canFulfill: 5,
        estimatedCost: 7.5,
      },
    ],
    estimatedCost: 7.5,
    estimatedMargin: 27.5,
    variants: [],
  };

  describe('list', () => {
    it('calls request with the shared pagination query and envelope', async () => {
      mockRequestWithSchema.mockResolvedValue({
        items: [sampleHamper],
        pagination: { page: 2, pageSize: 25, totalItems: 26, totalPages: 2 },
      });

      await hampers.list({
        page: 2,
        pageSize: 25,
        search: 'chocolate',
        hideEtsyHidden: true,
        sort: 'name-asc',
      });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/hampers?page=2&pageSize=25&search=chocolate&hideEtsyHidden=true&sort=name-asc',
        hampersListResponseSchema,
        undefined,
      );
    });

    it('forwards an abort signal to the list request', async () => {
      mockRequestWithSchema.mockResolvedValue({
        items: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      });
      const signal = new AbortController().signal;

      await hampers.list({ page: 1, pageSize: 25 }, { signal });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/hampers?page=1&pageSize=25',
        hampersListResponseSchema,
        { signal },
      );
    });
  });

  describe('get', () => {
    it('calls request with hamper id', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleHamperDetail);

      await hampers.get('ham-1');

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/hampers/ham-1', hamperDetailResponseSchema);
    });

    it('returns hamper detail with requirements', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleHamperDetail);

      const result = await hampers.get('ham-1');

      expect(result.estimatedCost).toBe(7.5);
      expect(result.estimatedMargin).toBe(27.5);
    });
  });

  describe('create', () => {
    it('calls request with POST and hamper data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleHamper as any);

      const data = {
        name: 'Chocolate Lovers',
        sellingPrice: 35,
        etsyListingId: '12345',
        requirements: [{ categoryId: 'cat-1', quantity: 3 }],
      };

      await hampers.create(data);

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/hampers', hamperResponseSchema, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });

    it('includes hasVariants when provided', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleHamper as any);

      const data = {
        name: 'Multi Variant Hamper',
        sellingPrice: 50,
        hasVariants: true,
        requirements: [{ categoryId: 'cat-1', quantity: 2 }],
      };

      await hampers.create(data);

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/hampers', hamperResponseSchema, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('update', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleHamper as any);

      await hampers.update('ham-1', { name: 'Updated Hamper', sellingPrice: 40 });

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/hampers/ham-1', hamperResponseSchema, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Hamper', sellingPrice: 40 }),
      });
    });
  });

  describe('delete', () => {
    it('calls request with DELETE method', async () => {
      mockRequest.mockResolvedValue(undefined);

      await hampers.delete('ham-1');

      expect(mockRequest).toHaveBeenCalledWith('/hampers/ham-1', {
        method: 'DELETE',
      });
    });
  });
});

describe('hamperVariants API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequestWithSchema.mockReset();
  });

  const sampleVariant: HamperVariant = {
    id: 'var-1',
    hamperId: 'ham-1',
    name: 'Dark Chocolate Selection',
    etsySku: 'HAM-DARK-001',
    etsyIsEnabled: true,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    canMake: 3,
    mappings: [
      {
        categoryId: 'cat-1',
        productId: 'prod-1',
        priority: 1,
        category: { id: 'cat-1', name: 'Chocolates' },
        product: { id: 'prod-1', name: 'Dark Chocolate Bar' },
      },
    ],
  };

  describe('list', () => {
    it('calls request with hamper id', async () => {
      mockRequestWithSchema.mockResolvedValue([sampleVariant]);

      await hamperVariants.list('ham-1');

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/hampers/ham-1/variants',
        hamperVariantsListResponseSchema
      );
    });
  });

  describe('create', () => {
    it('calls request with POST and variant data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleVariant);

      const data = {
        name: 'Dark Chocolate Selection',
        etsySku: 'HAM-DARK-001',
        mappings: [{ categoryId: 'cat-1', productId: 'prod-1' }],
      };

      await hamperVariants.create('ham-1', data);

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/hampers/ham-1/variants', hamperVariantResponseSchema, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('update', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleVariant);

      await hamperVariants.update('ham-1', 'var-1', { name: 'Updated Variant' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/hampers/ham-1/variants/var-1',
        hamperVariantResponseSchema,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Variant' }),
        }
      );
    });
  });

  describe('delete', () => {
    it('calls request with DELETE method', async () => {
      mockRequest.mockResolvedValue(undefined);

      await hamperVariants.delete('ham-1', 'var-1');

      expect(mockRequest).toHaveBeenCalledWith('/hampers/ham-1/variants/var-1', {
        method: 'DELETE',
      });
    });
  });
});
