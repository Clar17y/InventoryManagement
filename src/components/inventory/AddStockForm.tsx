import { useState, useEffect } from 'react'
import { products, inventory, categories, type Product, type Category } from '../../lib/api'
import BarcodeScanner from '../scanner/BarcodeScanner'

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(handler)
        }
    }, [value, delay])

    return debouncedValue
}

interface AddStockFormProps {
    onSuccess?: () => void
    onClose?: () => void
}

type FormMode = 'select' | 'scan' | 'form' | 'newProduct'

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

    // New product creation state
    const [scannedBarcode, setScannedBarcode] = useState<string | null>(null)
    const [newProductName, setNewProductName] = useState('')
    const [newProductUnit, setNewProductUnit] = useState('units')
    const [newProductCategoryId, setNewProductCategoryId] = useState('')
    const [allCategories, setAllCategories] = useState<Category[]>([])

    // Inline category creation state
    const [isCreatingCategory, setIsCreatingCategory] = useState(false)
    const [newCategoryName, setNewCategoryName] = useState('')
    const [isCreatingCategoryLoading, setIsCreatingCategoryLoading] = useState(false)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setIsLoading(true)
        try {
            const [productsData, categoriesData] = await Promise.all([
                products.list(),
                categories.list()
            ])
            setAllProducts(productsData)
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
            // Don't auto-fill total cost from current cost - user should enter the actual purchase price
            setMode('form')
        } catch {
            // Product not found - allow user to create a new one
            setSelectedProduct(null)
            setNewProductName('')
            setNewProductUnit('units')
            setMode('newProduct')
        }
    }

    const handleProductSelect = (product: Product) => {
        setSelectedProduct(product)
        // Don't auto-fill total cost from current cost - user should enter the actual purchase price
        setMode('form')
        setSearchQuery('')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedProduct) return

        setIsSubmitting(true)
        setError(null)

        try {
            // Convert date to ISO datetime format if provided
            let expiresAtISO: string | undefined
            if (expiresAt) {
                // Add time to make it a valid ISO datetime string
                expiresAtISO = new Date(expiresAt + 'T23:59:59.999Z').toISOString()
            }

            const qty = parseFloat(quantity)
            const cost = parseFloat(costValue)

            // Calculate unit cost based on mode
            let calculatedUnitCost = costMode === 'total' ? cost / qty : cost

            // Add VAT if price excludes it (UK VAT = 20%)
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

    const filteredProducts = allProducts.filter(
        (p) =>
            p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            p.barcode?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    )

    // Scanner mode
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
                        {mode === 'select' ? 'Add Stock' : mode === 'form' ? 'Enter Details' : mode === 'newProduct' ? 'New Product' : 'Add Stock'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Selection Mode */}
                    {mode === 'select' && (
                        <div className="space-y-4">
                            {/* Scan button */}
                            <button
                                onClick={() => setMode('scan')}
                                className="w-full flex items-center justify-center gap-3 p-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2m0-8v8" />
                                    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
                                </svg>
                                Scan Barcode
                            </button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-200" />
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-white text-gray-500">or search manually</span>
                                </div>
                            </div>

                            {/* Search input */}
                            <div className="relative">
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search products..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            {/* Product list */}
                            {isLoading ? (
                                <div className="text-center py-8 text-gray-500">Loading products...</div>
                            ) : searchQuery && filteredProducts.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">No products found</div>
                            ) : searchQuery ? (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {filteredProducts.map((product) => (
                                        <button
                                            key={product.id}
                                            onClick={() => handleProductSelect(product)}
                                            className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left"
                                        >
                                            <div>
                                                <p className="font-medium text-gray-900">{product.name}</p>
                                                <p className="text-sm text-gray-500">
                                                    {product.category?.name} · {product.unit}
                                                    {product.barcode && ` · ${product.barcode}`}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-medium text-gray-700">
                                                    Stock: {product.totalStock ?? 0}
                                                </p>
                                                {product.currentCost && (
                                                    <p className="text-xs text-gray-500">
                                                        £{Number(product.currentCost).toFixed(2)}
                                                    </p>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-gray-500 text-sm py-4">
                                    Start typing to search for a product
                                </p>
                            )}
                        </div>
                    )}

                    {/* Form Mode */}
                    {mode === 'form' && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {scanError && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                                    {scanError}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setScanError(null)
                                            setMode('select')
                                        }}
                                        className="block mt-2 text-amber-800 font-medium underline"
                                    >
                                        Search for product manually
                                    </button>
                                </div>
                            )}

                            {selectedProduct ? (
                                <div className="p-4 bg-indigo-50 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-indigo-900">{selectedProduct.name}</p>
                                            <p className="text-sm text-indigo-700">
                                                {selectedProduct.category?.name} · {selectedProduct.unit}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedProduct(null)
                                                setMode('select')
                                            }}
                                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                                        >
                                            Change
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-gray-50 rounded-xl text-center">
                                    <p className="text-gray-500">No product selected</p>
                                    <button
                                        type="button"
                                        onClick={() => setMode('select')}
                                        className="mt-2 text-indigo-600 font-medium"
                                    >
                                        Select product
                                    </button>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Quantity ({selectedProduct?.unit || 'units'})
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    min="0.001"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="e.g., 10"
                                />
                            </div>

                            <div>
                                {/* Cost Mode Toggle */}
                                <div className="flex rounded-lg bg-gray-100 p-1 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => setCostMode('total')}
                                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${costMode === 'total'
                                            ? 'bg-white text-indigo-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                    >
                                        Total Cost
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCostMode('unit')}
                                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${costMode === 'unit'
                                            ? 'bg-white text-indigo-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                    >
                                        Unit Cost
                                    </button>
                                </div>

                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {costMode === 'total' ? 'Total Cost (£)' : `Cost per ${selectedProduct?.unit || 'unit'} (£)`}
                                </label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    value={costValue}
                                    onChange={(e) => setCostValue(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder={costMode === 'total' ? 'e.g., 25.00' : 'e.g., 0.125'}
                                />

                                {/* VAT Checkbox */}
                                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={excludesVAT}
                                        onChange={(e) => setExcludesVAT(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-gray-600">
                                        Price excludes VAT <span className="text-gray-400">(+20%)</span>
                                    </span>
                                </label>

                                {/* Calculated Cost Display */}
                                {quantity && costValue && parseFloat(quantity) > 0 && (
                                    <div className="mt-3 p-3 bg-indigo-50 rounded-lg">
                                        <p className="text-sm text-indigo-700">
                                            <span className="font-medium">Per {selectedProduct?.unit || 'unit'}:</span>{' '}
                                            £{(() => {
                                                const qty = parseFloat(quantity)
                                                const cost = parseFloat(costValue)
                                                let unitCost = costMode === 'total' ? cost / qty : cost
                                                if (excludesVAT) unitCost *= 1.2
                                                return unitCost.toFixed(4)
                                            })()}
                                            {excludesVAT && <span className="text-indigo-500"> (inc. VAT)</span>}
                                        </p>
                                        {costMode === 'unit' && (
                                            <p className="text-sm text-indigo-600 mt-1">
                                                <span className="font-medium">Total:</span>{' '}
                                                £{(() => {
                                                    const qty = parseFloat(quantity)
                                                    const cost = parseFloat(costValue)
                                                    let total = cost * qty
                                                    if (excludesVAT) total *= 1.2
                                                    return total.toFixed(2)
                                                })()}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Expiry Date (optional)
                                </label>
                                <input
                                    type="date"
                                    value={expiresAt}
                                    onChange={(e) => setExpiresAt(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={!selectedProduct || !quantity || !costValue || isSubmitting}
                                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Adding...' : 'Add Stock'}
                            </button>
                        </form>
                    )}

                    {/* New Product Mode - when barcode not found */}
                    {mode === 'newProduct' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                <p className="text-amber-800 font-medium mb-1">New Barcode Detected</p>
                                <p className="text-amber-700 text-sm">
                                    No product found for barcode: <span className="font-mono font-bold">{scannedBarcode}</span>
                                </p>
                                <p className="text-amber-600 text-xs mt-2">
                                    Create a new product with this barcode below.
                                </p>
                            </div>

                            <form
                                onSubmit={async (e) => {
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
                                        })
                                        setSelectedProduct(newProduct)
                                        setMode('form')
                                    } catch (err) {
                                        setError(err instanceof Error ? err.message : 'Failed to create product')
                                    } finally {
                                        setIsSubmitting(false)
                                    }
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Product Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={newProductName}
                                        onChange={(e) => setNewProductName(e.target.value)}
                                        required
                                        autoFocus
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="e.g., Organic Milk 1L"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Category *
                                    </label>
                                    {isCreatingCategory ? (
                                        <div className="space-y-2">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newCategoryName}
                                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                                    placeholder="New category name..."
                                                    autoFocus
                                                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={!newCategoryName.trim() || isCreatingCategoryLoading}
                                                    onClick={async () => {
                                                        if (!newCategoryName.trim()) return
                                                        setIsCreatingCategoryLoading(true)
                                                        try {
                                                            const newCat = await categories.create({ name: newCategoryName.trim() })
                                                            setAllCategories(prev => [...prev, newCat])
                                                            setNewProductCategoryId(newCat.id)
                                                            setIsCreatingCategory(false)
                                                            setNewCategoryName('')
                                                        } catch (err) {
                                                            setError(err instanceof Error ? err.message : 'Failed to create category')
                                                        } finally {
                                                            setIsCreatingCategoryLoading(false)
                                                        }
                                                    }}
                                                    className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isCreatingCategoryLoading ? '...' : 'Add'}
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsCreatingCategory(false)
                                                    setNewCategoryName('')
                                                }}
                                                className="text-sm text-gray-500 hover:text-gray-700"
                                            >
                                                ← Back to category list
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <select
                                                value={newProductCategoryId}
                                                onChange={(e) => setNewProductCategoryId(e.target.value)}
                                                required
                                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            >
                                                <option value="">Select a category...</option>
                                                {allCategories.map((cat) => (
                                                    <option key={cat.id} value={cat.id}>
                                                        {cat.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => setIsCreatingCategory(true)}
                                                className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                                            >
                                                + Create new category
                                            </button>
                                        </>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Unit of Measure
                                    </label>
                                    <select
                                        value={newProductUnit}
                                        onChange={(e) => setNewProductUnit(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        <option value="units">Units</option>
                                        <option value="kg">Kilograms (kg)</option>
                                        <option value="g">Grams (g)</option>
                                        <option value="L">Litres (L)</option>
                                        <option value="ml">Millilitres (ml)</option>
                                        <option value="packs">Packs</option>
                                        <option value="boxes">Boxes</option>
                                    </select>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setMode('select')}
                                        className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!newProductName.trim() || isSubmitting}
                                        className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? 'Creating...' : 'Create & Continue'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div >
        </div >
    )
}
