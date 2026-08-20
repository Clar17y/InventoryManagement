import type { PageSize, PaginationMeta } from '#contracts/http/pagination'
import { PAGE_SIZES } from '#contracts/http/pagination'
import { getVisiblePages, getVisibleRange, normalizePage } from '../../lib/pagination'

interface PaginationControlsProps extends PaginationMeta {
  loading: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
}

export default function PaginationControls({
  page,
  pageSize,
  totalItems,
  totalPages,
  loading,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const currentPage = normalizePage(page, totalPages)
  const range = getVisibleRange({ page, pageSize, totalItems, totalPages })
  const visiblePages = getVisiblePages(currentPage, totalPages)

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 py-4">
      <p className="text-sm text-gray-600">
        Showing {range.start}–{range.end} of {totalItems}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={loading || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>

        {visiblePages.map((visiblePage, index) =>
          visiblePage === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} aria-hidden="true" className="px-2 text-gray-500">
              …
            </span>
          ) : (
            <button
              key={visiblePage}
              type="button"
              aria-current={visiblePage === currentPage ? 'page' : undefined}
              disabled={loading}
              onClick={() => onPageChange(visiblePage)}
              className="min-w-9 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 aria-[current=page]:border-primary-600 aria-[current=page]:bg-primary-600 aria-[current=page]:text-white"
            >
              {visiblePage}
            </button>
          ),
        )}

        <button
          type="button"
          aria-label="Next page"
          disabled={loading || totalPages === 0 || currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <span>Rows per page</span>
        <select
          aria-label="Rows per page"
          value={pageSize}
          disabled={loading}
          onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)}
          className="rounded border border-gray-300 bg-white px-2 py-1.5"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </nav>
  )
}

export type { PaginationControlsProps }
