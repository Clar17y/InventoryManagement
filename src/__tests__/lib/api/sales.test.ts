import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    body: unknown

    constructor(message: string, status: number, body: unknown = null) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.body = body
    }
  },
}));

import {
  salePreviewResponseSchema,
  saleResponseSchema,
  etsySaleResolutionApplyResultSchema,
  etsySaleResolutionPreviewSchema,
  salesListResponseSchema,
  salesMarginAnalyticsResponseSchema,
  salesSummaryResponseSchema,
} from '#contracts/routes/sales';
import { sales, Sale, SalePreview, SalesSummary, MarginAnalytics } from '../../../lib/api/sales';
import { ApiError, requestWithSchema } from '../../../lib/api/request';

const mockRequestWithSchema = vi.mocked(requestWithSchema);

describe('sales API', () => {
  beforeEach(() => {
    mockRequestWithSchema.mockReset();
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
    offsiteAdsAttributed: null,
    offsiteAdsFee: null,
    vatOnOffsiteAdsFee: null,
    etsyPaymentGross: null,
    etsyPaymentFees: null,
    etsyPaymentNet: null,
    etsyManualResolutionNote: null,
    etsyFeeReconciliationStatus: 'PENDING',
    etsyFeeReconciliationSource: null,
    etsyFeeReconciledAt: null,
    etsyStatementImportId: null,
    packagingOverhead: 1.5,
    netRevenue: 30.5,
    totalCost: 15,
    margin: 15.5,
    notes: null,
    isHistorical: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
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
        isBespoke: false,
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
      mockRequestWithSchema.mockResolvedValue({ sales: [sampleSale], total: 1 });

      await sales.list();

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/sales?', salesListResponseSchema);
    });

    it('calls request with all params', async () => {
      mockRequestWithSchema.mockResolvedValue({ sales: [sampleSale], total: 1 });

      await sales.list({
        limit: 20,
        offset: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        search: 'chocolate',
      });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales?limit=20&offset=10&startDate=2024-01-01&endDate=2024-01-31&search=chocolate',
        salesListResponseSchema
      );
    });

    it('builds query string with partial params', async () => {
      mockRequestWithSchema.mockResolvedValue({ sales: [], total: 0 });

      await sales.list({ limit: 10, search: 'test' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/sales?limit=10&search=test', salesListResponseSchema);
    });

    it('encodes the verification status filter', async () => {
      mockRequestWithSchema.mockResolvedValue({ sales: [], total: 0 });

      await sales.list({ verificationStatus: 'needs_verification' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales?verificationStatus=needs_verification',
        salesListResponseSchema,
      );
    });
  });

  describe('get', () => {
    it('calls request with sale id', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleSale);

      await sales.get('sale-1');

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/sales/sale-1', saleResponseSchema);
    });
  });

  describe('preview', () => {
    it('calls request with POST and preview data', async () => {
      mockRequestWithSchema.mockResolvedValue(samplePreview);

      const data = {
        lines: [{ hamperId: 'ham-1', quantity: 1 }],
        postageCharged: 5,
        saleChannel: 'etsy' as const,
      };

      await sales.preview(data);

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales/preview',
        salePreviewResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    });
  });

  describe('create', () => {
    it('calls request with POST and sale data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleSale);

      const data = {
        grossRevenue: 35,
        postageCharged: 5,
        postageCost: 3.5,
        saleChannel: 'etsy' as const,
        etsyOrderId: '123456',
        lines: [{ hamperId: 'ham-1', quantity: 1 }],
      };

      await sales.create(data);

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales',
        saleResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    });

    it('includes allocation overrides when provided', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleSale);

      const data = {
        grossRevenue: 35,
        lines: [{ hamperId: 'ham-1', quantity: 1 }],
        allocationOverrides: {
          'cat-1': [{ lotId: 'lot-1', quantity: 3 }],
        },
      };

      await sales.create(data);

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales',
        saleResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    });
  });

  describe('summary', () => {
    const sampleSummary: SalesSummary = {
      unverifiedEtsySales: 0,
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
      mockRequestWithSchema.mockResolvedValue(sampleSummary);

      await sales.summary();

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/sales/summary?', salesSummaryResponseSchema);
    });

    it('calls request with date filter params', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleSummary);

      await sales.summary({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        search: 'chocolate',
      });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales/summary?startDate=2024-01-01&endDate=2024-01-31&search=chocolate',
        salesSummaryResponseSchema
      );
    });

    it('encodes the verification status filter', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleSummary);

      await sales.summary({ verificationStatus: 'needs_verification' });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales/summary?verificationStatus=needs_verification',
        salesSummaryResponseSchema,
      );
    });
  });

  describe('Etsy sale resolution', () => {
    const resolution = {
      type: 'manual_verify' as const,
      attributed: true,
      etsyOrderId: '123456',
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: 96,
      note: 'Confirmed from the receipt detail',
    };
    const preview = {
      resolution,
      baseReceiptId: '123456',
      saleIds: ['sale-1'],
      fingerprint: 'a'.repeat(64),
      summary: {
        oldFeesPence: 450,
        newFeesPence: 1026,
        feeDeltaPence: 576,
        oldNetRevenuePence: 3050,
        newNetRevenuePence: 2474,
        netRevenueDeltaPence: -576,
        oldMarginPence: 1550,
        newMarginPence: 974,
        marginDeltaPence: -576,
      },
      rows: [],
      warnings: [],
    };

    it('posts a validated preview request with the normalized resolution', async () => {
      mockRequestWithSchema.mockResolvedValue(preview);

      await sales.previewEtsyResolution('sale-1', { resolution });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales/sale-1/etsy-resolution/preview',
        etsySaleResolutionPreviewSchema,
        {
          method: 'POST',
          body: JSON.stringify({ resolution }),
        },
      );
    });

    it('posts the same resolution plus the preview fingerprint to apply', async () => {
      mockRequestWithSchema.mockResolvedValue({ ...preview, applied: true });

      await sales.applyEtsyResolution('sale-1', {
        resolution,
        fingerprint: preview.fingerprint,
      });

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales/sale-1/etsy-resolution/apply',
        etsySaleResolutionApplyResultSchema,
        {
          method: 'POST',
          body: JSON.stringify({ resolution, fingerprint: preview.fingerprint }),
        },
      );
    });

    it('propagates a 409 ApiError from preview without rewriting it', async () => {
      const error = new ApiError('The Etsy Sale changed; preview again', 409, { error: 'conflict' });
      mockRequestWithSchema.mockRejectedValue(error);

      await expect(sales.previewEtsyResolution('sale-1', { resolution })).rejects.toBe(error);
      expect(error.status).toBe(409);
    });
  });

  describe('analytics', () => {
    const sampleAnalytics: MarginAnalytics = {
      period: { days: 30, startDate: '2024-01-01', endDate: '2024-01-31' },
      summary: {
        salesCount: 10,
        unverifiedEtsySales: 0,
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
      mockRequestWithSchema.mockResolvedValue(sampleAnalytics);

      await sales.analytics();

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales/analytics/margins?days=30',
        salesMarginAnalyticsResponseSchema
      );
    });

    it('calls request with custom days', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleAnalytics);

      await sales.analytics(7);

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/sales/analytics/margins?days=7',
        salesMarginAnalyticsResponseSchema
      );
    });
  });
});
