import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'

vi.mock('../../lib/api/analytics', () => ({
  analytics: {
    overview: vi.fn(),
    profit: vi.fn(),
    sales: vi.fn(),
    expenses: vi.fn(),
    inventory: vi.fn(),
  },
}))

import Analytics from '../../pages/Analytics'
import { analytics } from '../../lib/api/analytics'

const mockAnalyticsOverview = vi.mocked(analytics.overview)
const mockAnalyticsProfit = vi.mocked(analytics.profit)
const mockAnalyticsSales = vi.mocked(analytics.sales)
const mockAnalyticsExpenses = vi.mocked(analytics.expenses)
const mockAnalyticsInventory = vi.mocked(analytics.inventory)

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockAnalyticsOverview.mockResolvedValue({
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
    })
    mockAnalyticsProfit.mockResolvedValue({
      dailyTrend: [{ date: '2024-01-01', revenue: 100, profit: 40, expenses: 10, netProfit: 30, marginPercent: 40 }],
      feeBreakdown: {
        transaction: 1,
        processing: 1,
        regulatory: 0,
        listing: 0,
        postage: 0,
        stock: 0,
        packaging: 0,
        offsiteAds: 4.8,
        offsiteAdsVat: 0.96,
      },
      marginByHamper: [],
    } as any)
    mockAnalyticsSales.mockResolvedValue({
      volumeTrend: [{ date: '2024-01-01', count: 1, revenue: 20 }],
      bestSellers: [],
      byChannel: [{ channel: 'etsy', count: 1, revenue: 20, profit: 10 }],
      unverifiedEtsySales: 3,
    } as any)
    mockAnalyticsExpenses.mockResolvedValue({
      categoryTrend: [],
      categoryBreakdown: [],
    })
    mockAnalyticsInventory.mockResolvedValue({
      currentStockValue: 10,
      cogsTrend: [],
      costByHamper: [],
    })
  })

  it('warns about unverified Etsy sales and shows Offsite fee breakdown', async () => {
    const user = userEvent.setup()
    render(<Analytics />)

    await waitFor(() => {
      expect(screen.getByText('3 Etsy sales in this period still need statement verification')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Profit' }))

    await waitFor(() => {
      expect(screen.getByText('Offsite Ads')).toBeInTheDocument()
      expect(screen.getByText('VAT on Offsite Ads')).toBeInTheDocument()
      expect(screen.getByText('£4.80')).toBeInTheDocument()
      expect(screen.getByText('£0.96')).toBeInTheDocument()
    })
  })
})
