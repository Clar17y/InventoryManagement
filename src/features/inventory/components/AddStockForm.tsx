import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { categories, inventory, products, type Category, type Product } from '../../../lib/api'
import BarcodeScanner from '../../../components/scanner/BarcodeScanner'
import { useDebounce } from '../../../hooks/useDebounce'
import AddStockDetailsView from './AddStockDetailsView'
import AddStockLinkBarcodeView from './AddStockLinkBarcodeView'
import AddStockNewProductView from './AddStockNewProductView'
import AddStockSelectView from './AddStockSelectView'

interface AddStockFormProps {
  onSuccess?: () => void
  onClose?: () => void
}

type FormMode = 'select' | 'scan' | 'form' | 'newProduct' | 'linkBarcode'

export default function AddStockForm({ onSuccess, onClose }: AddStockFormProps) {
  const [mode, setMode] = useState<FormMode>('select')
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('')
  const [costValue, setCostValue] = useState('')
  const [costMode, setCostMode] = useState<'total' | 'unit'>('total')
  const [excludesVAT, setExcludesVAT] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // Handheld scanner input
  const [handheldBarcode, setHandheldBarcode] = useState('')
  const [isProcessingHandheld, setIsProcessingHandheld] = useState(false)
  const handheldInputRef = useRef<HTMLInputElement>(null)

  // New product creation state
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null)
  const [newProductName, setNewProductName] = useState('')
  const [newProductUnit, setNewProductUnit] = useState('units')
  const [newProductCategoryId, setNewProductCategoryId] = useState('')
  const [newProductLowStockThreshold, setNewProductLowStockThreshold] = useState(5)
  const [allCategories, setAllCategories] = useState<Category[]>([])

  // Inline category creation state
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCreatingCategoryLoading, setIsCreatingCategoryLoading] = useState(false)

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (mode !== 'select') return

    const timer = setTimeout(() => {
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      ) {
        return
      }
      handheldInputRef.current?.focus()
    }, 100)

    return () => clearTimeout(timer)
  }, [mode])

  const handleHandheldSubmit = async () => {
    const trimmed = handheldBarcode.trim()
    if (!trimmed || isProcessingHandheld) return

    setIsProcessingHandheld(true)

    if (navigator.vibrate) {
      navigator.vibrate(200)
    }

    try {
      await handleBarcodeScan(trimmed)
    } finally {
      setIsProcessingHandheld(false)
      setHandheldBarcode('')
    }
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [productsData, categoriesData] = await Promise.all([
        products.list({ page: 1, pageSize: 100 }),
        categories.list(),
      ])
      setAllProducts(productsData.items)
      setAllCategories(categoriesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBarcodeScan = async (barcode: string) => {
    setScanError(null)
    setScannedBarcode(barcode)
    try {
      const product = await products.getByBarcode(barcode)
      setSelectedProduct(product)
      setMode('form')
    } catch {
      setSelectedProduct(null)
      setNewProductName('')
      setNewProductUnit('units')
      setMode('newProduct')
    }
  }

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product)
    setMode('form')
    setSearchQuery('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return

    setIsSubmitting(true)
    setError(null)

    try {
      let expiresAtISO: string | undefined
      if (expiresAt) {
        expiresAtISO = new Date(expiresAt + 'T23:59:59.999Z').toISOString()
      }

      const qty = parseFloat(quantity)
      const cost = parseFloat(costValue)

      let calculatedUnitCost = costMode === 'total' ? cost / qty : cost

      if (excludesVAT) {
        calculatedUnitCost = calculatedUnitCost * 1.2
      }

      await inventory.addLot({
        productId: selectedProduct.id,
        quantity: qty,
        unitCost: calculatedUnitCost,
        expiresAt: expiresAtISO,
      })
      onSuccess?.()
      onClose?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add stock')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return

    setIsCreatingCategoryLoading(true)
    try {
      const newCat = await categories.create({ name: newCategoryName.trim() })
      setAllCategories((prev) => [...prev, newCat])
      setNewProductCategoryId(newCat.id)
      setIsCreatingCategory(false)
      setNewCategoryName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setIsCreatingCategoryLoading(false)
    }
  }

  const handleCreateProduct = async (e: FormEvent) => {
    e.preventDefault()
    if (!newProductName.trim() || !scannedBarcode || !newProductCategoryId) return

    setIsSubmitting(true)
    setError(null)

    try {
      const newProduct = await products.create({
        name: newProductName.trim(),
        unit: newProductUnit,
        barcode: scannedBarcode,
        categoryId: newProductCategoryId,
        lowStockThreshold: newProductLowStockThreshold,
      })
      setSelectedProduct(newProduct)
      setMode('form')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLinkBarcodeToProduct = async (product: Product) => {
    if (!scannedBarcode) return

    setIsSubmitting(true)
    setError(null)

    try {
      await products.addBarcode(product.id, scannedBarcode)

      const updatedProducts = await products.list({ page: 1, pageSize: 100 })
      setAllProducts(updatedProducts.items)

      const updatedProduct = updatedProducts.items.find((p) => p.id === product.id)
      if (updatedProduct) {
        setSelectedProduct(updatedProduct)
        setMode('form')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link barcode')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredProducts = allProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
  )

  if (mode === 'scan') {
    return (
      <BarcodeScanner
        onScan={handleBarcodeScan}
        onError={(err) => setScanError(err)}
        onClose={() => setMode('select')}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'select'
              ? 'Add Stock'
              : mode === 'form'
                ? 'Enter Details'
                : mode === 'newProduct'
                  ? 'New Product'
                  : 'Add Stock'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {/* Selection Mode */}
          {mode === 'select' && (
            <AddStockSelectView
              handheldInputRef={handheldInputRef}
              handheldBarcode={handheldBarcode}
              setHandheldBarcode={setHandheldBarcode}
              handleHandheldSubmit={handleHandheldSubmit}
              isProcessingHandheld={isProcessingHandheld}
              onUseCamera={() => setMode('scan')}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isLoading={isLoading}
              filteredProducts={filteredProducts}
              handleProductSelect={handleProductSelect}
            />
          )}

          {/* Form Mode */}
          {mode === 'form' && (
            <AddStockDetailsView
              scanError={scanError}
              onSearchForProductManually={() => {
                setScanError(null)
                setMode('select')
              }}
              selectedProduct={selectedProduct}
              onChangeProduct={() => {
                setSelectedProduct(null)
                setMode('select')
              }}
              onSelectProduct={() => setMode('select')}
              quantity={quantity}
              setQuantity={setQuantity}
              costMode={costMode}
              setCostMode={setCostMode}
              costValue={costValue}
              setCostValue={setCostValue}
              excludesVAT={excludesVAT}
              setExcludesVAT={setExcludesVAT}
              expiresAt={expiresAt}
              setExpiresAt={setExpiresAt}
              isSubmitting={isSubmitting}
              handleSubmit={handleSubmit}
            />
          )}

          {/* New Product Mode - when barcode not found */}
          {mode === 'newProduct' && (
            <AddStockNewProductView
              scannedBarcode={scannedBarcode}
              onLinkToExistingProduct={() => setMode('linkBarcode')}
              newProductName={newProductName}
              setNewProductName={setNewProductName}
              newProductCategoryId={newProductCategoryId}
              setNewProductCategoryId={setNewProductCategoryId}
              newProductUnit={newProductUnit}
              setNewProductUnit={setNewProductUnit}
              newProductLowStockThreshold={newProductLowStockThreshold}
              setNewProductLowStockThreshold={setNewProductLowStockThreshold}
              allCategories={allCategories}
              isCreatingCategory={isCreatingCategory}
              setIsCreatingCategory={setIsCreatingCategory}
              newCategoryName={newCategoryName}
              setNewCategoryName={setNewCategoryName}
              isCreatingCategoryLoading={isCreatingCategoryLoading}
              handleCreateCategory={handleCreateCategory}
              isSubmitting={isSubmitting}
              handleCreateProduct={handleCreateProduct}
              onCancel={() => setMode('select')}
            />
          )}

          {/* Link Barcode Mode - link scanned barcode to existing product */}
          {mode === 'linkBarcode' && (
            <AddStockLinkBarcodeView
              scannedBarcode={scannedBarcode}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isLoading={isLoading}
              filteredProducts={filteredProducts}
              isSubmitting={isSubmitting}
              handleLinkBarcodeToProduct={handleLinkBarcodeToProduct}
              onBack={() => {
                setSearchQuery('')
                setMode('newProduct')
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
