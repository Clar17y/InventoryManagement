import { useCallback, useEffect, useState } from 'react'
import {
  analytics,
  type AnalyticsExpensesResponse,
  type AnalyticsInventoryResponse,
  type AnalyticsOverviewResponse,
  type AnalyticsPeriodParams,
  type AnalyticsProfitResponse,
  type AnalyticsSalesResponse,
} from '../lib/api/analytics'

export function useAnalytics(params: AnalyticsPeriodParams) {
  const { startDate, endDate, days } = params
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null)
  const [profit, setProfit] = useState<AnalyticsProfitResponse | null>(null)
  const [sales, setSales] = useState<AnalyticsSalesResponse | null>(null)
  const [expenses, setExpenses] = useState<AnalyticsExpensesResponse | null>(null)
  const [inventory, setInventory] = useState<AnalyticsInventoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const periodParams = { startDate, endDate, days }
      const [overviewData, profitData, salesData, expensesData, inventoryData] = await Promise.all([
        analytics.overview(periodParams),
        analytics.profit(periodParams),
        analytics.sales(periodParams),
        analytics.expenses(periodParams),
        analytics.inventory(periodParams),
      ])
      setOverview(overviewData)
      setProfit(profitData)
      setSales(salesData)
      setExpenses(expensesData)
      setInventory(inventoryData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [days, endDate, startDate])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return {
    overview,
    profit,
    sales,
    expenses,
    inventory,
    loading,
    error,
    refetch: fetchAll,
  }
}
