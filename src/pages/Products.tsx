import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { products, categories, Product, Category } from '../lib/api'

interface ProductFormData {
  name: string
  barcode: string
  categoryId: string
  unit: string
}

const emptyForm: ProductFormData = { name: '', barcode: '', categoryId: '', unit: 'units' }

export default function Products() {
  const [productList, setProductList] = useState<Product[]>([])
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ProductFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('')

  const loadData = async () => {
    try {
      setLoading(true)
      const [prods, cats] = await Promise.all([
        products.list(filterCategory || undefined),
        categories.list(),
      ])
      setProductList(prods)
      setCategoryList(cats)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [filterCategory])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const data = {
        name: formData.name,
        barcode: formData.barcode || undefined,
        categoryId: formData.categoryId,
        unit: formData.unit,
      }

      if (editingId) {
        await products.update(editingId, data)
      } else {
        await products.create(data)
      }
      setShowForm(false)
      setEditingId(null)
      setFormData(emptyForm)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (product: Product) => {
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      categoryId: product.categoryId,
      unit: product.unit,
    })
    setEditingId(product.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product? Stock history will be preserved.')) return

    try {
      await products.delete(id)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
    setError(null)
  }

  const handleAddNew = () => {
    setFormData({ ...emptyForm, categoryId: filterCategory || categoryList[0]?.id || '' })
    setShowForm(true)
  }

  if (loading && productList.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Products</h2>
        {!showForm && (
          <button onClick={handleAddNew} className="btn-primary flex items-center gap-1">
            <PlusIcon className="h-5 w-5" />
            Add
          </button>
        )}
      </div>

      {!showForm && categoryList.length > 0 && (
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="input"
        >
          <option value="">All Categories</option>
          {categoryList.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h3 className="font-medium">{editingId ? 'Edit Product' : 'New Product'}</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="e.g., Lavender Hand Cream 100ml"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select
              required
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="input"
            >
              <option value="">Select category...</option>
              {categoryList.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            {categoryList.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Create categories first before adding products
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
            <input
              type="text"
              value={formData.barcode}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              className="input"
              placeholder="EAN/UPC barcode (optional)"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used for barcode scanning when adding stock
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              className="input"
            >
              <option value="units">Units (individual items)</option>
              <option value="grams">Grams (g)</option>
              <option value="ml">Millilitres (ml)</option>
              <option value="metres">Metres (m)</option>
            </select>
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

      {productList.length === 0 ? (
        <div className="card text-gray-500 text-center py-8">
          <p className="mb-2">No products yet</p>
          <p className="text-sm">
            {categoryList.length === 0
              ? 'Create categories first, then add products'
              : 'Add products that go into your hampers'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {productList.map((product) => (
            <div key={product.id} className="card flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{product.name}</div>
                <div className="text-sm text-gray-500">
                  {product.category?.name || 'Unknown category'}
                </div>
                <div className="flex gap-3 text-xs text-gray-400 mt-1">
                  {product.unit === 'units' ? (
                    <span>Stock: {product.totalStock ?? 0} {product.unit}</span>
                  ) : (
                    <span>
                      {product.lotCount ?? 0} lot{(product.lotCount ?? 0) !== 1 ? 's' : ''}
                      ({product.totalRemaining ?? 0} {product.unit} total)
                    </span>
                  )}
                  {product.currentCost !== null && product.currentCost !== undefined && (
                    <span>Cost: £{Number(product.currentCost).toFixed(2)}/{product.unit}</span>
                  )}
                  {product.barcode && <span>#{product.barcode}</span>}
                </div>
              </div>
              <div className="flex gap-1 ml-2">
                <button
                  onClick={() => handleEdit(product)}
                  className="p-2 text-gray-500 hover:text-primary-600"
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleDelete(product.id)}
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
