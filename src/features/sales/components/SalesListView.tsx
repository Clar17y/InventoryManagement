import {
  ArrowPathRoundedSquareIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import EtsyOrdersSyncPanel from '../../../components/EtsyOrdersSyncPanel'
import DateSearchFilter from '../../../components/filters/DateSearchFilter'
import UpdatingResults from '../../../components/ui/UpdatingResults'
import PaginationControls from '../../../components/ui/PaginationControls'
import type { PageSize, PaginationMeta } from '#contracts/http/pagination'
import type { Sale, SaleChannel, SalesSort, SalesSummary, SortDirection } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
import MarginBadge from './MarginBadge'
import EtsyFeeDetails from './EtsyFeeDetails'
import { channelColors, channelLabels } from '../constants'
import { formatDate } from '../utils'

export default function SalesListView({
  saleList,
  pagination,
  isUpdating,
  listError,
  onRetry,
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
  sort,
  direction,
  setSort,
  setDirection,
  expandedId,
  handleExpand,
  setViewMode,
  loadData,
  onPageChange,
  onPageSizeChange,
}: {
  saleList: Sale[]
  pagination: PaginationMeta
  isUpdating: boolean
  listError: string | null
  onRetry: () => void
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
  sort: SalesSort
  direction: SortDirection
  setSort: (value: SalesSort) => void
  setDirection: (value: SortDirection) => void
  expandedId: string | null
  handleExpand: (id: string) => void
  setViewMode: (mode: 'list' | 'record') => void
  loadData: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
}) {
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
      />

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

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-gray-600">
          <span>Sort by</span>
          <select
            aria-label="Sort sales"
            value={sort}
            onChange={(event) => setSort(event.target.value as SalesSort)}
            className="rounded border border-gray-300 bg-white px-2 py-1.5"
          >
            <option value="saleDate">Sale date</option>
            <option value="grossRevenue">Gross revenue</option>
            <option value="margin">Margin</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-gray-600">
          <span>Direction</span>
          <select
            aria-label="Sort direction"
            value={direction}
            onChange={(event) => setDirection(event.target.value as SortDirection)}
            className="rounded border border-gray-300 bg-white px-2 py-1.5"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </div>

      {saleList.length === 0 ? (
        <UpdatingResults updating={false} error={listError} onRetry={onRetry}>
          <div className="card text-gray-500 text-center py-12">
            <p className="mb-4">{startDate || endDate ? 'No sales found for this period' : 'No sales recorded yet'}</p>
            <p className="text-sm">{startDate || endDate ? 'Try adjusting your date filter' : 'Record your first sale to start tracking margins'}</p>
          </div>
        </UpdatingResults>
      ) : (
        <>
          <UpdatingResults updating={isUpdating} error={listError} onRetry={onRetry}>
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

                  {sale.saleChannel === 'etsy' && <EtsyFeeDetails sale={sale} />}

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

            </div>
          </UpdatingResults>
          {pagination.totalItems > 0 && (
            <PaginationControls
              {...pagination}
              loading={isUpdating}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          )}
        </>
      )}
    </div>
  )
}
