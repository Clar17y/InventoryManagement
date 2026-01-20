import { ShoppingBagIcon } from '@heroicons/react/24/outline'
import type { EtsyPendingOrder } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'

export default function EtsyPendingOrdersList({
  pendingOrders,
  selectedOrders,
  toggleOrderSelection,
  orderPostageCosts,
  updateOrderPostageCost,
  handleImportOrder,
  importingSelected,
  importingOrderId,
}: {
  pendingOrders: EtsyPendingOrder[]
  selectedOrders: Set<number>
  toggleOrderSelection: (receiptId: number) => void
  orderPostageCosts: Record<number, string>
  updateOrderPostageCost: (receiptId: number, value: string) => void
  handleImportOrder: (receiptId: number) => void
  importingSelected: boolean
  importingOrderId: number | null
}) {
  return (
    <div className="space-y-3">
      {pendingOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <ShoppingBagIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p className="mb-1">No pending orders</p>
          <p className="text-sm">New Etsy orders will appear here for import.</p>
        </div>
      ) : (
        pendingOrders.map((order) => (
          <div key={order.receiptId} className="border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div className="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedOrders.has(order.receiptId)}
                  onChange={() => toggleOrderSelection(order.receiptId)}
                  aria-label={`Select order ${order.receiptId}`}
                  className="mt-1 rounded border-gray-300"
                />
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">Order #{order.receiptId}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {order.buyerName} • {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">{formatCurrency(order.grandTotal)}</div>
                <div className="text-xs text-gray-500">Subtotal: {formatCurrency(order.subtotal)}</div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-1 border-t pt-2">
              {order.items.map((item, idx) => {
                const displayTitle = item.variantName ? `${item.title} - ${item.variantName}` : item.title
                return (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="truncate max-w-[200px]" title={displayTitle}>
                      {item.quantity}× {displayTitle}
                    </span>
                    <span className="text-gray-600">{formatCurrency(item.price)}</span>
                  </div>
                )
              })}
            </div>

            {/* Postage Cost Input */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 whitespace-nowrap">Actual postage cost:</label>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">£</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={orderPostageCosts[order.receiptId] || ''}
                  onChange={(e) => updateOrderPostageCost(order.receiptId, e.target.value)}
                  className="input w-24 text-sm py-1"
                  placeholder="0.00"
                />
              </div>
              <button
                onClick={() => handleImportOrder(order.receiptId)}
                disabled={importingSelected || importingOrderId === order.receiptId}
                className="btn-primary text-sm py-1 ml-auto"
              >
                {importingOrderId === order.receiptId ? 'Importing...' : 'Import as Sale'}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

