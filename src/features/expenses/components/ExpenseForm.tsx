import type { ExpenseCategory } from '../../../lib/api'
import { categoryLabels } from '../constants'
import type { ExpenseFormData } from '../types'

interface ExpenseFormProps {
  editingId: string | null
  formData: ExpenseFormData
  saving: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  setFormData: React.Dispatch<React.SetStateAction<ExpenseFormData>>
  onIncVatChange: (value: string) => void
  onExcVatChange: (value: string) => void
}

export default function ExpenseForm({
  editingId,
  formData,
  saving,
  onSubmit,
  onCancel,
  setFormData,
  onIncVatChange,
  onExcVatChange,
}: ExpenseFormProps) {
  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <h3 className="font-medium">{editingId ? 'Edit Expense' : 'New Expense'}</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
          <input
            type="date"
            required
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="input"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as ExpenseCategory })}
            className="input"
          >
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
        <input
          type="text"
          value={formData.supplier}
          onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
          className="input"
          placeholder="e.g., Etsy, Royal Mail, Amazon"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
        <input
          type="text"
          required
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="input"
          placeholder="What was this expense for?"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (inc VAT) *</label>
          <input
            type="number"
            required
            step="0.01"
            min="0"
            value={formData.amountIncVat}
            onChange={(e) => onIncVatChange(e.target.value)}
            className="input"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (exc VAT)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.amountExcVat}
            onChange={(e) => onExcVatChange(e.target.value)}
            className="input"
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}

