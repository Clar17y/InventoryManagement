import { useState, useEffect } from 'react'
import { products, type Product } from '../lib/api'
import AddStockForm from '../components/inventory/AddStockForm'

export default function Inventory() {
  const [showAddStock, setShowAddStock] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadProducts = async () => {
    setIsLoading(true)
    try {
      const data = await products.list()
      setAllProducts(data)
    } catch (err) {
      console.error('Failed to load products', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const handleStockAdded = () => {
    setShowAddStock(false)
    loadProducts()
  }

  // Group products by category
  const productsByCategory: Record<string, Product[]> = {}
  allProducts.forEach((p) => {
    const catName = p.category?.name || 'Uncategorized'
    if (!productsByCategory[catName]) {
      productsByCategory[catName] = []
    }
    productsByCategory[catName].push(p)
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Inventory</h2>
        <button
          onClick={() => setShowAddStock(true)}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Stock
        </button>
      </div>

      {isLoading ? (
        <div className="card text-gray-500 text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
          Loading inventory...
        </div>
      ) : allProducts.length === 0 ? (
        <div className="card text-gray-500 text-center py-12">
          <p className="mb-4">No products yet</p>
          <p className="text-sm">Add your first product to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(productsByCategory).map(([categoryName, categoryProducts]) => (
            <div key={categoryName} className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-3">{categoryName}</h3>
              <div className="divide-y divide-gray-100">
                {categoryProducts.map((product) => (
                  <div key={product.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">
                        {product.unit}
                        {product.barcode && ` · ${product.barcode}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${(product.totalStock ?? 0) <= 5
                          ? 'text-red-600'
                          : 'text-green-600'
                        }`}>
                        {product.totalStock ?? 0}
                      </p>
                      {product.currentCost && (
                        <p className="text-xs text-gray-500">
                          £{Number(product.currentCost).toFixed(2)} / {product.unit}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddStock && (
        <AddStockForm
          onSuccess={handleStockAdded}
          onClose={() => setShowAddStock(false)}
        />
      )}
    </div>
  )
}
