import { useEffect, useId, useState } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import PaginationControls from '../../../components/ui/PaginationControls'
import type { Product } from '../../../lib/api'
import { useProductSearch } from '../hooks/useProductSearch'

function ProductLookupPopover({
  search,
  categoryId,
  disabled,
  onChange,
  onClose,
  id,
}: {
  search: string
  categoryId?: string
  disabled: boolean
  onChange: (product: Product) => void
  onClose: () => void
  id: string
}) {
  const { setSearch, ...productSearch } = useProductSearch({ categoryId, initialSearch: search })

  useEffect(() => {
    setSearch(search)
  }, [search, setSearch])

  const handleChange = (product: Product) => {
    onChange(product)
    onClose()
  }

  return (
    <div
      id={id}
      role="dialog"
      aria-label="Product results"
      className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
    >
      {productSearch.isInitialLoading ? (
        <p className="py-6 text-center text-sm text-gray-500">Loading products...</p>
      ) : productSearch.error ? (
        <div className="space-y-2 py-4 text-center text-sm text-red-600">
          <p>{productSearch.error}</p>
          <button type="button" onClick={productSearch.retry} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      ) : productSearch.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No products found</p>
      ) : (
        <div className="space-y-1" aria-busy={productSearch.isUpdating}>
          {productSearch.isUpdating && <p className="px-2 text-xs text-gray-500">Updating products...</p>}
          {productSearch.items.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => handleChange(product)}
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

      {!productSearch.isInitialLoading && !productSearch.error && (
        <PaginationControls
          {...productSearch.pagination}
          loading={productSearch.isUpdating}
          onPageChange={productSearch.setPage}
          onPageSizeChange={productSearch.setPageSize}
        />
      )}
    </div>
  )
}

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
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const popoverId = useId()

  return (
    <div
      className="relative space-y-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false)
        }
      }}
    >
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
          value={search}
          aria-expanded={isOpen}
          aria-controls={isOpen ? popoverId : undefined}
          aria-haspopup="dialog"
          onFocus={() => setIsOpen(true)}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setIsOpen(false)
            }
          }}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        />
      </div>

      {isOpen && (
        <ProductLookupPopover
          id={popoverId}
          search={search}
          categoryId={categoryId}
          disabled={disabled}
          onChange={onChange}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
