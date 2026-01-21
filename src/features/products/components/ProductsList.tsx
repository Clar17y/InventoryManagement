import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatUnitCost } from '../../../lib/formatting'
import type { Category, Product } from '../../../lib/api'

interface ProductsListProps {
  productList: Product[]
  categoryList: Category[]
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export default function ProductsList({ productList, categoryList, onEdit, onDelete }: ProductsListProps) {
  if (productList.length === 0) {
    return (
      <div className="card text-gray-500 text-center py-8">
        <p className="mb-2">No products yet</p>
        <p className="text-sm">
          {categoryList.length === 0
            ? 'Create categories first, then add products'
            : 'Add products that go into your hampers'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {productList.map((product) => (
        <div key={product.id} className="card flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{product.name}</div>
            <div className="text-sm text-gray-500">
              {product.category?.name || 'Unknown category'}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400 mt-1">
              {product.unit === 'units' ? (
                <span>Stock: {product.totalStock ?? 0} {product.unit}</span>
              ) : (
                <span>
                  {product.lotCount ?? 0} lot{(product.lotCount ?? 0) !== 1 ? 's' : ''}
                  ({product.totalRemaining ?? 0} {product.unit} total)
                </span>
              )}
              {product.currentCost !== null && product.currentCost !== undefined && (
                <span>Cost: {formatUnitCost(product.currentCost, product.unit)}</span>
              )}
              {product.barcodes && product.barcodes.length > 0 && (
                <span className="font-mono">
                  {product.barcodes.length === 1
                    ? `#${product.barcodes[0]?.barcode ?? ''}`
                    : `${product.barcodes.length} barcodes`
                  }
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 ml-2">
            <button
              type="button"
              onClick={() => onEdit(product)}
              className="p-2 text-gray-500 hover:text-primary-600"
              aria-label={`Edit product ${product.name}`}
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(product.id)}
              className="p-2 text-gray-500 hover:text-red-600"
              aria-label={`Delete product ${product.name}`}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

