import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
}));

import {
  dashboardStatsResponseSchema,
  etsyFeeConfigResponseSchema,
  etsyFeeConfigsResponseSchema,
  packagingOverheadItemResponseSchema,
  packagingOverheadResponseSchema,
  postageTierMutationResponseSchema,
  postageTierResponseSchema,
  postageTiersResponseSchema,
  settingsAuditEntriesResponseSchema,
} from '#contracts/routes/settings';
import { settings, DashboardStats, EtsyFeeConfig, PackagingOverhead, PostageTier } from '../../../lib/api/settings';
import { request, requestWithSchema } from '../../../lib/api/request';

const mockRequest = vi.mocked(request);
const mockRequestWithSchema = vi.mocked(requestWithSchema);

describe('settings API', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequestWithSchema.mockReset();
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
      mockRequestWithSchema.mockResolvedValue(sampleStats);

      await settings.dashboardStats();

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/settings/dashboard-stats',
        dashboardStatsResponseSchema
      );
    });

    it('returns dashboard stats', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleStats);

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
        mockRequestWithSchema.mockResolvedValue([sampleFee]);

        await settings.getEtsyFees();

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/etsy-fees',
          etsyFeeConfigsResponseSchema
        );
      });

      it('returns array of fee configs', async () => {
        mockRequestWithSchema.mockResolvedValue([sampleFee]);

        const result = await settings.getEtsyFees();

        expect(result).toHaveLength(1);
        expect(result[0]!.transactionFee).toBe(0.065);
      });
    });

    describe('createEtsyFees', () => {
      it('calls request with POST and fee data', async () => {
        mockRequestWithSchema.mockResolvedValue(sampleFee);

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

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/etsy-fees',
          etsyFeeConfigResponseSchema,
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        );
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
        mockRequestWithSchema.mockResolvedValue({
          overheads: [sampleOverhead],
          totalPerOrder: 1.5,
        });

        await settings.getPackagingOverhead();

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/packaging-overhead',
          packagingOverheadResponseSchema
        );
        expect(mockRequestWithSchema.mock.calls[0]?.[0]).not.toContain('?');
      });

      it('loads active and archived packaging overhead for Settings', async () => {
        mockRequestWithSchema.mockResolvedValue({
          overheads: [sampleOverhead],
          totalPerOrder: 1.5,
        });

        await settings.getPackagingOverhead({ includeArchived: true });

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/packaging-overhead?includeArchived=true',
          packagingOverheadResponseSchema,
        );
      });

      it('returns overheads and total', async () => {
        mockRequestWithSchema.mockResolvedValue({
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
        mockRequestWithSchema.mockResolvedValue(sampleOverhead);

        await settings.createPackagingOverhead({ name: 'Gift Box', costPerOrder: 1.5 });

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/packaging-overhead',
          packagingOverheadItemResponseSchema,
          {
            method: 'POST',
            body: JSON.stringify({ name: 'Gift Box', costPerOrder: 1.5 }),
          }
        );
      });
    });

    describe('updatePackagingOverhead', () => {
      it('calls request with PUT and partial data', async () => {
        mockRequestWithSchema.mockResolvedValue(sampleOverhead);

        await settings.updatePackagingOverhead('pkg-1', { costPerOrder: 2.0 });

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/packaging-overhead/pkg-1',
          packagingOverheadItemResponseSchema,
          {
            method: 'PUT',
            body: JSON.stringify({ costPerOrder: 2.0 }),
          }
        );
      });

      it('can update name', async () => {
        mockRequestWithSchema.mockResolvedValue(sampleOverhead);

        await settings.updatePackagingOverhead('pkg-1', { name: 'Premium Gift Box' });

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/packaging-overhead/pkg-1',
          packagingOverheadItemResponseSchema,
          {
            method: 'PUT',
            body: JSON.stringify({ name: 'Premium Gift Box' }),
          }
        );
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

    describe('restorePackagingOverhead', () => {
      it('calls request with POST to the restore endpoint', async () => {
        mockRequestWithSchema.mockResolvedValue(sampleOverhead);

        await settings.restorePackagingOverhead('pkg-1');

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/packaging-overhead/pkg-1/restore',
          packagingOverheadItemResponseSchema,
          { method: 'POST' },
        );
      });
    });
  });

  describe('Postage Tiers', () => {
    const sampleTier: PostageTier = {
      id: 'pt-1',
      etsyCharge: 5.00,
      actualCost: 5.05,
      label: 'Standard',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    describe('getPostageTiers', () => {
      it('calls request with correct endpoint', async () => {
        mockRequestWithSchema.mockResolvedValue([sampleTier]);

        await settings.getPostageTiers();

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/postage-tiers',
          postageTiersResponseSchema
        );
        expect(mockRequestWithSchema.mock.calls[0]?.[0]).not.toContain('?');
      });

      it('loads active and archived postage tiers for Settings', async () => {
        mockRequestWithSchema.mockResolvedValue([sampleTier]);

        await settings.getPostageTiers({ includeArchived: true });

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/postage-tiers?includeArchived=true',
          postageTiersResponseSchema,
        );
      });

      it('returns array of postage tiers', async () => {
        mockRequestWithSchema.mockResolvedValue([sampleTier]);

        const result = await settings.getPostageTiers();

        expect(result).toHaveLength(1);
        expect(result[0]!.etsyCharge).toBe(5.00);
      });
    });

    describe('createPostageTier', () => {
      it('calls request with POST and tier data', async () => {
        const outcome = { item: sampleTier, outcome: 'created' as const };
        mockRequestWithSchema.mockResolvedValue(outcome);

        const data = { etsyCharge: 5.00, actualCost: 5.05 };

        const result = await settings.createPostageTier(data);

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/postage-tiers',
          postageTierMutationResponseSchema,
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        );
        expect(result).toEqual(outcome);
      });
    });

    describe('updatePostageTier', () => {
      it('calls request with PUT and partial data', async () => {
        mockRequestWithSchema.mockResolvedValue(sampleTier);

        await settings.updatePostageTier('pt-1', { actualCost: 5.10 });

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/postage-tiers/pt-1',
          postageTierResponseSchema,
          {
            method: 'PUT',
            body: JSON.stringify({ actualCost: 5.10 }),
          }
        );
      });
    });

    describe('deletePostageTier', () => {
      it('calls request with DELETE method', async () => {
        mockRequest.mockResolvedValue(undefined);

        await settings.deletePostageTier('pt-1');

        expect(mockRequest).toHaveBeenCalledWith('/settings/postage-tiers/pt-1', {
          method: 'DELETE',
        });
      });
    });

    describe('restorePostageTier', () => {
      it('calls request with POST to the restore endpoint', async () => {
        mockRequestWithSchema.mockResolvedValue(sampleTier);

        await settings.restorePostageTier('pt-1');

        expect(mockRequestWithSchema).toHaveBeenCalledWith(
          '/settings/postage-tiers/pt-1/restore',
          postageTierResponseSchema,
          { method: 'POST' },
        );
      });
    });
  });

  describe('Audit History', () => {
    const auditEntry = {
      id: 'audit-1',
      settingType: 'POSTAGE_TIER' as const,
      settingId: 'pt-1',
      action: 'RESTORE' as const,
      before: { actualCost: '5.05' },
      after: { actualCost: '5.05', isActive: true },
      createdAt: '2024-01-02T00:00:00Z',
    };

    it('loads audit history with the audit response schema', async () => {
      mockRequestWithSchema.mockResolvedValue([auditEntry]);

      const result = await settings.getAuditHistory();

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/settings/audit',
        settingsAuditEntriesResponseSchema,
      );
      expect(result).toEqual([auditEntry]);
    });
  });
});
