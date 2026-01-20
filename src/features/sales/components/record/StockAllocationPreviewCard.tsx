import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import type { CategoryLot, SaleChannel, SalePreview } from '../../../../lib/api'
import { formatCurrency } from '../../../../lib/formatting'
import OverrideEditor from '../OverrideEditor'
import { getOverrideKey } from '../../utils'
import type { LotOverride } from '../../types'

interface StockAllocationPreviewCardProps {
  preview: SalePreview
  postageCharged: string
  postageCost: string
  saleChannel: SaleChannel
  overrides: Record<string, LotOverride[]>
  editingOverride: { hamperIdx: number; categoryId: string } | null
  availableLots: CategoryLot[]
  lotsLoading: boolean
  handleStartOverride: (hamperIdx: number, categoryId: string) => void
  handleClearOverride: (hamperIdx: number, categoryId: string) => void
  handleSaveOverride: (selectedLots: LotOverride[]) => void
  handleCancelOverride: () => void
}

export default function StockAllocationPreviewCard({
  preview,
  postageCharged,
  postageCost,
  saleChannel,
  overrides,
  editingOverride,
  availableLots,
  lotsLoading,
  handleStartOverride,
  handleClearOverride,
  handleSaveOverride,
  handleCancelOverride,
}: StockAllocationPreviewCardProps) {
  return (
    <div className="card space-y-4">
      <h3 className="font-medium">Stock Allocation Preview</h3>

      {preview.lines.map((linePreview, hamperIdx) => (
        <div key={hamperIdx} className="border rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center">
            <div className="font-medium">
              {linePreview.hamperName} × {linePreview.quantity}
            </div>
            <div className="flex items-center gap-2">
              {linePreview.canFulfill ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : (
                <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
              )}
              <span className={linePreview.canFulfill ? 'text-green-600' : 'text-red-600'}>
                {linePreview.canFulfill ? 'Can fulfill' : 'Insufficient stock'}
              </span>
            </div>
          </div>

          {/* Requirements breakdown */}
          <div className="text-sm space-y-2">
            {linePreview.requirements.map((req) => {
              const overrideKey = getOverrideKey(hamperIdx, req.categoryId)
              const override = overrides[overrideKey]
              const isEditing = editingOverride?.hamperIdx === hamperIdx && editingOverride?.categoryId === req.categoryId
              const isFulfilled = override
                ? override.reduce((sum, o) => sum + o.quantity, 0) >= req.quantityRequired
                : req.fulfilled

              return (
                <div key={req.categoryId}>
                  <div
                    className={`flex justify-between items-center p-2 rounded ${isFulfilled ? 'bg-green-50' : 'bg-red-50'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{req.categoryName}</span>
                      {override && (
                        <span className="text-xs bg-info-100 text-info-800 px-1.5 py-0.5 rounded">
                          Manual
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-gray-500">Need {req.quantityRequired} → </span>
                        {override ? (
                          <span>
                            {override.map((o) => o.productName).join(', ')} (
                            {formatCurrency(override.reduce((sum, o) => sum + o.quantity * o.unitCost, 0))})
                          </span>
                        ) : req.allocations.length > 0 ? (
                          <span>
                            {req.allocations.map((a) => a.productName).join(', ')} ({formatCurrency(req.totalCost)})
                          </span>
                        ) : (
                          <span className="text-red-600">No stock</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartOverride(hamperIdx, req.categoryId)}
                        className="p-1 text-gray-400 hover:text-primary-600"
                        title="Override allocation"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      {override && (
                        <button
                          type="button"
                          onClick={() => handleClearOverride(hamperIdx, req.categoryId)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Clear override"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Override Editor */}
                  {isEditing && (
                    <OverrideEditor
                      categoryName={req.categoryName}
                      quantityRequired={req.quantityRequired}
                      availableLots={availableLots}
                      loading={lotsLoading}
                      initialSelection={override || []}
                      onSave={handleSaveOverride}
                      onCancel={handleCancelOverride}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="text-right text-sm font-medium">
            Line cost: {formatCurrency(
              linePreview.requirements.reduce((sum, req) => {
                const overrideKey = getOverrideKey(hamperIdx, req.categoryId)
                const override = overrides[overrideKey]
                if (override) {
                  return sum + override.reduce((oSum, o) => oSum + o.quantity * o.unitCost, 0)
                }
                return sum + req.totalCost
              }, 0)
            )}
          </div>
        </div>
      ))}

      {/* Summary */}
      <div className="border-t pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span>Gross Revenue</span>
          <span className="font-medium">{formatCurrency(preview.summary.totalGross)}</span>
        </div>
        {postageCharged && (
          <div className="flex justify-between text-sm">
            <span>+ Postage Charged</span>
            <span className="font-medium">{formatCurrency(parseFloat(postageCharged))}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span>Stock Cost</span>
          <span className="font-medium text-red-600">
            -{formatCurrency(
              preview.lines.reduce((sum, linePreview, hamperIdx) => {
                return sum + linePreview.requirements.reduce((reqSum, req) => {
                  const overrideKey = getOverrideKey(hamperIdx, req.categoryId)
                  const override = overrides[overrideKey]
                  if (override) {
                    return reqSum + override.reduce((oSum, o) => oSum + o.quantity * o.unitCost, 0)
                  }
                  return reqSum + req.totalCost
                }, 0)
              }, 0)
            )}
          </span>
        </div>
        {postageCost && (
          <div className="flex justify-between text-sm">
            <span>Postage Cost</span>
            <span className="font-medium text-red-600">-{formatCurrency(parseFloat(postageCost))}</span>
          </div>
        )}
        {saleChannel === 'etsy' && preview.summary.estimatedFees > 0 && (
          <div className="flex justify-between text-sm">
            <span>Etsy Fees (estimated)</span>
            <span className="font-medium text-red-600">-{formatCurrency(preview.summary.estimatedFees)}</span>
          </div>
        )}
        {preview.summary.packagingOverhead > 0 && (
          <div className="flex justify-between text-sm">
            <span>Packaging Overhead</span>
            <span className="font-medium text-red-600">-{formatCurrency(preview.summary.packagingOverhead)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-semibold border-t pt-2">
          <span>Estimated Margin</span>
          <span className={preview.summary.estimatedMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatCurrency(preview.summary.estimatedMargin)}
          </span>
        </div>
      </div>
    </div>
  )
}

