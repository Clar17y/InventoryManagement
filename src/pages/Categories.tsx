import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { categories, Category } from '../lib/api'

interface CategoryFormData {
  name: string
  description: string
  pickRule: 'FIFO' | 'FEFO' | 'CHEAPEST' | 'MANUAL'
}

const emptyForm: CategoryFormData = { name: '', description: '', pickRule: 'FIFO' }

export default function Categories() {
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  const loadCategories = async () => {
    try {
      setLoading(true)
      const data = await categories.list()
      setCategoryList(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (editingId) {
        await categories.update(editingId, formData)
      } else {
        await categories.create(formData)
      }
      setShowForm(false)
      setEditingId(null)
      setFormData(emptyForm)
      await loadCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (category: Category) => {
    setFormData({
      name: category.name,
      description: category.description || '',
      pickRule: category.pickRule,
    })
    setEditingId(category.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Products in this category will be unaffected.')) return

    try {
      await categories.delete(id)
      await loadCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
    setError(null)
  }

  if (loading && categoryList.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Categories</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1">
            <PlusIcon className="h-5 w-5" />
            Add
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h3 className="font-medium">{editingId ? 'Edit Category' : 'New Category'}</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="e.g., Hand Cream, Lip Balm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pick Rule</label>
            <select
              value={formData.pickRule}
              onChange={(e) => setFormData({ ...formData, pickRule: e.target.value as CategoryFormData['pickRule'] })}
              className="input"
            >
              <option value="FIFO">FIFO - First In, First Out</option>
              <option value="FEFO">FEFO - First Expiry, First Out</option>
              <option value="CHEAPEST">Cheapest First</option>
              <option value="MANUAL">Manual Selection</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              How stock is allocated when making hampers
            </p>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {categoryList.length === 0 ? (
        <div className="card text-gray-500 text-center py-8">
          <p className="mb-2">No categories yet</p>
          <p className="text-sm">Create categories like "Hand Cream", "Chocolate", "Candle"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categoryList.map((category) => (
            <div key={category.id} className="card flex justify-between items-center">
              <div>
                <div className="font-medium">{category.name}</div>
                {category.description && (
                  <div className="text-sm text-gray-500">{category.description}</div>
                )}
                <div className="text-xs text-gray-400 mt-1">
                  {category._count?.products || 0} products • {category.pickRule}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(category)}
                  className="p-2 text-gray-500 hover:text-primary-600"
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleDelete(category.id)}
                  className="p-2 text-gray-500 hover:text-red-600"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
