import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
}));

import { sales, Sale, SalePreview, SalesSummary, MarginAnalytics } from '../../../lib/api/sales';
import { request } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);

describe('sales API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  const sampleSale: Sale = {
    id: 'sale-1',
    saleDate: '2024-01-15',
    saleChannel: 'etsy',
    etsyOrderId: '123456',
    grossRevenue: 35,
    postageCharged: 5,
    postageCost: 3.5,
    etsyFees: 4.5,
    transactionFee: 2.28,
    postageTransactionFee: 0.33,
    regulatoryFee: 0.11,
    processingFee: 1.6,
    vatOnProcessingFee: 0.32,
    listingFee: 0.15,
    packagingOverhead: 1.5,
    netRevenue: 30.5,
    totalCost: 15,
    margin: 15.5,
    notes: null,
    isHistorical: false,
    createdAt: '2024-01-15T10:00:00Z',
    lines: [],
  };

  const samplePreview: SalePreview = {
    lines: [
      {
        hamperId: 'ham-1',
        hamperName: 'Chocolate Lovers',
        quantity: 1,
        unitPrice: 35,
        requirements: [],
        totalCost: 15,
        canFulfill: true,
      },
    ],
    summary: {
      totalGross: 35,
      postageCharged: 5,
      totalCost: 15,
      estimatedFees: 4.5,
      packagingOverhead: 1.5,
      estimatedMargin: 19,
    },
  };

  describe('list', () => {
    it('calls request with empty params', async () => {
      mockRequest.mockResolvedValue({ sales: [sampleSale], total: 1 });

      await sales.list();

      expect(mockRequest).toHaveBeenCalledWith('/sales?');
    });

    it('calls request with all params', async () => {
      mockRequest.mockResolvedValue({ sales: [sampleSale], total: 1 });

      await sales.list({
        limit: 20,
        offset: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        search: 'chocolate',
      });

      expect(mockRequest).toHaveBeenCalledWith(
        '/sales?limit=20&offset=10&startDate=2024-01-01&endDate=2024-01-31&search=chocolate'
      );
    });

    it('builds query string with partial params', async () => {
      mockRequest.mockResolvedValue({ sales: [], total: 0 });

      await sales.list({ limit: 10, search: 'test' });

      expect(mockRequest).toHaveBeenCalledWith('/sales?limit=10&search=test');
    });
  });

  describe('get', () => {
    it('calls request with sale id', async () => {
      mockRequest.mockResolvedValue(sampleSale);

      await sales.get('sale-1');

      expect(mockRequest).toHaveBeenCalledWith('/sales/sale-1');
    });
  });

  describe('preview', () => {
    it('calls request with POST and preview data', async () => {
      mockRequest.mockResolvedValue(samplePreview);

      const data = {
        lines: [{ hamperId: 'ham-1', quantity: 1 }],
        postageCharged: 5,
        saleChannel: 'etsy' as const,
      };

      await sales.preview(data);

      expect(mockRequest).toHaveBeenCalledWith('/sales/preview', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('create', () => {
    it('calls request with POST and sale data', async () => {
      mockRequest.mockResolvedValue(sampleSale);

      const data = {
        grossRevenue: 35,
        postageCharged: 5,
        postageCost: 3.5,
        saleChannel: 'etsy' as const,
        etsyOrderId: '123456',
        lines: [{ hamperId: 'ham-1', quantity: 1 }],
      };

      await sales.create(data);

      expect(mockRequest).toHaveBeenCalledWith('/sales', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });

    it('includes allocation overrides when provided', async () => {
      mockRequest.mockResolvedValue(sampleSale);

      const data = {
        grossRevenue: 35,
        lines: [{ hamperId: 'ham-1', quantity: 1 }],
        allocationOverrides: {
          'cat-1': [{ lotId: 'lot-1', quantity: 3 }],
        },
      };

      await sales.create(data);

      expect(mockRequest).toHaveBeenCalledWith('/sales', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('summary', () => {
    const sampleSummary: SalesSummary = {
      totals: {
        salesCount: 10,
        totalRevenue: 350,
        totalPostageCharged: 50,
        totalPostageCost: 35,
        totalFees: 45,
        totalCost: 150,
        totalMargin: 155,
      },
      byChannel: [{ channel: 'etsy', count: 10, revenue: 350, fees: 45, margin: 155 }],
      byHamper: [{ name: 'Chocolate Lovers', count: 10, revenue: 350 }],
    };

    it('calls request with empty params', async () => {
      mockRequest.mockResolvedValue(sampleSummary);

      await sales.summary();

      expect(mockRequest).toHaveBeenCalledWith('/sales/summary?');
    });

    it('calls request with date filter params', async () => {
      mockRequest.mockResolvedValue(sampleSummary);

      await sales.summary({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        search: 'chocolate',
      });

      expect(mockRequest).toHaveBeenCalledWith(
        '/sales/summary?startDate=2024-01-01&endDate=2024-01-31&search=chocolate'
      );
    });
  });

  describe('analytics', () => {
    const sampleAnalytics: MarginAnalytics = {
      period: { days: 30, startDate: '2024-01-01', endDate: '2024-01-31' },
      summary: {
        salesCount: 10,
        totalRevenue: 350,
        totalPostageCharged: 50,
        totalPostageCost: 35,
        postageProfit: 15,
        totalFees: 45,
        totalOverhead: 15,
        totalCost: 150,
        totalMargin: 155,
        marginPercent: 44.3,
      },
      byHamper: [{ name: 'Chocolate Lovers', count: 10, revenue: 350 }],
      byChannel: [{ channel: 'etsy', count: 10, revenue: 350, fees: 45, margin: 155 }],
    };

    it('calls request with default 30 days', async () => {
      mockRequest.mockResolvedValue(sampleAnalytics);

      await sales.analytics();

      expect(mockRequest).toHaveBeenCalledWith('/sales/analytics/margins?days=30');
    });

    it('calls request with custom days', async () => {
      mockRequest.mockResolvedValue(sampleAnalytics);

      await sales.analytics(7);

      expect(mockRequest).toHaveBeenCalledWith('/sales/analytics/margins?days=7');
    });
  });
});
