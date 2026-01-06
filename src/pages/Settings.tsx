import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon, CheckIcon, PencilIcon } from '@heroicons/react/24/outline'
import { settings, EtsyFeeConfig, PackagingOverhead } from '../lib/api'
import { formatCurrency } from '../lib/formatting'

const settingsLinks = [
  {
    to: '/categories',
    title: 'Categories',
    description: 'Manage component categories (Hand Cream, Chocolate, etc.)',
  },
  {
    to: '/products',
    title: 'Products',
    description: 'Manage products and their barcodes',
  },
  {
    to: '/expenses',
    title: 'Business Expenses',
    description: 'Track advertising, postage, packaging, and other costs',
  },
]

// Default Etsy fee rates (as of Jan 2024)
const DEFAULT_ETSY_FEES = {
  name: 'UK Etsy Fees 2024',
  transactionFee: 0.065, // 6.5%
  regulatoryFee: 0.0032, // 0.32%
  paymentFeePercent: 0.04, // 4%
  paymentFeeFixed: 0.20, // £0.20
  vatRate: 0.20, // 20%
  listingFee: 0.15, // £0.15
}

export default function Settings() {
  const [etsyFees, setEtsyFees] = useState<EtsyFeeConfig | null>(null)
  const [packagingOverheads, setPackagingOverheads] = useState<PackagingOverhead[]>([])
  const [packagingTotal, setPackagingTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Etsy fee editing
  const [editingEtsy, setEditingEtsy] = useState(false)
  const [etsyForm, setEtsyForm] = useState(DEFAULT_ETSY_FEES)

  // Packaging overhead editing
  const [newOverheadName, setNewOverheadName] = useState('')
  const [newOverheadCost, setNewOverheadCost] = useState('')

  const loadSettings = async () => {
    try {
      setLoading(true)
      const [feesData, overheadData] = await Promise.all([
        settings.getEtsyFees(),
        settings.getPackagingOverhead(),
      ])

      // Get the active config (first one since ordered by effectiveFrom desc)
      const activeConfig = feesData.find(f => f.isActive) || feesData[0] || null
      setEtsyFees(activeConfig)

      if (activeConfig) {
        setEtsyForm({
          name: activeConfig.name,
          transactionFee: Number(activeConfig.transactionFee),
          regulatoryFee: Number(activeConfig.regulatoryFee),
          paymentFeePercent: Number(activeConfig.paymentFeePercent),
          paymentFeeFixed: Number(activeConfig.paymentFeeFixed),
          vatRate: Number(activeConfig.vatRate),
          listingFee: Number(activeConfig.listingFee),
        })
      }

      setPackagingOverheads(overheadData.overheads)
      setPackagingTotal(overheadData.totalPerOrder)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const handleSaveEtsyFees = async () => {
    setSaving(true)
    setError(null)
    try {
      await settings.createEtsyFees(etsyForm)
      setEditingEtsy(false)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Etsy fees')
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefaultEtsyFees = async () => {
    setSaving(true)
    setError(null)
    try {
      await settings.createEtsyFees(DEFAULT_ETSY_FEES)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default fees')
    } finally {
      setSaving(false)
    }
  }

  const handleAddOverhead = async () => {
    if (!newOverheadName.trim() || !newOverheadCost) return

    setSaving(true)
    setError(null)
    try {
      await settings.createPackagingOverhead({
        name: newOverheadName.trim(),
        costPerOrder: parseFloat(newOverheadCost),
      })
      setNewOverheadName('')
      setNewOverheadCost('')
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add overhead')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteOverhead = async (id: string) => {
    if (!confirm('Delete this packaging overhead?')) return

    try {
      await settings.deletePackagingOverhead(id)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete overhead')
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Settings</h2>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="space-y-2">
        {settingsLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="card flex justify-between items-center hover:border-primary-300 transition-colors"
          >
            <div>
              <h3 className="font-medium">{link.title}</h3>
              <p className="text-sm text-gray-500">{link.description}</p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-gray-400" />
          </Link>
        ))}
      </div>

      {/* Etsy Fees Section */}
      <section className="card space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-medium">Etsy Fees</h3>
          {etsyFees && !editingEtsy && (
            <button
              onClick={() => setEditingEtsy(true)}
              className="p-1.5 text-gray-500 hover:text-primary-600"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {!etsyFees && !editingEtsy ? (
          <div className="bg-amber-50 p-4 rounded-lg">
            <p className="text-sm text-amber-800 mb-3">
              No Etsy fee configuration found. Set up fees to calculate accurate margins for Etsy sales.
            </p>
            <button
              onClick={handleSetDefaultEtsyFees}
              disabled={saving}
              className="btn-primary text-sm"
            >
              {saving ? 'Setting up...' : 'Use Default UK Etsy Fees'}
            </button>
          </div>
        ) : editingEtsy ? (
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
                onClick={handleSaveEtsyFees}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Saving...' : 'Save Fees'}
              </button>
              <button
                onClick={() => setEditingEtsy(false)}
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
                <div className="font-medium">{(Number(etsyFees.paymentFeePercent) * 100).toFixed(1)}% + {formatCurrency(Number(etsyFees.paymentFeeFixed))}</div>
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

      {/* Packaging Overhead Section */}
      <section className="card space-y-4">
        <h3 className="font-medium">Packaging Overhead</h3>
        <p className="text-sm text-gray-500">
          Average costs for tape, bubble wrap, and other consumables per order
        </p>

        {packagingOverheads.length > 0 && (
          <div className="space-y-2">
            {packagingOverheads.map((overhead) => (
              <div key={overhead.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                <span>{overhead.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatCurrency(Number(overhead.costPerOrder))}</span>
                  <button
                    onClick={() => handleDeleteOverhead(overhead.id)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="font-medium">Total per order</span>
              <span className="font-semibold">{formatCurrency(packagingTotal)}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newOverheadName}
            onChange={(e) => setNewOverheadName(e.target.value)}
            className="input flex-1"
            placeholder="Item name (e.g., Tape)"
          />
          <input
            type="number"
            step="0.01"
            value={newOverheadCost}
            onChange={(e) => setNewOverheadCost(e.target.value)}
            className="input w-24"
            placeholder="Cost"
          />
          <button
            onClick={handleAddOverhead}
            disabled={saving || !newOverheadName.trim() || !newOverheadCost}
            className="btn-primary"
          >
            Add
          </button>
        </div>
      </section>
    </div>
  )
}
