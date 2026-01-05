import { useState, useEffect } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { hampers, categories, Hamper, HamperDetail, Category } from '../lib/api'

interface RequirementInput {
  categoryId: string
  quantity: number
  isOptional: boolean
}

interface HamperFormData {
  name: string
  sellingPrice: string
  etsyListingId: string
  requirements: RequirementInput[]
}

const emptyForm: HamperFormData = {
  name: '',
  sellingPrice: '',
  etsyListingId: '',
  requirements: [{ categoryId: '', quantity: 1, isOptional: false }],
}

function getAvailabilityColor(canMake: number): string {
  if (canMake >= 5) return 'bg-green-100 text-green-800'
  if (canMake >= 1) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export default function Hampers() {
  const [hamperList, setHamperList] = useState<Hamper[]>([])
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<HamperFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedDetail, setExpandedDetail] = useState<HamperDetail | null>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const [hampersData, catsData] = await Promise.all([
        hampers.list(),
        categories.list(),
      ])
      setHamperList(hampersData)
      setCategoryList(catsData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedDetail(null)
      return
    }
    try {
      const detail = await hampers.get(id)
      setExpandedDetail(detail)
      setExpandedId(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const data = {
        name: formData.name,
        sellingPrice: parseFloat(formData.sellingPrice),
        etsyListingId: formData.etsyListingId || undefined,
        requirements: formData.requirements
          .filter((r) => r.categoryId)
          .map((r) => ({
            categoryId: r.categoryId,
            quantity: r.quantity,
            isOptional: r.isOptional,
          })),
      }

      if (editingId) {
        await hampers.update(editingId, data)
      } else {
        await hampers.create(data)
      }
      setShowForm(false)
      setEditingId(null)
      setFormData(emptyForm)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hamper')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (hamper: Hamper) => {
    setFormData({
      name: hamper.name,
      sellingPrice: String(hamper.sellingPrice),
      etsyListingId: hamper.etsyListingId || '',
      requirements: hamper.requirements.map((r) => ({
        categoryId: r.categoryId,
        quantity: Number(r.quantity),
        isOptional: r.isOptional,
      })),
    })
    setEditingId(hamper.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this hamper?')) return
    try {
      await hampers.delete(id)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete hamper')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
    setError(null)
  }

  const addRequirement = () => {
    setFormData({
      ...formData,
      requirements: [...formData.requirements, { categoryId: '', quantity: 1, isOptional: false }],
    })
  }

  const removeRequirement = (index: number) => {
    if (formData.requirements.length <= 1) return
    setFormData({
      ...formData,
      requirements: formData.requirements.filter((_, i) => i !== index),
    })
  }

  const updateRequirement = (index: number, updates: Partial<RequirementInput>) => {
    setFormData({
      ...formData,
      requirements: formData.requirements.map((r, i) => (i === index ? { ...r, ...updates } : r)),
    })
  }

  if (loading && hamperList.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Hampers</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1">
            <PlusIcon className="h-5 w-5" />
            New Hamper
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h3 className="font-medium">{editingId ? 'Edit Hamper' : 'New Hamper'}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                placeholder="e.g., Luxury Spa Hamper"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (£) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={formData.sellingPrice}
                onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                className="input"
                placeholder="29.99"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Etsy Listing ID</label>
            <input
              type="text"
              value={formData.etsyListingId}
              onChange={(e) => setFormData({ ...formData, etsyListingId: e.target.value })}
              className="input"
              placeholder="Optional - for future Etsy sync"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">Requirements *</label>
              <button type="button" onClick={addRequirement} className="text-sm text-primary-600 hover:text-primary-700">
                + Add Requirement
              </button>
            </div>

            {categoryList.length === 0 ? (
              <p className="text-sm text-amber-600">Create categories first before adding hampers</p>
            ) : (
              <div className="space-y-2">
                {formData.requirements.map((req, index) => (
                  <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                    <select
                      required
                      value={req.categoryId}
                      onChange={(e) => updateRequirement(index, { categoryId: e.target.value })}
                      className="input flex-1"
                    >
                      <option value="">Select category...</option>
                      {categoryList.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      required
                      min="0.001"
                      step="0.001"
                      value={req.quantity}
                      onChange={(e) => updateRequirement(index, { quantity: parseFloat(e.target.value) || 0 })}
                      className="input w-20"
                      placeholder="Qty"
                    />
                    <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={req.isOptional}
                        onChange={(e) => updateRequirement(index, { isOptional: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      Optional
                    </label>
                    {formData.requirements.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRequirement(index)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving || categoryList.length === 0} className="btn-primary">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {hamperList.length === 0 ? (
        <div className="card text-gray-500 text-center py-12">
          <p className="mb-4">No hampers defined yet</p>
          <p className="text-sm">Create your first hamper to start tracking availability</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hamperList.map((hamper) => (
            <div key={hamper.id} className="card">
              <div className="flex justify-between items-start">
                <button
                  onClick={() => handleExpand(hamper.id)}
                  className="flex-1 text-left flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{hamper.name}</div>
                    <div className="text-sm text-gray-500">
                      £{Number(hamper.sellingPrice).toFixed(2)} • {hamper.requirements.length} requirements
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${getAvailabilityColor(hamper.canMake)}`}>
                      Can make: {hamper.canMake}
                    </span>
                    {expandedId === hamper.id ? (
                      <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </button>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => handleEdit(hamper)} className="p-2 text-gray-500 hover:text-primary-600">
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button onClick={() => handleDelete(hamper.id)} className="p-2 text-gray-500 hover:text-red-600">
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {expandedId === hamper.id && expandedDetail && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Selling Price</div>
                      <div className="font-semibold">£{Number(expandedDetail.sellingPrice).toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Est. Cost</div>
                      <div className="font-semibold">£{expandedDetail.estimatedCost.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Est. Margin</div>
                      <div className={`font-semibold ${expandedDetail.estimatedMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        £{expandedDetail.estimatedMargin.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <h4 className="text-sm font-medium text-gray-700 mb-2">Requirements</h4>
                  <div className="space-y-2">
                    {expandedDetail.requirements.map((req) => (
                      <div key={req.id} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded-lg">
                        <div>
                          <span className="font-medium">{req.category.name}</span>
                          {req.isOptional && <span className="text-gray-400 ml-1">(optional)</span>}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span>Need: {req.quantityRequired}</span>
                          <span className={req.availableStock >= req.quantityRequired ? 'text-green-600' : 'text-red-600'}>
                            Stock: {req.availableStock.toFixed(1)}
                          </span>
                          <span className={`px-2 py-0.5 rounded ${getAvailabilityColor(req.canFulfill)}`}>
                            ×{req.canFulfill}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
