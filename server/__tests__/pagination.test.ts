import { describe, expect, it } from 'vitest'
import {
  paginationQuerySchema,
  paginatedResponseSchema,
  queryBooleanSchema,
} from '#contracts/http/pagination'
import { z } from 'zod'
import { buildPaginationMeta, toPrismaPagination } from '../lib/pagination'

describe('pagination contract', () => {
  it('defaults to page 1 with 25 rows', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 })
  })

  it.each([25, 50, 100])('accepts page size %s', (pageSize) => {
    expect(paginationQuerySchema.parse({ page: '2', pageSize: String(pageSize) }))
      .toEqual({ page: 2, pageSize })
  })

  it.each(['0', '-1', '26', '101'])('rejects page size %s', (pageSize) => {
    expect(() => paginationQuerySchema.parse({ pageSize })).toThrow()
  })

  it('parses explicit query booleans without treating "false" as true', () => {
    expect(queryBooleanSchema.parse('true')).toBe(true)
    expect(queryBooleanSchema.parse('false')).toBe(false)
    expect(queryBooleanSchema.parse(false)).toBe(false)
  })

  it('builds skip/take and a zero-safe response envelope', () => {
    expect(toPrismaPagination({ page: 3, pageSize: 25 })).toEqual({ skip: 50, take: 25 })
    expect(buildPaginationMeta({ page: 3, pageSize: 25 }, 51)).toEqual({
      page: 3, pageSize: 25, totalItems: 51, totalPages: 3,
    })
    expect(buildPaginationMeta({ page: 1, pageSize: 25 }, 0).totalPages).toBe(0)
    expect(paginatedResponseSchema(z.string()).parse({
      items: ['a'],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    }).items).toEqual(['a'])
  })
})
