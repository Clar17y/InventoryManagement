import { useCallback, useMemo, useState } from 'react'
import type { PageSize, PaginationMeta } from '#contracts/http/pagination'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePaginatedList } from '../../../hooks/usePaginatedList'
import { hampers } from '../../../lib/api'

const emptyPagination = (page: number, pageSize: PageSize): PaginationMeta => ({
  page,
  pageSize,
  totalItems: 0,
  totalPages: 0,
})

export function useHamperSearch(initialSearch = '') {
  const [search, setRawSearch] = useState(initialSearch)
  const [page, setPage] = useState(1)
  const [pageSize, setRawPageSize] = useState<PageSize>(25)
  const debouncedSearch = useDebounce(search, 400)

  const setSearch = useCallback((value: string) => {
    setRawSearch(value)
    setPage(1)
  }, [])
  const setPageSize = useCallback((value: PageSize) => {
    setRawPageSize(value)
    setPage(1)
  }, [])
  const params = useMemo(() => ({
    page,
    pageSize,
    search: debouncedSearch.trim() || undefined,
    hideEtsyHidden: false,
    sort: 'name-asc' as const,
  }), [debouncedSearch, page, pageSize])
  const result = usePaginatedList({
    queryKey: JSON.stringify(params),
    load: (signal) => hampers.list(params, { signal }),
  })

  return {
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    items: result.data?.items ?? [],
    pagination: result.data?.pagination ?? emptyPagination(page, pageSize),
    isInitialLoading: result.isInitialLoading,
    isUpdating: result.isUpdating,
    error: result.error,
    retry: result.retry,
  }
}
