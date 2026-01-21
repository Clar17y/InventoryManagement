import { useState, useEffect, useMemo } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { categories, products, Category, Product } from '../../../lib/api'
import { useDebounce } from '../../../hooks/useDebounce'
import { useScrollToForm } from '../../../hooks/useScrollToForm'

interface CategoryFormData {
  name: string
  description: string
  pickRule: 'FIFO' | 'FEFO' | 'CHEAPEST' | 'MANUAL'
}

const emptyForm: CategoryFormData = { name: '', description: '', pickRule: 'FIFO' }

export default function Categories() {
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [productList, setProductList] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const debouncedSearch = useDebounce(searchQuery, 300)

  const { formRef, scrollToForm } = useScrollToForm()

  const loadData = async () => {
    try {
      setLoading(true)
      const [cats, prods] = await Promise.all([
        categories.list(),
        products.list(),
      ])
      setCategoryList(cats)
      setProductList(prods)
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

  const filteredCategories = useMemo(() => {
    if (!debouncedSearch.trim()) return categoryList
    const query = debouncedSearch.toLowerCase()
    return categoryList.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      c.description?.toLowerCase().includes(query)
    )
  }, [categoryList, debouncedSearch])

  const productsByCategory = useMemo(() => {
    const grouped: Record<string, Product[]> = {}
    productList.forEach((p) => {
      const catId = p.categoryId
      if (!grouped[catId]) grouped[catId] = []
      grouped[catId].push(p)
    })
    return grouped
  }, [productList])

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
      await loadData()
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
    scrollToForm()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Products in this category will be unaffected.')) return

    try {
      await categories.delete(id)
      await loadData()
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

      {!showForm && (
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="alert-danger">{error}</div>
      )}

      {showForm && (
        <div ref={formRef}>
          <form onSubmit={handleSubmit} className="card space-y-4" key={editingId ?? 'new'}>
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
        </div>
      )}

      {categoryList.length === 0 ? (
        <div className="card text-gray-500 text-center py-8">
          <p className="mb-2">No categories yet</p>
          <p className="text-sm">Create categories like "Hand Cream", "Chocolate", "Candle"</p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="card text-gray-500 text-center py-8">
          <p className="mb-2">No categories match "{debouncedSearch}"</p>
          <p className="text-sm">Try a different search term</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCategories.map((category) => {
            const categoryProducts = productsByCategory[category.id] || []
            const isExpanded = expandedId === category.id
            return (
              <div key={category.id} className="card">
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : category.id)}
                    className="flex-1 text-left flex items-center gap-2"
                  >
                    {isExpanded ? (
                      <ChevronUpIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div>
                      <div className="font-medium">{category.name}</div>
                      {category.description && (
                        <div className="text-sm text-gray-500">{category.description}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        {categoryProducts.length} products • {category.pickRule}
                      </div>
                    </div>
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(category)}
                      className="p-2 text-gray-500 hover:text-primary-600"
                      aria-label={`Edit category ${category.name}`}
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(category.id)}
                      className="p-2 text-gray-500 hover:text-red-600"
                      aria-label={`Delete category ${category.name}`}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {categoryProducts.length === 0 ? (
                      <div className="text-sm text-gray-400 text-center py-2">
                        No products in this category
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {categoryProducts.map((product) => (
                          <div
                            key={product.id}
                            className="flex justify-between items-center py-1.5 px-2 bg-gray-50 rounded text-sm"
                          >
                            <span className="font-medium">{product.name}</span>
                            <span className="text-xs text-gray-500">
                              {product.totalStock ?? 0} {product.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
