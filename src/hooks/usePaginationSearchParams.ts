import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  paginationQuerySchema,
  type PageSize,
} from '#contracts/http/pagination'

export function usePaginationSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsed = paginationQuerySchema.safeParse(Object.fromEntries(searchParams))
  const { page, pageSize } = parsed.success ? parsed.data : { page: 1, pageSize: 25 as const }

  const update = useCallback((nextPage: number, nextSize: PageSize) => {
    if (nextPage === page && nextSize === pageSize) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('page', String(nextPage))
      next.set('pageSize', String(nextSize))
      return next
    })
  }, [page, pageSize, setSearchParams])

  const setPage = useCallback(
    (nextPage: number) => update(Math.max(1, nextPage), pageSize),
    [pageSize, update],
  )
  const setPageSize = useCallback((nextSize: PageSize) => update(1, nextSize), [update])
  const resetPage = useCallback(() => update(1, pageSize), [pageSize, update])

  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
  }
}

export type PaginationSearchParams = ReturnType<typeof usePaginationSearchParams>
