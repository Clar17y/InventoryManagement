import type { PostageTier } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'

interface PostageTiersSectionProps {
  tiers: PostageTier[]
  newEtsyCharge: string
  newActualCost: string
  onNewEtsyChargeChange: (value: string) => void
  onNewActualCostChange: (value: string) => void
  saving: boolean
  onAddTier: () => void
  onDeleteTier: (id: string) => void
}

export default function PostageTiersSection({
  tiers,
  newEtsyCharge,
  newActualCost,
  onNewEtsyChargeChange,
  onNewActualCostChange,
  saving,
  onAddTier,
  onDeleteTier,
}: PostageTiersSectionProps) {
  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Postage Tiers</h3>
      <p className="text-sm text-gray-500">
        Map Etsy shipping charges to actual postage costs for margin calculations
      </p>

      {tiers.length > 0 && (
        <div className="space-y-2">
          {tiers.map((tier) => (
            <div key={tier.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
              <span>
                Etsy charges {formatCurrency(Number(tier.etsyCharge))} &rarr; Actual cost {formatCurrency(Number(tier.actualCost))}
                {tier.label && <span className="text-gray-500 ml-2">({tier.label})</span>}
              </span>
              <button
                onClick={() => onDeleteTier(tier.id)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          value={newEtsyCharge}
          onChange={(e) => onNewEtsyChargeChange(e.target.value)}
          className="input flex-1"
          placeholder="Etsy charge"
        />
        <input
          type="number"
          step="0.01"
          value={newActualCost}
          onChange={(e) => onNewActualCostChange(e.target.value)}
          className="input flex-1"
          placeholder="Actual cost"
        />
        <button
          onClick={onAddTier}
          disabled={saving || !newEtsyCharge || !newActualCost}
          className="btn-primary"
        >
          Add
        </button>
      </div>
    </section>
  )
}
