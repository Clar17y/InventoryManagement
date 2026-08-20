import type { PaginationMeta, PaginationQuery } from '#contracts/http/pagination'

export function toPrismaPagination({ page, pageSize }: PaginationQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize }
}

export function buildPaginationMeta(
  { page, pageSize }: PaginationQuery,
  totalItems: number
): PaginationMeta {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  }
}
