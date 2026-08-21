import { useEffect, useId, useState } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import PaginationControls from '../../../components/ui/PaginationControls'
import type { Hamper } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
import { useHamperSearch } from '../hooks/useHamperSearch'

function HamperLookupPopover({
  id,
  search,
  onChange,
  onClose,
}: {
  id: string
  search: string
  onChange: (hamper: Hamper) => void
  onClose: () => void
}) {
  const { setSearch, ...results } = useHamperSearch(search)

  useEffect(() => {
    setSearch(search)
  }, [search, setSearch])

  return (
    <div
      id={id}
      role="dialog"
      aria-label="Hamper results"
      className="absolute left-0 right-0 z-20 mt-1 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
    >
      {results.isInitialLoading ? (
        <p className="py-6 text-center text-sm text-gray-500">Loading Hampers...</p>
      ) : results.error ? (
        <div className="space-y-2 py-4 text-center text-sm text-red-600">
          <p>{results.error}</p>
          <button type="button" onClick={results.retry} className="btn-secondary text-sm">Retry</button>
        </div>
      ) : results.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No Hampers found</p>
      ) : (
        <div className="space-y-1" aria-busy={results.isUpdating}>
          {results.isUpdating && <p className="px-2 text-xs text-gray-500">Updating Hampers...</p>}
          {results.items.map((hamper) => (
            <button
              key={hamper.id}
              type="button"
              aria-label={`Select ${hamper.name}`}
              onClick={() => {
                onChange(hamper)
                onClose()
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
            >
              <span className="block font-medium text-gray-900">{hamper.name}</span>
              <span className="block text-xs text-gray-500">
                {formatCurrency(hamper.sellingPrice)} · {hamper.hasVariants ? 'Has variants' : `Can make: ${hamper.canMake}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {!results.isInitialLoading && !results.error && (
        <PaginationControls
          {...results.pagination}
          loading={results.isUpdating}
          onPageChange={results.setPage}
          onPageSizeChange={results.setPageSize}
        />
      )}
    </div>
  )
}

export default function HamperLookupField({
  value,
  onChange,
}: {
  value: Hamper | null
  onChange: (hamper: Hamper) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const popoverId = useId()

  return (
    <div
      className="relative flex-1 space-y-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false)
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
          aria-label="Search hampers"
          placeholder="Search Hampers..."
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
          className="input w-full pl-9"
        />
      </div>
      {isOpen && (
        <HamperLookupPopover
          id={popoverId}
          search={search}
          onChange={onChange}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
