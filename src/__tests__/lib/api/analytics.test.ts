import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
}))

import {
  analyticsExpensesResponseSchema,
  analyticsInventoryResponseSchema,
  analyticsOverviewResponseSchema,
  analyticsProfitResponseSchema,
  analyticsSalesResponseSchema,
} from '#contracts/routes/analytics'
import {
  analytics,
  type AnalyticsExpensesResponse,
  type AnalyticsInventoryResponse,
  type AnalyticsOverviewResponse,
  type AnalyticsProfitResponse,
  type AnalyticsSalesResponse,
} from '../../../lib/api/analytics'
import { requestWithSchema } from '../../../lib/api/request'

const mockRequestWithSchema = vi.mocked(requestWithSchema)

describe('analytics API', () => {
  beforeEach(() => {
    mockRequestWithSchema.mockReset()
  })

  describe('overview', () => {
    const sample: AnalyticsOverviewResponse = {
      period: {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
        previousStartDate: '2023-12-01T00:00:00Z',
        previousEndDate: '2023-12-31T23:59:59Z',
        days: 31,
      },
      kpis: {
        totalRevenue: 100,
        totalProfit: 40,
        avgMarginPercent: 40,
        totalExpenses: 10,
        netProfit: 30,
        salesCount: 5,
        avgOrderValue: 20,
      },
      change: {
        totalRevenue: null,
        totalProfit: null,
        avgMarginPercent: null,
        totalExpenses: null,
        netProfit: null,
        salesCount: null,
        avgOrderValue: null,
      },
    }

    it('calls requestWithSchema with correct endpoint and schema', async () => {
      mockRequestWithSchema.mockResolvedValue(sample)

      await analytics.overview({ days: 30 })

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/analytics/overview?days=30',
        analyticsOverviewResponseSchema,
      )
    })
  })

  describe('profit', () => {
    const sample: AnalyticsProfitResponse = {
      dailyTrend: [{ date: '2024-01-01', revenue: 100, profit: 40, marginPercent: 40 }],
      feeBreakdown: {
        transaction: 1,
        processing: 1,
        regulatory: 0,
        listing: 0,
        postage: 0,
        stock: 0,
        packaging: 0,
      },
      marginByHamper: [{ name: 'Hamper', revenue: 100, profit: 40, marginPercent: 40 }],
    }

    it('calls requestWithSchema with correct endpoint and schema', async () => {
      mockRequestWithSchema.mockResolvedValue(sample)

      await analytics.profit({ startDate: '2024-01-01', endDate: '2024-01-31' })

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/analytics/profit?startDate=2024-01-01&endDate=2024-01-31',
        analyticsProfitResponseSchema,
      )
    })
  })

  describe('sales', () => {
    const sample: AnalyticsSalesResponse = {
      volumeTrend: [{ date: '2024-01-01', count: 1, revenue: 20 }],
      bestSellers: [{ name: 'Hamper', unitsSold: 1, revenue: 20 }],
      byChannel: [{ channel: 'etsy', count: 1, revenue: 20, profit: 10 }],
    }

    it('calls requestWithSchema with correct endpoint and schema', async () => {
      mockRequestWithSchema.mockResolvedValue(sample)

      await analytics.sales()

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/analytics/sales',
        analyticsSalesResponseSchema,
      )
    })
  })

  describe('expenses', () => {
    const sample: AnalyticsExpensesResponse = {
      categoryTrend: [
        {
          month: '2024-01',
          ADVERTISING: 0,
          LISTING_FEE: 0,
          POSTAGE: 0,
          PACKAGING: 0,
          STOCK: 0,
          OTHER: 0,
        },
      ],
      categoryBreakdown: [{ category: 'ADVERTISING', total: 0 }],
    }

    it('calls requestWithSchema with correct endpoint and schema', async () => {
      mockRequestWithSchema.mockResolvedValue(sample)

      await analytics.expenses({ days: 7 })

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/analytics/expenses?days=7',
        analyticsExpensesResponseSchema,
      )
    })
  })

  describe('inventory', () => {
    const sample: AnalyticsInventoryResponse = {
      currentStockValue: 10,
      cogsTrend: [{ date: '2024-01-01', cogs: 0 }],
      costByHamper: [{ name: 'Hamper', unitsSold: 1, avgCost: 0 }],
    }

    it('calls requestWithSchema with correct endpoint and schema', async () => {
      mockRequestWithSchema.mockResolvedValue(sample)

      await analytics.inventory({ days: 7 })

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/analytics/inventory?days=7',
        analyticsInventoryResponseSchema,
      )
    })
  })
})

