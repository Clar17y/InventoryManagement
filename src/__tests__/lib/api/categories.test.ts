import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the request function
vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
}));

import { categories, Category } from '../../../lib/api/categories';
import { request } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);

describe('categories API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
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
      mockRequest.mockResolvedValue([sampleCategory]);

      await categories.list();

      expect(mockRequest).toHaveBeenCalledWith('/categories');
    });

    it('returns array of categories', async () => {
      mockRequest.mockResolvedValue([sampleCategory]);

      const result = await categories.list();

      expect(result).toEqual([sampleCategory]);
    });
  });

  describe('get', () => {
    it('calls request with correct endpoint and id', async () => {
      mockRequest.mockResolvedValue(sampleCategory);

      await categories.get('cat-1');

      expect(mockRequest).toHaveBeenCalledWith('/categories/cat-1');
    });

    it('returns single category', async () => {
      mockRequest.mockResolvedValue(sampleCategory);

      const result = await categories.get('cat-1');

      expect(result).toEqual(sampleCategory);
    });
  });

  describe('create', () => {
    it('calls request with POST method and data', async () => {
      mockRequest.mockResolvedValue(sampleCategory);

      await categories.create({ name: 'Chocolates', description: 'Chocolate items' });

      expect(mockRequest).toHaveBeenCalledWith('/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Chocolates', description: 'Chocolate items' }),
      });
    });

    it('includes pickRule when provided', async () => {
      mockRequest.mockResolvedValue(sampleCategory);

      await categories.create({ name: 'Drinks', pickRule: 'FEFO' });

      expect(mockRequest).toHaveBeenCalledWith('/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Drinks', pickRule: 'FEFO' }),
      });
    });

    it('returns created category', async () => {
      mockRequest.mockResolvedValue(sampleCategory);

      const result = await categories.create({ name: 'Chocolates' });

      expect(result).toEqual(sampleCategory);
    });
  });

  describe('update', () => {
    it('calls request with PUT method and partial data', async () => {
      mockRequest.mockResolvedValue({ ...sampleCategory, name: 'Updated' });

      await categories.update('cat-1', { name: 'Updated' });

      expect(mockRequest).toHaveBeenCalledWith('/categories/cat-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });
    });

    it('can update multiple fields', async () => {
      mockRequest.mockResolvedValue(sampleCategory);

      await categories.update('cat-1', {
        name: 'New Name',
        description: 'New Description',
        pickRule: 'CHEAPEST',
      });

      expect(mockRequest).toHaveBeenCalledWith('/categories/cat-1', {
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
      mockRequest.mockResolvedValue(updated);

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
