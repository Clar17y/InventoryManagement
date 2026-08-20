import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import PaginationControls from '../../../components/ui/PaginationControls'
import type { Product } from '../../../lib/api'
import { useProductSearch } from '../hooks/useProductSearch'

export default function ProductLookupField({
  value,
  categoryId,
  onChange,
  disabled = false,
}: {
  value: Pick<Product, 'id' | 'name'> | null
  categoryId?: string
  onChange: (product: Product) => void
  disabled?: boolean
}) {
  const search = useProductSearch({ categoryId })

  return (
    <div className="space-y-2">
      {value && (
        <p className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-900">
          Selected: {value.name}
        </p>
      )}

      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          aria-label="Search products"
          placeholder="Search products..."
          value={search.search}
          onChange={(event) => search.setSearch(event.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        />
      </div>

      <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
        {search.isInitialLoading ? (
          <p className="py-6 text-center text-sm text-gray-500">Loading products...</p>
        ) : search.error ? (
          <div className="space-y-2 py-4 text-center text-sm text-red-600">
            <p>{search.error}</p>
            <button type="button" onClick={search.retry} className="btn-secondary text-sm">
              Retry
            </button>
          </div>
        ) : search.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No products found</p>
        ) : (
          <div className="space-y-1" aria-busy={search.isUpdating}>
            {search.isUpdating && <p className="px-2 text-xs text-gray-500">Updating products...</p>}
            {search.items.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onChange(product)}
                disabled={disabled}
                aria-label={`Select ${product.name}`}
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
              >
                <span className="block font-medium text-gray-900">{product.name}</span>
                <span className="block text-xs text-gray-500">
                  {product.category?.name ?? 'Uncategorized'} · {product.unit}
                </span>
              </button>
            ))}
          </div>
        )}

        {!search.isInitialLoading && !search.error && (
          <PaginationControls
            {...search.pagination}
            loading={search.isUpdating}
            onPageChange={search.setPage}
            onPageSizeChange={search.setPageSize}
          />
        )}
      </div>
    </div>
  )
}
