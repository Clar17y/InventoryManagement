import {
  ArrowPathRoundedSquareIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import EtsyOrdersSyncPanel from '../../../components/EtsyOrdersSyncPanel'
import DateSearchFilter from '../../../components/filters/DateSearchFilter'
import type { Sale, SaleChannel, SalesSummary, SalesVerificationFilter } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
import MarginBadge from './MarginBadge'
import EtsyFeeDetails from './EtsyFeeDetails'
import { channelColors, channelLabels } from '../constants'
import { formatDate } from '../utils'

export default function SalesListView({
  saleList,
  totalSales,
  loading,
  loadingMore,
  error,
  showEtsyOrdersPanel,
  setShowEtsyOrdersPanel,
  showSummary,
  setShowSummary,
  summary,
  startDate,
  endDate,
  searchQuery,
  setStartDate,
  setEndDate,
  setSearchQuery,
  verificationStatus,
  setVerificationStatus,
  expandedId,
  handleExpand,
  setViewMode,
  onResolveSale,
  registerFeeSummaryRefresh,
  loadData,
  loadMore,
}: {
  saleList: Sale[]
  totalSales: number
  loading: boolean
  loadingMore: boolean
  error: string | null
  showEtsyOrdersPanel: boolean
  setShowEtsyOrdersPanel: (value: boolean) => void
  showSummary: boolean
  setShowSummary: (value: boolean) => void
  summary: SalesSummary | null
  startDate: string
  endDate: string
  searchQuery: string
  setStartDate: (value: string) => void
  setEndDate: (value: string) => void
  setSearchQuery: (value: string) => void
  verificationStatus: SalesVerificationFilter | ''
  setVerificationStatus: (value: SalesVerificationFilter | '') => void
  expandedId: string | null
  handleExpand: (id: string) => void
  setViewMode: (mode: 'list' | 'record') => void
  onResolveSale: (sale: Sale) => void
  registerFeeSummaryRefresh: (refresh: (() => Promise<void>) | null) => void
  loadData: (isInitialLoad?: boolean) => void
  loadMore: () => void
}) {
  const hasMore = saleList.length < totalSales

  // List View (default)
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Sales</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEtsyOrdersPanel(true)}
            className="btn-secondary flex items-center gap-1"
            title="Import pending Etsy orders"
          >
            <ArrowPathRoundedSquareIcon className="h-5 w-5" />
            Etsy Sync
          </button>
          <button
            onClick={() => setShowSummary(!showSummary)}
            className={`p-2 rounded-lg ${showSummary ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}
            title="Toggle summary"
          >
            <ChartBarIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setViewMode('record')}
            className="btn-primary flex items-center gap-1"
          >
            <PlusIcon className="h-5 w-5" />
            Record Sale
          </button>
        </div>
      </div>

      <EtsyOrdersSyncPanel
        isOpen={showEtsyOrdersPanel}
        onClose={() => setShowEtsyOrdersPanel(false)}
        onImportComplete={loadData}
        registerFeeSummaryRefresh={registerFeeSummaryRefresh}
      />

      {error && <div className="alert-danger">{error}</div>}

      {(summary?.unverifiedEtsySales ?? 0) > 0 && (
        <div className="card border-amber-200 bg-amber-50 text-sm text-amber-800">
          {summary?.unverifiedEtsySales} Etsy sales in this period still need statement verification
        </div>
      )}

      {/* Sales Summary */}
      {showSummary && summary && (
        <div className="card bg-gray-50 space-y-4">
          <h3 className="font-medium">Sales Summary</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg">
              <div className="text-xs text-gray-500">Total Sales</div>
              <div className="text-lg font-semibold">{summary.totals.salesCount}</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="text-xs text-gray-500">Revenue</div>
              <div className="text-lg font-semibold">{formatCurrency(summary.totals.totalRevenue)}</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="text-xs text-gray-500">Total Fees</div>
              <div className="text-lg font-semibold text-red-600">-{formatCurrency(summary.totals.totalFees)}</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="text-xs text-gray-500">Net Margin</div>
              <div className={`text-lg font-semibold ${summary.totals.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.totals.totalMargin)}
              </div>
            </div>
          </div>

          {summary.byChannel.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-600">By Channel</div>
              {summary.byChannel.map((ch) => (
                <div key={ch.channel} className="flex justify-between items-center bg-white p-2 rounded-lg text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs ${channelColors[ch.channel as SaleChannel] || 'bg-gray-100 text-gray-800'}`}>
                    {channelLabels[ch.channel as SaleChannel] || ch.channel}
                  </span>
                  <div className="flex gap-4">
                    <span className="text-gray-500">{ch.count} sales</span>
                    <span className="font-medium">{formatCurrency(ch.revenue)}</span>
                    <span className={ch.margin >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(ch.margin)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <DateSearchFilter
            startDate={startDate}
            endDate={endDate}
            searchQuery={searchQuery}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search sales..."
            showQuickSelectors={true}
          />
        </div>
        <div className="card space-y-2 md:min-w-56">
          <label htmlFor="sales-verification-status" className="block text-sm font-medium text-gray-700">
            Verification status
          </label>
          <select
            id="sales-verification-status"
            value={verificationStatus}
            onChange={(event) => setVerificationStatus(event.target.value as SalesVerificationFilter | '')}
            className="w-full text-sm border rounded-lg px-2 py-1.5"
          >
            <option value="">All statuses</option>
            <option value="NOT_APPLICABLE">Not applicable</option>
            <option value="PENDING">Pending</option>
            <option value="PAYMENT_SYNCED">Payment synced</option>
            <option value="STATEMENT_VERIFIED">Statement verified</option>
            <option value="MANUALLY_VERIFIED">Manually verified</option>
            <option value="MANUAL_REVIEW">Manual review</option>
            <option value="needs_verification">Needs verification</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : saleList.length === 0 ? (
        <div className="card text-gray-500 text-center py-12">
          <p className="mb-4">{startDate || endDate ? 'No sales found for this period' : 'No sales recorded yet'}</p>
          <p className="text-sm">{startDate || endDate ? 'Try adjusting your date filter' : 'Record your first sale to start tracking margins'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {saleList.map((sale) => (
            <div key={sale.id} className="card">
              {/* Row 1: Full-width item names */}
              <button
                onClick={() => handleExpand(sale.id)}
                className="w-full text-left"
              >
                <div className="text-sm font-medium">
                  {sale.lines.map((l) => `${l.hamper?.name || l.description || 'Bespoke Item'} ×${l.quantity}`).join(', ')}
                </div>
              </button>

              {/* Row 2: Channel, date, price, margin, chevron */}
              <button
                onClick={() => handleExpand(sale.id)}
                className="w-full text-left mt-1"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={`px-1.5 py-0.5 rounded ${channelColors[sale.saleChannel]}`}>
                      {channelLabels[sale.saleChannel]}
                    </span>
                    <span>
                      {formatDate(sale.saleDate)}
                      {sale.etsyOrderId && ` • #${sale.etsyOrderId}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className="text-sm font-medium">{formatCurrency(Number(sale.grossRevenue))}</span>
                      <MarginBadge margin={Number(sale.margin)} revenue={Number(sale.grossRevenue)} />
                    </div>
                    {expandedId === sale.id ? (
                      <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>

              {expandedId === sale.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                  {/* Financial breakdown */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-center">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Gross Revenue</div>
                      <div className="font-semibold">{formatCurrency(Number(sale.grossRevenue))}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Stock Cost</div>
                      <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.totalCost))}</div>
                    </div>
                    {sale.saleChannel === 'etsy' && Number(sale.etsyFees) > 0 && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Etsy Fees</div>
                        <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.etsyFees))}</div>
                      </div>
                    )}
                    {Number(sale.packagingOverhead) > 0 && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Packaging</div>
                        <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.packagingOverhead))}</div>
                      </div>
                    )}
                  </div>

                  {sale.saleChannel === 'etsy' && (
                    <>
                      <EtsyFeeDetails sale={sale} />
                      {sale.etsyFeeReconciliationStatus !== 'STATEMENT_VERIFIED'
                        && sale.etsyFeeReconciliationStatus !== 'MANUALLY_VERIFIED' && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => onResolveSale(sale)}
                          >
                            Resolve Etsy sale
                          </button>
                        )}
                    </>
                  )}

                  {/* Postage breakdown */}
                  {(Number(sale.postageCharged) > 0 || Number(sale.postageCost) > 0) && (
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-info-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Postage Charged</div>
                        <div className="font-semibold">{formatCurrency(Number(sale.postageCharged))}</div>
                      </div>
                      <div className="bg-info-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Postage Cost</div>
                        <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.postageCost))}</div>
                      </div>
                      <div className="bg-info-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Postage Profit</div>
                        <div className={`font-semibold ${Number(sale.postageCharged) - Number(sale.postageCost) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(Number(sale.postageCharged) - Number(sale.postageCost))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center bg-gray-100 p-3 rounded-lg">
                    <span className="font-medium">Net Margin</span>
                    <span className={`text-lg font-bold ${Number(sale.margin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Number(sale.margin))}
                    </span>
                  </div>

                  {/* Line items */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Items Sold</h4>
                    {sale.lines.map((line) => (
                      <div key={line.id} className="text-sm bg-gray-50 p-2 rounded-lg mb-2">
                        <div className="flex justify-between">
                          <span className="font-medium">{line.hamper?.name || line.description || 'Bespoke Item'} × {line.quantity}</span>
                          <span>{formatCurrency(Number(line.unitPrice) * line.quantity)}</span>
                        </div>
                        {line.consumptions.length > 0 && (
                          <div className="mt-1 text-xs text-gray-500">
                            Stock used: {line.consumptions.map((c) =>
                              `${c.lot.product.name} (${Number(c.quantity).toFixed(1)})`
                            ).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {sale.notes && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Notes:</span> {sale.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-secondary"
              >
                {loadingMore ? 'Loading...' : `Load More (${saleList.length} of ${totalSales})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
