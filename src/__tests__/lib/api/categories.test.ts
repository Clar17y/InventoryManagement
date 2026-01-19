import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the request function
vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
}));

import { categoriesListResponseSchema, categoryResponseSchema } from '#contracts/routes/categories';
import { categories, Category } from '../../../lib/api/categories';
import { request, requestWithSchema } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);
const mockRequestWithSchema = vi.mocked(requestWithSchema);

describe('categories API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequestWithSchema.mockReset();
  });

  const sampleCategory: Category = {
    id: 'cat-1',
    name: 'Chocolates',
    description: 'Chocolate items',
    pickRule: 'FIFO',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    _count: { products: 5 },
  };

  describe('list', () => {
    it('calls request with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue([sampleCategory]);

      await categories.list();

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/categories', categoriesListResponseSchema);
    });

    it('returns array of categories', async () => {
      mockRequestWithSchema.mockResolvedValue([sampleCategory]);

      const result = await categories.list();

      expect(result).toEqual([sampleCategory]);
    });
  });

  describe('get', () => {
    it('calls request with correct endpoint and id', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleCategory);

      await categories.get('cat-1');

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/categories/cat-1', categoryResponseSchema);
    });

    it('returns single category', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleCategory);

      const result = await categories.get('cat-1');

      expect(result).toEqual(sampleCategory);
    });
  });

  describe('create', () => {
    it('calls request with POST method and data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleCategory);

      await categories.create({ name: 'Chocolates', description: 'Chocolate items' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/categories', categoryResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ name: 'Chocolates', description: 'Chocolate items' }),
      });
    });

    it('includes pickRule when provided', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleCategory);

      await categories.create({ name: 'Drinks', pickRule: 'FEFO' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/categories', categoryResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ name: 'Drinks', pickRule: 'FEFO' }),
      });
    });

    it('returns created category', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleCategory);

      const result = await categories.create({ name: 'Chocolates' });

      expect(result).toEqual(sampleCategory);
    });
  });

  describe('update', () => {
    it('calls request with PUT method and partial data', async () => {
      mockRequestWithSchema.mockResolvedValue({ ...sampleCategory, name: 'Updated' });

      await categories.update('cat-1', { name: 'Updated' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/categories/cat-1', categoryResponseSchema, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });
    });

    it('can update multiple fields', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleCategory);

      await categories.update('cat-1', {
        name: 'New Name',
        description: 'New Description',
        pickRule: 'CHEAPEST',
      });

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/categories/cat-1', categoryResponseSchema, {
        method: 'PUT',
        body: JSON.stringify({
          name: 'New Name',
          description: 'New Description',
          pickRule: 'CHEAPEST',
        }),
      });
    });

    it('returns updated category', async () => {
      const updated = { ...sampleCategory, name: 'Updated' };
      mockRequestWithSchema.mockResolvedValue(updated);

      const result = await categories.update('cat-1', { name: 'Updated' });

      expect(result).toEqual(updated);
    });
  });

  describe('delete', () => {
    it('calls request with DELETE method', async () => {
      mockRequest.mockResolvedValue(undefined);

      await categories.delete('cat-1');

      expect(mockRequest).toHaveBeenCalledWith('/categories/cat-1', {
        method: 'DELETE',
      });
    });

    it('returns void', async () => {
      mockRequest.mockResolvedValue(undefined);

      const result = await categories.delete('cat-1');

      expect(result).toBeUndefined();
    });
  });
});
