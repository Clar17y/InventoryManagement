import { describe, expect, it } from 'vitest'
import type { PaginationMeta } from '#contracts/http/pagination'
import { getVisiblePages, getVisibleRange } from '../../lib/pagination'

describe('pagination helpers', () => {
  it('shows every page for a short result set', () => {
    expect(getVisiblePages(1, 3)).toEqual([1, 2, 3])
  })

  it('centres the current page and inserts ellipses for long result sets', () => {
    expect(getVisiblePages(6, 12)).toEqual([
      1,
      'ellipsis',
      4,
      5,
      6,
      7,
      8,
      'ellipsis',
      12,
    ])
  })

  it('calculates the visible range for a partially filled page', () => {
    const meta: PaginationMeta = {
      page: 2,
      pageSize: 25,
      totalItems: 42,
      totalPages: 2,
    }

    expect(getVisibleRange(meta)).toEqual({ start: 26, end: 42 })
  })

  it('returns an empty range when there are no results', () => {
    const meta: PaginationMeta = {
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 0,
    }

    expect(getVisibleRange(meta)).toEqual({ start: 0, end: 0 })
  })

  it('clamps an out-of-range page to the final page in the metadata', () => {
    expect(getVisibleRange({
      page: 999,
      pageSize: 25,
      totalItems: 42,
      totalPages: 2,
    })).toEqual({ start: 26, end: 42 })
  })
})
