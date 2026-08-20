import { useState, useEffect, useMemo } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { products as productsApi, suppliers, type Product, type Supplier } from '../../../lib/api'
import { useDebounce } from '../../../hooks/useDebounce'

interface SupplierProductsModalProps {
  supplier: Supplier
  onClose: () => void
}

export default function SupplierProductsModal({ supplier, onClose }: SupplierProductsModalProps) {
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)

  useEffect(() => {
    const load = async () => {
      try {
        const [productsList, productIds] = await Promise.all([
          productsApi.list({ page: 1, pageSize: 100 }),
          suppliers.getSupplierProducts(supplier.id),
        ])
        setAllProducts(productsList.items)
        const idSet = new Set(productIds)
        setSelectedIds(idSet)
        setInitialIds(idSet)
      } catch (err) {
        console.error('Failed to load supplier products', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supplier.id])

  const filteredProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return allProducts
    const query = debouncedSearch.toLowerCase()
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.category?.name?.toLowerCase().includes(query)
    )
  }, [allProducts, debouncedSearch])

  // Group by category
  const productsByCategory = useMemo(() => {
    const groups: Record<string, Product[]> = {}
    filteredProducts.forEach((p) => {
      const cat = p.category?.name || 'Uncategorized'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(p)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredProducts])

  const toggleProduct = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const toggleCategory = (categoryProducts: Product[]) => {
    const allSelected = categoryProducts.every((p) => selectedIds.has(p.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      categoryProducts.forEach((p) => {
        if (allSelected) next.delete(p.id)
        else next.add(p.id)
      })
      return next
    })
  }

  const hasChanges = useMemo(() => {
    if (selectedIds.size !== initialIds.size) return true
    for (const id of selectedIds) {
      if (!initialIds.has(id)) return true
    }
    return false
  }, [selectedIds, initialIds])

  const handleSave = async () => {
    setSaving(true)
    try {
      await suppliers.setSupplierProducts(supplier.id, [...selectedIds])
      onClose()
    } catch (err) {
      console.error('Failed to save supplier products', err)
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {supplier.name}
            </h2>
            <p className="text-sm text-gray-500">
              {selectedIds.size} product{selectedIds.size !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoFocus
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
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto mb-2" />
              Loading products...
            </div>
          ) : productsByCategory.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No products match your search
            </div>
          ) : (
            <div className="space-y-3">
              {productsByCategory.map(([categoryName, categoryProducts]) => {
                const allSelected = categoryProducts.every((p) => selectedIds.has(p.id))
                const someSelected = categoryProducts.some((p) => selectedIds.has(p.id))
                return (
                  <div key={categoryName}>
                    <button
                      onClick={() => toggleCategory(categoryProducts)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1 hover:text-gray-900 w-full text-left"
                    >
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected && !allSelected
                        }}
                        readOnly
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {categoryName}
                      <span className="text-xs font-normal text-gray-400">
                        ({categoryProducts.filter((p) => selectedIds.has(p.id)).length}/{categoryProducts.length})
                      </span>
                    </button>
                    <div className="ml-6 space-y-0.5">
                      {categoryProducts.map((product) => (
                        <label
                          key={product.id}
                          className="flex items-center gap-2 py-0.5 text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleProduct(product.id)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          {product.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 space-y-2">
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex-1 btn-primary py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
