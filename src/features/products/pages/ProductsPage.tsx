import { useState, useEffect, useMemo } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { products, categories, suppliers, Product, Category, Supplier } from '../../../lib/api'
import { useDebounce } from '../../../hooks/useDebounce'
import { useScrollToForm } from '../../../hooks/useScrollToForm'
import ProductCategoryFilter from '../components/ProductCategoryFilter'
import ProductForm from '../components/ProductForm'
import ProductsHeader from '../components/ProductsHeader'
import ProductsList from '../components/ProductsList'
import { emptyForm } from '../constants'
import type { ProductFormData } from '../types'

export default function Products() {
  const [productList, setProductList] = useState<Product[]>([])
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<ProductFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Barcode management state
  const [newBarcode, setNewBarcode] = useState('')
  const [addingBarcode, setAddingBarcode] = useState(false)

  // Supplier state
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])

  const { formRef, scrollToForm } = useScrollToForm()

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

  useEffect(() => {
    suppliers.list().then(setAllSuppliers).catch((err) => console.error('Failed to load suppliers', err))
  }, [])

  const filteredProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return productList
    const query = debouncedSearch.toLowerCase()
    return productList.filter((p) =>
      p.name.toLowerCase().includes(query) ||
      p.category?.name?.toLowerCase().includes(query)
    )
  }, [productList, debouncedSearch])

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
        await loadData()
        setError('Product saved but supplier links failed. Edit the product to retry.')
        return
      }
      setShowForm(false)
      setEditingId(null)
      setEditingProduct(null)
      setFormData(emptyForm)
      setSelectedSupplierIds([])
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
      await loadData()
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
      await products.addBarcode(editingId, newBarcode.trim())
      setNewBarcode('')
      // Refresh the product to get updated barcodes
      const updatedProducts = await products.list(filterCategory || undefined)
      setProductList(updatedProducts)
      const updatedProduct = updatedProducts.find(p => p.id === editingId)
      if (updatedProduct) {
        setEditingProduct(updatedProduct)
      }
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
      // Refresh the product to get updated barcodes
      const updatedProducts = await products.list(filterCategory || undefined)
      setProductList(updatedProducts)
      const updatedProduct = updatedProducts.find(p => p.id === editingId)
      if (updatedProduct) {
        setEditingProduct(updatedProduct)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove barcode')
    }
  }

  if (loading && productList.length === 0) {
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
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
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
          <div className="flex-1">
            <ProductCategoryFilter
              showForm={showForm}
              categoryList={categoryList}
              filterCategory={filterCategory}
              onChange={setFilterCategory}
            />
          </div>
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

      {productList.length > 0 && filteredProducts.length === 0 ? (
        <div className="card text-gray-500 text-center py-8">
          <p className="mb-2">No products match "{debouncedSearch}"</p>
          <p className="text-sm">Try a different search term</p>
        </div>
      ) : (
        <ProductsList
          productList={filteredProducts}
          categoryList={categoryList}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
