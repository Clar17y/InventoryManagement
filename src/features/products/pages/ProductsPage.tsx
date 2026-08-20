import { useState, useEffect } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { products, categories, suppliers, type Product, type Category, type Supplier } from '../../../lib/api'
import { useDebounce } from '../../../hooks/useDebounce'
import { useScrollToForm } from '../../../hooks/useScrollToForm'
import { usePaginationSearchParams } from '../../../hooks/usePaginationSearchParams'
import { usePaginatedList } from '../../../hooks/usePaginatedList'
import ProductCategoryFilter from '../components/ProductCategoryFilter'
import ProductForm from '../components/ProductForm'
import ProductsHeader from '../components/ProductsHeader'
import ProductsList from '../components/ProductsList'
import { emptyForm } from '../constants'
import type { ProductFormData } from '../types'

type ProductSort = 'name' | 'createdAt'
type SortDirection = 'asc' | 'desc'

export default function Products() {
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<ProductFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<ProductSort>('name')
  const [direction, setDirection] = useState<SortDirection>('asc')
  const debouncedSearch = useDebounce(searchQuery, 400)

  // Barcode management state
  const [newBarcode, setNewBarcode] = useState('')
  const [addingBarcode, setAddingBarcode] = useState(false)

  // Supplier state
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])

  const { formRef, scrollToForm } = useScrollToForm()
  const { page, pageSize, setPage, setPageSize, resetPage } = usePaginationSearchParams()

  const listParams = {
    page,
    pageSize,
    categoryId: filterCategory || undefined,
    search: debouncedSearch.trim() || undefined,
    sort,
    direction,
  }
  const listState = usePaginatedList({
    queryKey: JSON.stringify(listParams),
    load: (signal) => products.list(listParams, { signal }),
  })

  const productList = listState.data?.items ?? []
  const pagination = listState.data?.pagination ?? {
    page,
    pageSize,
    totalItems: 0,
    totalPages: 0,
  }

  useEffect(() => {
    categories.list().then(setCategoryList).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load categories')
    })
  }, [])

  useEffect(() => {
    suppliers.list().then(setAllSuppliers).catch((err) => console.error('Failed to load suppliers', err))
  }, [])

  useEffect(() => {
    if (
      listState.data
      && listState.data.items.length === 0
      && listState.data.pagination.totalItems > 0
      && page > 1
    ) {
      setPage(Math.max(1, page - 1))
    }
  }, [listState.data, page, setPage])

  const reloadProducts = () => {
    listState.retry()
  }

  const handleCategoryChange = (value: string) => {
    resetPage()
    setFilterCategory(value)
  }

  const handleSearchChange = (value: string) => {
    resetPage()
    setSearchQuery(value)
  }

  const handleSortChange = (value: ProductSort) => {
    resetPage()
    setSort(value)
  }

  const handleDirectionChange = () => {
    resetPage()
    setDirection((current) => current === 'asc' ? 'desc' : 'asc')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const data = {
        name: formData.name,
        categoryId: formData.categoryId,
        unit: formData.unit,
        lowStockThreshold: formData.lowStockThreshold,
      }

      let productId: string
      if (editingId) {
        await products.update(editingId, data)
        productId = editingId
      } else {
        const created = await products.create(data)
        productId = created.id
      }
      try {
        await suppliers.setProductSuppliers(productId, selectedSupplierIds)
      } catch (supplierErr) {
        console.error('Failed to save supplier links', supplierErr)
        // Product was saved successfully, close form but warn user
        setShowForm(false)
        setEditingId(null)
        setEditingProduct(null)
        setFormData(emptyForm)
        setSelectedSupplierIds([])
        reloadProducts()
        setError('Product saved but supplier links failed. Edit the product to retry.')
        return
      }
      setShowForm(false)
      setEditingId(null)
      setEditingProduct(null)
      setFormData(emptyForm)
      setSelectedSupplierIds([])
      reloadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (product: Product) => {
    setFormData({
      name: product.name,
      categoryId: product.categoryId,
      unit: product.unit,
      lowStockThreshold: product.lowStockThreshold,
    })
    setEditingId(product.id)
    setEditingProduct(product)
    setShowForm(true)
    scrollToForm()
    suppliers.getProductSuppliers(product.id).then(setSelectedSupplierIds).catch((err) => {
      console.error('Failed to load product suppliers', err)
      setSelectedSupplierIds([])
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product? Stock history will be preserved.')) return

    try {
      await products.delete(id)
      reloadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product')
    }
  }

  const handleSupplierToggle = (supplierId: string) => {
    setSelectedSupplierIds(prev =>
      prev.includes(supplierId)
        ? prev.filter(id => id !== supplierId)
        : [...prev, supplierId]
    )
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setEditingProduct(null)
    setFormData(emptyForm)
    setNewBarcode('')
    setSelectedSupplierIds([])
    setError(null)
  }

  const handleAddNew = () => {
    setFormData({ ...emptyForm, categoryId: filterCategory || categoryList[0]?.id || '' })
    setShowForm(true)
  }

  const handleAddBarcode = async () => {
    if (!editingId || !newBarcode.trim()) return

    setAddingBarcode(true)
    setError(null)
    try {
      const addedBarcode = await products.addBarcode(editingId, newBarcode.trim())
      setEditingProduct((current) => {
        if (!current) return current
        const barcodes = [...(current.barcodes ?? []), addedBarcode]
        return {
          ...current,
          barcode: current.barcode ?? addedBarcode.barcode,
          barcodes,
        }
      })
      setNewBarcode('')
      reloadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add barcode')
    } finally {
      setAddingBarcode(false)
    }
  }

  const handleRemoveBarcode = async (barcodeId: string) => {
    if (!editingId) return

    try {
      await products.removeBarcode(editingId, barcodeId)
      setEditingProduct((current) => {
        if (!current?.barcodes) return current
        const barcodes = current.barcodes.filter((barcode) => barcode.id !== barcodeId)
        return {
          ...current,
          barcode: barcodes[0]?.barcode ?? null,
          barcodes,
        }
      })
      reloadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove barcode')
    }
  }

  if (listState.isInitialLoading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <ProductsHeader showForm={showForm} onAdd={handleAddNew} />

      {!showForm && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex-1">
            <ProductCategoryFilter
              showForm={showForm}
              categoryList={categoryList}
              filterCategory={filterCategory}
              onChange={handleCategoryChange}
            />
          </div>
          <select
            aria-label="Product sort"
            value={sort}
            onChange={(event) => handleSortChange(event.target.value as ProductSort)}
            className="input flex-1"
          >
            <option value="name">Name</option>
            <option value="createdAt">Recently added</option>
          </select>
          <button
            type="button"
            aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
            onClick={handleDirectionChange}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {direction === 'asc' ? 'A–Z' : 'Z–A'}
          </button>
        </div>
      )}

      {error && (
        <div className="alert-danger">{error}</div>
      )}

      {showForm && (
        <div ref={formRef}>
          <ProductForm
            key={editingId ?? 'new'}
            editingId={editingId}
            editingProduct={editingProduct}
            formData={formData}
            setFormData={setFormData}
            categoryList={categoryList}
            saving={saving}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            newBarcode={newBarcode}
            onNewBarcodeChange={setNewBarcode}
            addingBarcode={addingBarcode}
            onAddBarcode={handleAddBarcode}
            onRemoveBarcode={handleRemoveBarcode}
            allSuppliers={allSuppliers}
            selectedSupplierIds={selectedSupplierIds}
            onSupplierToggle={handleSupplierToggle}
          />
        </div>
      )}

      <ProductsList
        productList={productList}
        categoryList={categoryList}
        pagination={pagination}
        isUpdating={listState.isUpdating}
        listError={listState.error}
        onRetry={listState.retry}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        emptyMessage={debouncedSearch.trim() ? `No products match "${debouncedSearch}"` : undefined}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  )
}
