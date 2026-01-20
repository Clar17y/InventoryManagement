import { CheckIcon, PencilIcon } from '@heroicons/react/24/outline'
import type { EtsyFeeConfig } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'

interface EtsyFeesForm {
  name: string
  transactionFee: number
  regulatoryFee: number
  paymentFeePercent: number
  paymentFeeFixed: number
  vatRate: number
  listingFee: number
}

interface EtsyFeesSectionProps {
  etsyFees: EtsyFeeConfig | null
  editing: boolean
  etsyForm: EtsyFeesForm
  setEtsyForm: React.Dispatch<React.SetStateAction<EtsyFeesForm>>
  saving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onUseDefaults: () => void
}

export default function EtsyFeesSection({
  etsyFees,
  editing,
  etsyForm,
  setEtsyForm,
  saving,
  onStartEdit,
  onCancelEdit,
  onSave,
  onUseDefaults,
}: EtsyFeesSectionProps) {
  return (
    <section className="card space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Etsy Fees</h3>
        {etsyFees && !editing && (
          <button
            onClick={onStartEdit}
            className="p-1.5 text-gray-500 hover:text-primary-600"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {!etsyFees && !editing ? (
        <div className="bg-amber-50 p-4 rounded-lg">
          <p className="text-sm text-amber-800 mb-3">
            No Etsy fee configuration found. Set up fees to calculate accurate margins for Etsy sales.
          </p>
          <button
            onClick={onUseDefaults}
            disabled={saving}
            className="btn-primary text-sm"
          >
            {saving ? 'Setting up...' : 'Use Default UK Etsy Fees'}
          </button>
        </div>
      ) : editing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Config Name</label>
            <input
              type="text"
              value={etsyForm.name}
              onChange={(e) => setEtsyForm({ ...etsyForm, name: e.target.value })}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Fee (%)</label>
              <input
                type="number"
                step="0.1"
                value={(etsyForm.transactionFee * 100).toFixed(1)}
                onChange={(e) => setEtsyForm({ ...etsyForm, transactionFee: parseFloat(e.target.value) / 100 })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Applied to item price + postage</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regulatory Fee (%)</label>
              <input
                type="number"
                step="0.01"
                value={(etsyForm.regulatoryFee * 100).toFixed(2)}
                onChange={(e) => setEtsyForm({ ...etsyForm, regulatoryFee: parseFloat(e.target.value) / 100 })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Fee (%)</label>
              <input
                type="number"
                step="0.1"
                value={(etsyForm.paymentFeePercent * 100).toFixed(1)}
                onChange={(e) => setEtsyForm({ ...etsyForm, paymentFeePercent: parseFloat(e.target.value) / 100 })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Fixed Fee</label>
              <input
                type="number"
                step="0.01"
                value={etsyForm.paymentFeeFixed}
                onChange={(e) => setEtsyForm({ ...etsyForm, paymentFeeFixed: parseFloat(e.target.value) })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VAT Rate (%)</label>
              <input
                type="number"
                step="1"
                value={(etsyForm.vatRate * 100).toFixed(0)}
                onChange={(e) => setEtsyForm({ ...etsyForm, vatRate: parseFloat(e.target.value) / 100 })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">On payment processing fee</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Listing Fee</label>
              <input
                type="number"
                step="0.01"
                value={etsyForm.listingFee}
                onChange={(e) => setEtsyForm({ ...etsyForm, listingFee: parseFloat(e.target.value) })}
                className="input"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Save Fees'}
            </button>
            <button
              onClick={onCancelEdit}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : etsyFees && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckIcon className="h-4 w-4" />
            <span>{etsyFees.name}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 p-2 rounded">
              <div className="text-gray-500">Transaction</div>
              <div className="font-medium">{(Number(etsyFees.transactionFee) * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="text-gray-500">Regulatory</div>
              <div className="font-medium">{(Number(etsyFees.regulatoryFee) * 100).toFixed(2)}%</div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="text-gray-500">Payment</div>
              <div className="font-medium">
                {(Number(etsyFees.paymentFeePercent) * 100).toFixed(1)}% + {formatCurrency(Number(etsyFees.paymentFeeFixed))}
              </div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="text-gray-500">VAT on Processing</div>
              <div className="font-medium">{(Number(etsyFees.vatRate) * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="text-gray-500">Listing Fee</div>
              <div className="font-medium">{formatCurrency(Number(etsyFees.listingFee))}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

