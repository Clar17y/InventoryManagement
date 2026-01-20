import { useState, useEffect } from 'react'
import { products, categories, Product, Category } from '../../../lib/api'
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

  // Barcode management state
  const [newBarcode, setNewBarcode] = useState('')
  const [addingBarcode, setAddingBarcode] = useState(false)

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
        categoryId: formData.categoryId,
        unit: formData.unit,
        lowStockThreshold: formData.lowStockThreshold,
      }

      if (editingId) {
        await products.update(editingId, data)
      } else {
        await products.create(data)
      }
      setShowForm(false)
      setEditingId(null)
      setEditingProduct(null)
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
      categoryId: product.categoryId,
      unit: product.unit,
      lowStockThreshold: product.lowStockThreshold,
    })
    setEditingId(product.id)
    setEditingProduct(product)
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
    setEditingProduct(null)
    setFormData(emptyForm)
    setNewBarcode('')
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

      <ProductCategoryFilter
        showForm={showForm}
        categoryList={categoryList}
        filterCategory={filterCategory}
        onChange={setFilterCategory}
      />

      {error && (
        <div className="alert-danger">{error}</div>
      )}

      {showForm && (
        <ProductForm
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
        />
      )}

      <ProductsList
        productList={productList}
        categoryList={categoryList}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  )
}
