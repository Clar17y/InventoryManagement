import { describe, expect, it } from 'vitest'
import { buildSalesWhereClause, londonDayStart } from '../../lib/sales/filters'

describe('sales date filters', () => {
  it('resolves London calendar-day starts across GMT and BST', () => {
    expect(londonDayStart('2026-02-10').toISOString()).toBe('2026-02-10T00:00:00.000Z')
    expect(londonDayStart('2026-07-10').toISOString()).toBe('2026-07-09T23:00:00.000Z')
  })

  it('uses an exclusive end bound across the spring DST transition', () => {
    expect(buildSalesWhereClause({ startDate: '2026-03-29', endDate: '2026-03-29' }).saleDate)
      .toEqual({
        gte: new Date('2026-03-29T00:00:00.000Z'),
        lt: new Date('2026-03-29T23:00:00.000Z'),
      })
  })

  it('uses an exclusive end bound across the autumn DST transition', () => {
    expect(buildSalesWhereClause({ startDate: '2026-10-25', endDate: '2026-10-25' }).saleDate)
      .toEqual({
        gte: new Date('2026-10-24T23:00:00.000Z'),
        lt: new Date('2026-10-26T00:00:00.000Z'),
      })
  })
})
