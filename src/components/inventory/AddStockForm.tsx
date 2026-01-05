import { useState, useEffect } from 'react'
import { products, inventory, type Product } from '../../lib/api'
import BarcodeScanner from '../scanner/BarcodeScanner'

interface AddStockFormProps {
    onSuccess?: () => void
    onClose?: () => void
}

type FormMode = 'select' | 'scan' | 'form'

export default function AddStockForm({ onSuccess, onClose }: AddStockFormProps) {
    const [mode, setMode] = useState<FormMode>('select')
    const [allProducts, setAllProducts] = useState<Product[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [quantity, setQuantity] = useState('')
    const [unitCost, setUnitCost] = useState('')
    const [expiresAt, setExpiresAt] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [scanError, setScanError] = useState<string | null>(null)

    useEffect(() => {
        loadProducts()
    }, [])

    const loadProducts = async () => {
        setIsLoading(true)
        try {
            const data = await products.list()
            setAllProducts(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load products')
        } finally {
            setIsLoading(false)
        }
    }

    const handleBarcodeScan = async (barcode: string) => {
        setMode('form')
        setScanError(null)
        try {
            const product = await products.getByBarcode(barcode)
            setSelectedProduct(product)
            if (product.currentCost) {
                setUnitCost(String(product.currentCost))
            }
        } catch {
            setScanError(`No product found for barcode: ${barcode}`)
            setSelectedProduct(null)
        }
    }

    const handleProductSelect = (product: Product) => {
        setSelectedProduct(product)
        if (product.currentCost) {
            setUnitCost(String(product.currentCost))
        }
        setMode('form')
        setSearchQuery('')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedProduct) return

        setIsSubmitting(true)
        setError(null)

        try {
            await inventory.addLot({
                productId: selectedProduct.id,
                quantity: parseFloat(quantity),
                unitCost: parseFloat(unitCost),
                expiresAt: expiresAt || undefined,
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
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
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
                        {mode === 'select' ? 'Add Stock' : mode === 'form' ? 'Enter Details' : 'Add Stock'}
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Unit Cost (£)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={unitCost}
                                    onChange={(e) => setUnitCost(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="e.g., 1.50"
                                />
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
                                disabled={!selectedProduct || !quantity || !unitCost || isSubmitting}
                                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Adding...' : 'Add Stock'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
