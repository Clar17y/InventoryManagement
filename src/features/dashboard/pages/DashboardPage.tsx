import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownTrayIcon, PlusIcon, ShoppingBagIcon, TagIcon } from '@heroicons/react/24/outline'
import { settings, inventory, type LowStockProduct, type InventoryLot } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
import AlertCard from '../../../components/ui/AlertCard'

interface DashboardStats {
  products: number
  categories: number
  hampers: number
  lowStockProducts: number
  today: { salesCount: number; revenue: number; margin: number }
  thisWeek: { salesCount: number; revenue: number; margin: number }
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([])
  const [expiringLots, setExpiringLots] = useState<InventoryLot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const copyShoppingList = async () => {
    if (lowStockProducts.length === 0) return

    const lines = lowStockProducts.map(p => `[ ] ${p.name} (${p.totalStock ?? 0} left)`)
    const text = `Shopping List:\n${lines.join('\n')}`

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: create temporary textarea for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsData, lowStock, expiring] = await Promise.all([
          settings.dashboardStats(),
          inventory.lowStock(),
          inventory.expiring(30),
        ])
        setStats(statsData)
        setLowStockProducts(lowStock)
        setExpiringLots(expiring)
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  const getDaysUntilExpiry = (expiresAt: string) => {
    const expiry = new Date(expiresAt)
    const today = new Date()
    const diffTime = expiry.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/inventory"
            className="card flex flex-col items-center justify-center py-6 hover:border-primary-300 hover:shadow-md transition-all"
          >
            <ArrowDownTrayIcon className="h-10 w-10 mb-2 text-gray-500" aria-hidden="true" />
            <span className="font-medium">Add Stock</span>
          </Link>
          <Link
            to="/sales"
            className="card flex flex-col items-center justify-center py-6 hover:border-primary-300 hover:shadow-md transition-all"
          >
            <PlusIcon className="h-10 w-10 mb-2 text-gray-500" aria-hidden="true" />
            <span className="font-medium">Record Sale</span>
          </Link>
          <Link
            to="/hampers"
            className="card flex flex-col items-center justify-center py-6 hover:border-primary-300 hover:shadow-md transition-all"
          >
            <ShoppingBagIcon className="h-10 w-10 mb-2 text-gray-500" aria-hidden="true" />
            <span className="font-medium">View Hampers</span>
          </Link>
          <Link
            to="/products"
            className="card flex flex-col items-center justify-center py-6 hover:border-primary-300 hover:shadow-md transition-all"
          >
            <TagIcon className="h-10 w-10 mb-2 text-gray-500" aria-hidden="true" />
            <span className="font-medium">Products</span>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Overview</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <div className="text-sm text-gray-500">Products</div>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <span className="animate-pulse">--</span>
              ) : (
                stats?.products ?? 0
              )}
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Low Stock</div>
            <div className={`text-2xl font-bold ${(stats?.lowStockProducts ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {isLoading ? (
                <span className="animate-pulse">--</span>
              ) : (
                stats?.lowStockProducts ?? 0
              )}
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Today's Sales</div>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <span className="animate-pulse">£--</span>
              ) : (
                formatCurrency(stats?.today.revenue ?? 0)
              )}
            </div>
            {!isLoading && stats && stats.today.salesCount > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {stats.today.salesCount} sale{stats.today.salesCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">This Week</div>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <span className="animate-pulse">£--</span>
              ) : (
                formatCurrency(stats?.thisWeek.revenue ?? 0)
              )}
            </div>
            {!isLoading && stats && stats.thisWeek.salesCount > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {stats.thisWeek.salesCount} sale{stats.thisWeek.salesCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Alerts</h2>
          {lowStockProducts.length > 0 && (
            <button
              onClick={copyShoppingList}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-emerald-600">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span>Copy List</span>
                </>
              )}
            </button>
          )}
        </div>
        <div className="space-y-4">
          <AlertCard
            type="danger"
            title="Low Stock"
            icon={
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
            items={lowStockProducts.map(p => ({
              id: p.id,
              title: p.name,
              subtitle: p.category?.name,
              value: `${p.totalStock ?? 0} left`,
              link: '/inventory',
            }))}
            emptyMessage="All products well stocked!"
          />

          <AlertCard
            type="warning"
            title="Expiring Soon"
            icon={
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            items={expiringLots.map(lot => ({
              id: lot.id,
              title: lot.product?.name ?? 'Unknown Product',
              subtitle: lot.expiresAt ? `Expires ${new Date(lot.expiresAt).toLocaleDateString()}` : undefined,
              value: lot.expiresAt ? `${getDaysUntilExpiry(lot.expiresAt)} days` : undefined,
              link: '/inventory',
            }))}
            emptyMessage="No lots expiring within 30 days"
          />
        </div>
      </section>
    </div>
  )
}
