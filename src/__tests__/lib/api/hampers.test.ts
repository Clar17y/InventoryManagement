import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
}));

import { hampers, hamperVariants, Hamper, HamperDetail, HamperVariant } from '../../../lib/api/hampers';
import { request } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);

describe('hampers API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  const sampleHamper: Hamper = {
    id: 'ham-1',
    name: 'Chocolate Lovers',
    sellingPrice: 35,
    etsyListingId: '12345',
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
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Chocolates' },
        quantity: 3,
        isOptional: false,
        quantityRequired: 3,
        availableStock: 15,
        canFulfill: 5,
        estimatedCost: 7.5,
      },
    ],
    estimatedCost: 7.5,
    estimatedMargin: 27.5,
  };

  describe('list', () => {
    it('calls request with correct endpoint', async () => {
      mockRequest.mockResolvedValue([sampleHamper]);

      await hampers.list();

      expect(mockRequest).toHaveBeenCalledWith('/hampers');
    });
  });

  describe('get', () => {
    it('calls request with hamper id', async () => {
      mockRequest.mockResolvedValue(sampleHamperDetail);

      await hampers.get('ham-1');

      expect(mockRequest).toHaveBeenCalledWith('/hampers/ham-1');
    });

    it('returns hamper detail with requirements', async () => {
      mockRequest.mockResolvedValue(sampleHamperDetail);

      const result = await hampers.get('ham-1');

      expect(result.estimatedCost).toBe(7.5);
      expect(result.estimatedMargin).toBe(27.5);
    });
  });

  describe('create', () => {
    it('calls request with POST and hamper data', async () => {
      mockRequest.mockResolvedValue(sampleHamper);

      const data = {
        name: 'Chocolate Lovers',
        sellingPrice: 35,
        etsyListingId: '12345',
        requirements: [{ categoryId: 'cat-1', quantity: 3 }],
      };

      await hampers.create(data);

      expect(mockRequest).toHaveBeenCalledWith('/hampers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });

    it('includes hasVariants when provided', async () => {
      mockRequest.mockResolvedValue(sampleHamper);

      const data = {
        name: 'Multi Variant Hamper',
        sellingPrice: 50,
        hasVariants: true,
        requirements: [{ categoryId: 'cat-1', quantity: 2 }],
      };

      await hampers.create(data);

      expect(mockRequest).toHaveBeenCalledWith('/hampers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('update', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequest.mockResolvedValue(sampleHamper);

      await hampers.update('ham-1', { name: 'Updated Hamper', sellingPrice: 40 });

      expect(mockRequest).toHaveBeenCalledWith('/hampers/ham-1', {
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
  });

  const sampleVariant: HamperVariant = {
    id: 'var-1',
    hamperId: 'ham-1',
    name: 'Dark Chocolate Selection',
    etsySku: 'HAM-DARK-001',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    canMake: 3,
    mappings: [
      { categoryId: 'cat-1', productId: 'prod-1', category: { id: 'cat-1', name: 'Chocolates' } },
    ],
  };

  describe('list', () => {
    it('calls request with hamper id', async () => {
      mockRequest.mockResolvedValue([sampleVariant]);

      await hamperVariants.list('ham-1');

      expect(mockRequest).toHaveBeenCalledWith('/hampers/ham-1/variants');
    });
  });

  describe('create', () => {
    it('calls request with POST and variant data', async () => {
      mockRequest.mockResolvedValue(sampleVariant);

      const data = {
        name: 'Dark Chocolate Selection',
        etsySku: 'HAM-DARK-001',
        mappings: [{ categoryId: 'cat-1', productId: 'prod-1' }],
      };

      await hamperVariants.create('ham-1', data);

      expect(mockRequest).toHaveBeenCalledWith('/hampers/ham-1/variants', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('update', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequest.mockResolvedValue(sampleVariant);

      await hamperVariants.update('ham-1', 'var-1', { name: 'Updated Variant' });

      expect(mockRequest).toHaveBeenCalledWith('/hampers/ham-1/variants/var-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Variant' }),
      });
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
