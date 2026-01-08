import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
}));

import { settings, DashboardStats, EtsyFeeConfig, PackagingOverhead } from '../../../lib/api/settings';
import { request } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);

describe('settings API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  describe('dashboardStats', () => {
    const sampleStats: DashboardStats = {
      products: 25,
      categories: 5,
      hampers: 10,
      lowStockProducts: 3,
      today: { salesCount: 2, revenue: 70, margin: 35 },
      thisWeek: { salesCount: 15, revenue: 525, margin: 260 },
    };

    it('calls request with correct endpoint', async () => {
      mockRequest.mockResolvedValue(sampleStats);

      await settings.dashboardStats();

      expect(mockRequest).toHaveBeenCalledWith('/settings/dashboard-stats');
    });

    it('returns dashboard stats', async () => {
      mockRequest.mockResolvedValue(sampleStats);

      const result = await settings.dashboardStats();

      expect(result.products).toBe(25);
      expect(result.today.salesCount).toBe(2);
      expect(result.thisWeek.revenue).toBe(525);
    });
  });

  describe('Etsy Fees', () => {
    const sampleFee: EtsyFeeConfig = {
      id: 'fee-1',
      name: 'Standard Etsy Fees 2024',
      transactionFee: 0.065,
      regulatoryFee: 0.0032,
      paymentFeePercent: 0.04,
      paymentFeeFixed: 0.2,
      vatRate: 0.2,
      listingFee: 0.15,
      effectiveFrom: '2024-01-01',
      effectiveTo: null,
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    describe('getEtsyFees', () => {
      it('calls request with correct endpoint', async () => {
        mockRequest.mockResolvedValue([sampleFee]);

        await settings.getEtsyFees();

        expect(mockRequest).toHaveBeenCalledWith('/settings/etsy-fees');
      });

      it('returns array of fee configs', async () => {
        mockRequest.mockResolvedValue([sampleFee]);

        const result = await settings.getEtsyFees();

        expect(result).toHaveLength(1);
        expect(result[0]!.transactionFee).toBe(0.065);
      });
    });

    describe('createEtsyFees', () => {
      it('calls request with POST and fee data', async () => {
        mockRequest.mockResolvedValue(sampleFee);

        const data = {
          name: 'Standard Etsy Fees 2024',
          transactionFee: 0.065,
          regulatoryFee: 0.0032,
          paymentFeePercent: 0.04,
          paymentFeeFixed: 0.2,
          vatRate: 0.2,
          listingFee: 0.15,
        };

        await settings.createEtsyFees(data);

        expect(mockRequest).toHaveBeenCalledWith('/settings/etsy-fees', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      });
    });
  });

  describe('Packaging Overhead', () => {
    const sampleOverhead: PackagingOverhead = {
      id: 'pkg-1',
      name: 'Gift Box',
      costPerOrder: 1.5,
      effectiveFrom: '2024-01-01',
      effectiveTo: null,
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    describe('getPackagingOverhead', () => {
      it('calls request with correct endpoint', async () => {
        mockRequest.mockResolvedValue({
          overheads: [sampleOverhead],
          totalPerOrder: 1.5,
        });

        await settings.getPackagingOverhead();

        expect(mockRequest).toHaveBeenCalledWith('/settings/packaging-overhead');
      });

      it('returns overheads and total', async () => {
        mockRequest.mockResolvedValue({
          overheads: [sampleOverhead],
          totalPerOrder: 1.5,
        });

        const result = await settings.getPackagingOverhead();

        expect(result.overheads).toHaveLength(1);
        expect(result.totalPerOrder).toBe(1.5);
      });
    });

    describe('createPackagingOverhead', () => {
      it('calls request with POST and overhead data', async () => {
        mockRequest.mockResolvedValue(sampleOverhead);

        await settings.createPackagingOverhead({ name: 'Gift Box', costPerOrder: 1.5 });

        expect(mockRequest).toHaveBeenCalledWith('/settings/packaging-overhead', {
          method: 'POST',
          body: JSON.stringify({ name: 'Gift Box', costPerOrder: 1.5 }),
        });
      });
    });

    describe('updatePackagingOverhead', () => {
      it('calls request with PUT and partial data', async () => {
        mockRequest.mockResolvedValue(sampleOverhead);

        await settings.updatePackagingOverhead('pkg-1', { costPerOrder: 2.0 });

        expect(mockRequest).toHaveBeenCalledWith('/settings/packaging-overhead/pkg-1', {
          method: 'PUT',
          body: JSON.stringify({ costPerOrder: 2.0 }),
        });
      });

      it('can update name', async () => {
        mockRequest.mockResolvedValue(sampleOverhead);

        await settings.updatePackagingOverhead('pkg-1', { name: 'Premium Gift Box' });

        expect(mockRequest).toHaveBeenCalledWith('/settings/packaging-overhead/pkg-1', {
          method: 'PUT',
          body: JSON.stringify({ name: 'Premium Gift Box' }),
        });
      });
    });

    describe('deletePackagingOverhead', () => {
      it('calls request with DELETE method', async () => {
        mockRequest.mockResolvedValue(undefined);

        await settings.deletePackagingOverhead('pkg-1');

        expect(mockRequest).toHaveBeenCalledWith('/settings/packaging-overhead/pkg-1', {
          method: 'DELETE',
        });
      });
    });
  });
});
