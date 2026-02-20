import { useState, useEffect } from 'react'
import { suppliers, type Supplier, type SupplierLowStockItem } from '../../../lib/api'

export default function ShoppingListPage() {
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [lowStockItems, setLowStockItems] = useState<SupplierLowStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    suppliers.list()
      .then((data) => {
        setAllSuppliers(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load suppliers')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedSupplierId) {
      setLowStockItems([])
      return
    }
    setLoadingItems(true)
    suppliers.lowStock(selectedSupplierId)
      .then((data) => {
        setLowStockItems(data)
        setLoadingItems(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load shopping list')
        setLowStockItems([])
        setLoadingItems(false)
      })
  }, [selectedSupplierId])

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Shopping List</h2>
      <p className="text-sm text-gray-500">
        Select a shop to see which products are low on stock and need restocking.
      </p>

      {error && <div className="alert-danger">{error}</div>}

      <select
        value={selectedSupplierId}
        onChange={(e) => setSelectedSupplierId(e.target.value)}
        className="input"
      >
        <option value="">Select a shop...</option>
        {allSuppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {selectedSupplierId && (
        loadingItems ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : lowStockItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-1">No low stock items</p>
            <p className="text-sm">All products from this shop are well stocked!</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-gray-500 font-medium">
              {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need restocking
            </div>
            {lowStockItems.map((item) => (
              <div key={item.id} className="card flex justify-between items-center">
                <div>
                  <div className="font-medium">{item.name}</div>
                  {item.categoryName && (
                    <div className="text-xs text-gray-500">{item.categoryName}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-red-600 font-semibold">
                    {item.totalStock} {item.unit}
                  </div>
                  <div className="text-xs text-gray-500">
                    threshold: {item.lowStockThreshold}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
