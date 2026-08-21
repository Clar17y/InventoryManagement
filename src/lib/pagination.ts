import type { PaginationMeta } from '#contracts/http/pagination'

export type VisiblePage = number | 'ellipsis'

export function normalizePage(page: number, totalPages: number): number {
  if (totalPages <= 0 || !Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.trunc(page), 1), totalPages)
}

export function getVisiblePages(page: number, totalPages: number): VisiblePage[] {
  if (totalPages <= 0) return []
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const currentPage = normalizePage(page, totalPages)
  let start = currentPage - 2
  let end = currentPage + 2

  if (start < 2) {
    end += 2 - start
    start = 2
  }
  if (end > totalPages - 1) {
    start -= end - (totalPages - 1)
    end = totalPages - 1
  }

  start = Math.max(start, 2)
  end = Math.min(end, totalPages - 1)

  const pages: number[] = [1]
  for (let value = start; value <= end; value += 1) {
    pages.push(value)
  }
  pages.push(totalPages)

  const visiblePages: VisiblePage[] = [pages[0]!]
  for (let index = 1; index < pages.length; index += 1) {
    const previousPage = pages[index - 1]!
    const current = pages[index]!
    const gap = current - previousPage

    if (gap === 2) {
      visiblePages.push(previousPage + 1)
    } else if (gap > 2) {
      visiblePages.push('ellipsis')
    }
    visiblePages.push(current)
  }

  return visiblePages
}

export function getVisibleRange(meta: PaginationMeta): { start: number; end: number } {
  if (meta.totalItems === 0) return { start: 0, end: 0 }

  const currentPage = normalizePage(meta.page, meta.totalPages)

  return {
    start: (currentPage - 1) * meta.pageSize + 1,
    end: Math.min(currentPage * meta.pageSize, meta.totalItems),
  }
}
