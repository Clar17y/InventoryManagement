import type { CategoryLot, Hamper, PostageTier, SaleChannel, SalePreview } from '../../../lib/api'
import { getOverrideKey } from '../utils'
import type { LotOverride, SaleLineInput } from '../types'
import HistoricalSaleSummaryCard from './record/HistoricalSaleSummaryCard'
import SaleChannelCard from './record/SaleChannelCard'
import SaleItemsCard from './record/SaleItemsCard'
import SaleOptionalDetailsCard from './record/SaleOptionalDetailsCard'
import SalePostageCard from './record/SalePostageCard'
import StockAllocationPreviewCard from './record/StockAllocationPreviewCard'

export default function SalesRecordView({
  error,
  lines,
  hamperList,
  saleChannel,
  setSaleChannel,
  postageCharged,
  setPostageCharged,
  postageCost,
  setPostageCost,
  saleDate,
  setSaleDate,
  etsyOrderId,
  setEtsyOrderId,
  notes,
  setNotes,
  preview,
  previewLoading,
  saving,
  isHistorical,
  setIsHistorical,
  overrides,
  editingOverride,
  availableLots,
  lotsLoading,
  postageTiers,
  handleCancel,
  handleAddLine,
  handleRemoveLine,
  handleUpdateLine,
  handleSubmit,
  handleStartOverride,
  handleClearOverride,
  handleSaveOverride,
  handleCancelOverride,
}: {
  error: string | null
  lines: SaleLineInput[]
  hamperList: Hamper[]
  saleChannel: SaleChannel
  setSaleChannel: (value: SaleChannel) => void
  postageCharged: string
  setPostageCharged: (value: string) => void
  postageCost: string
  setPostageCost: (value: string) => void
  saleDate: string
  setSaleDate: (value: string) => void
  etsyOrderId: string
  setEtsyOrderId: (value: string) => void
  notes: string
  setNotes: (value: string) => void
  preview: SalePreview | null
  previewLoading: boolean
  saving: boolean
  isHistorical: boolean
  setIsHistorical: (value: boolean) => void
  overrides: Record<string, LotOverride[]>
  editingOverride: { hamperIdx: number; categoryId: string } | null
  availableLots: CategoryLot[]
  lotsLoading: boolean
  postageTiers: PostageTier[]
  handleCancel: () => void
  handleAddLine: (bespoke?: boolean) => void
  handleRemoveLine: (index: number) => void
  handleUpdateLine: (index: number, updates: Partial<SaleLineInput>) => void
  handleSubmit: () => void
  handleStartOverride: (hamperIdx: number, categoryId: string) => void
  handleClearOverride: (hamperIdx: number, categoryId: string) => void
  handleSaveOverride: (selectedLots: LotOverride[]) => void
  handleCancelOverride: () => void
}) {
  // For historical sales, we just need valid lines; for normal sales we check fulfillment
  const hasValidLines = lines.some((l) => (l.hamperId || (l.isBespoke && l.description && l.unitPrice)) && l.quantity > 0)
  const canSubmit = !saving && (
    isHistorical
      ? hasValidLines
      : preview && preview.lines.every((linePreview, idx) => {
        return linePreview.requirements.every((req) => {
          const key = getOverrideKey(idx, req.categoryId)
          const override = overrides[key]
          if (override) {
            const totalOverride = override.reduce((sum, o) => sum + o.quantity, 0)
            return totalOverride >= req.quantityRequired
          }
          return req.fulfilled
        })
      })
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Record Sale</h2>
        <button onClick={handleCancel} className="btn-secondary">
          Cancel
        </button>
      </div>

      {error && <div className="alert-danger">{error}</div>}

      {/* Sale Channel */}
      <SaleChannelCard
        saleChannel={saleChannel}
        setSaleChannel={setSaleChannel}
        setPostageCharged={setPostageCharged}
        setPostageCost={setPostageCost}
        isHistorical={isHistorical}
        setIsHistorical={setIsHistorical}
        postageTiers={postageTiers}
      />

      {/* Hamper Selection */}
      <SaleItemsCard
        lines={lines}
        hamperList={hamperList}
        handleAddLine={handleAddLine}
        handleRemoveLine={handleRemoveLine}
        handleUpdateLine={handleUpdateLine}
      />

      {/* Postage */}
      <SalePostageCard
        postageCharged={postageCharged}
        setPostageCharged={setPostageCharged}
        postageCost={postageCost}
        setPostageCost={setPostageCost}
      />

      {/* Optional Fields */}
      <SaleOptionalDetailsCard
        saleDate={saleDate}
        setSaleDate={setSaleDate}
        saleChannel={saleChannel}
        etsyOrderId={etsyOrderId}
        setEtsyOrderId={setEtsyOrderId}
        notes={notes}
        setNotes={setNotes}
      />

      {/* Allocation Preview - only for non-historical sales */}
      {!isHistorical && previewLoading && (
        <div className="card text-center py-4 text-gray-500">Loading preview...</div>
      )}

      {/* Historical Sale Summary */}
      {isHistorical && (
        <HistoricalSaleSummaryCard
          lines={lines}
          hamperList={hamperList}
          postageCharged={postageCharged}
        />
      )}

      {!isHistorical && preview && !previewLoading && (
        <StockAllocationPreviewCard
          preview={preview}
          postageCharged={postageCharged}
          postageCost={postageCost}
          saleChannel={saleChannel}
          overrides={overrides}
          editingOverride={editingOverride}
          availableLots={availableLots}
          lotsLoading={lotsLoading}
          handleStartOverride={handleStartOverride}
          handleClearOverride={handleClearOverride}
          handleSaveOverride={handleSaveOverride}
          handleCancelOverride={handleCancelOverride}
        />
      )}

      {/* Submit Button */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary flex-1"
        >
          {saving ? 'Recording...' : 'Confirm Sale'}
        </button>
      </div>
    </div>
  )
}
