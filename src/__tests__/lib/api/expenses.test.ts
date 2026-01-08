import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
}));

import { expenses, BusinessExpense, ExpenseSummary } from '../../../lib/api/expenses';
import { request } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);

describe('expenses API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  const sampleExpense: BusinessExpense = {
    id: 'exp-1',
    date: '2024-01-15',
    category: 'STOCK',
    supplier: 'Wholesale Co',
    description: 'Chocolate supplies',
    amountIncVat: 120,
    amountExcVat: 100,
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  describe('list', () => {
    it('calls request with empty params', async () => {
      mockRequest.mockResolvedValue({ expenses: [sampleExpense], total: 1, limit: 20, offset: 0 });

      await expenses.list();

      expect(mockRequest).toHaveBeenCalledWith('/expenses?');
    });

    it('calls request with all filter params', async () => {
      mockRequest.mockResolvedValue({ expenses: [], total: 0, limit: 10, offset: 5 });

      await expenses.list({
        category: 'STOCK',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        search: 'chocolate',
        limit: 10,
        offset: 5,
      });

      expect(mockRequest).toHaveBeenCalledWith(
        '/expenses?category=STOCK&startDate=2024-01-01&endDate=2024-01-31&search=chocolate&limit=10&offset=5'
      );
    });

    it('builds query string with partial params', async () => {
      mockRequest.mockResolvedValue({ expenses: [], total: 0, limit: 20, offset: 0 });

      await expenses.list({ category: 'ADVERTISING' });

      expect(mockRequest).toHaveBeenCalledWith('/expenses?category=ADVERTISING');
    });
  });

  describe('get', () => {
    it('calls request with expense id', async () => {
      mockRequest.mockResolvedValue(sampleExpense);

      await expenses.get('exp-1');

      expect(mockRequest).toHaveBeenCalledWith('/expenses/exp-1');
    });
  });

  describe('summary', () => {
    const sampleSummary: ExpenseSummary = {
      byCategory: [
        { category: 'STOCK', totalIncVat: 1200, totalExcVat: 1000, count: 10 },
        { category: 'POSTAGE', totalIncVat: 360, totalExcVat: 300, count: 30 },
      ],
      byMonth: [
        { month: '2024-01', totalIncVat: 780, totalExcVat: 650, count: 20 },
      ],
      totals: { totalIncVat: 1560, totalExcVat: 1300, count: 40 },
    };

    it('calls request with empty params', async () => {
      mockRequest.mockResolvedValue(sampleSummary);

      await expenses.summary();

      expect(mockRequest).toHaveBeenCalledWith('/expenses/summary?');
    });

    it('calls request with date filter params', async () => {
      mockRequest.mockResolvedValue(sampleSummary);

      await expenses.summary({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        search: 'wholesale',
      });

      expect(mockRequest).toHaveBeenCalledWith(
        '/expenses/summary?startDate=2024-01-01&endDate=2024-01-31&search=wholesale'
      );
    });
  });

  describe('create', () => {
    it('calls request with POST and expense data', async () => {
      mockRequest.mockResolvedValue(sampleExpense);

      const data = {
        date: '2024-01-15',
        category: 'STOCK' as const,
        supplier: 'Wholesale Co',
        description: 'Chocolate supplies',
        amountIncVat: 120,
        amountExcVat: 100,
      };

      await expenses.create(data);

      expect(mockRequest).toHaveBeenCalledWith('/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });

    it('creates expense without optional fields', async () => {
      mockRequest.mockResolvedValue(sampleExpense);

      const data = {
        category: 'OTHER' as const,
        description: 'Miscellaneous',
        amountIncVat: 50,
        amountExcVat: 50,
      };

      await expenses.create(data);

      expect(mockRequest).toHaveBeenCalledWith('/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('update', () => {
    it('calls request with PUT and partial data', async () => {
      mockRequest.mockResolvedValue(sampleExpense);

      await expenses.update('exp-1', { description: 'Updated description' });

      expect(mockRequest).toHaveBeenCalledWith('/expenses/exp-1', {
        method: 'PUT',
        body: JSON.stringify({ description: 'Updated description' }),
      });
    });

    it('can update multiple fields', async () => {
      mockRequest.mockResolvedValue(sampleExpense);

      await expenses.update('exp-1', {
        category: 'PACKAGING',
        amountIncVat: 150,
        amountExcVat: 125,
      });

      expect(mockRequest).toHaveBeenCalledWith('/expenses/exp-1', {
        method: 'PUT',
        body: JSON.stringify({
          category: 'PACKAGING',
          amountIncVat: 150,
          amountExcVat: 125,
        }),
      });
    });
  });

  describe('delete', () => {
    it('calls request with DELETE method', async () => {
      mockRequest.mockResolvedValue(undefined);

      await expenses.delete('exp-1');

      expect(mockRequest).toHaveBeenCalledWith('/expenses/exp-1', {
        method: 'DELETE',
      });
    });
  });
});
