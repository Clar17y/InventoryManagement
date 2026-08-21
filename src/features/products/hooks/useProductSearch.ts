import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PageSize, PaginationMeta } from '#contracts/http/pagination'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePaginatedList } from '../../../hooks/usePaginatedList'
import { products } from '../../../lib/api'

const emptyPagination = (page: number, pageSize: PageSize): PaginationMeta => ({
  page,
  pageSize,
  totalItems: 0,
  totalPages: 0,
})

export function useProductSearch({
  categoryId,
  initialSearch = '',
  pageSize: initialPageSize = 25,
}: {
  categoryId?: string
  initialSearch?: string
  pageSize?: PageSize
}) {
  const [search, setRawSearch] = useState(initialSearch)
  const [page, setPage] = useState(1)
  const [pageSize, setRawPageSize] = useState<PageSize>(initialPageSize)
  const debouncedSearch = useDebounce(search, 400)

  useEffect(() => {
    setPage(1)
  }, [categoryId])

  const setSearch = useCallback((nextSearch: string) => {
    setRawSearch(nextSearch)
    setPage(1)
  }, [])

  const setPageSize = useCallback((nextPageSize: PageSize) => {
    setRawPageSize(nextPageSize)
    setPage(1)
  }, [])

  const params = useMemo(() => ({
    categoryId,
    page,
    pageSize,
    search: debouncedSearch.trim() || undefined,
  }), [categoryId, debouncedSearch, page, pageSize])

  const queryKey = JSON.stringify(params)
  const result = usePaginatedList({
    queryKey,
    load: (signal) => products.list(params, { signal }),
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
