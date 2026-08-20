import { useSearchParams } from 'react-router-dom'
import {
  paginationQuerySchema,
  type PageSize,
} from '#contracts/http/pagination'

export function usePaginationSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsed = paginationQuerySchema.safeParse(Object.fromEntries(searchParams))
  const { page, pageSize } = parsed.success ? parsed.data : { page: 1, pageSize: 25 as const }

  const update = (nextPage: number, nextSize: PageSize) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('page', String(nextPage))
      next.set('pageSize', String(nextSize))
      return next
    })
  }

  return {
    page,
    pageSize,
    setPage: (nextPage: number) => update(Math.max(1, nextPage), pageSize),
    setPageSize: (nextSize: PageSize) => update(1, nextSize),
    resetPage: () => update(1, pageSize),
  }
}

export type PaginationSearchParams = ReturnType<typeof usePaginationSearchParams>
