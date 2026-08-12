import { describe, expect, it } from 'vitest'
import { calculateFeeAdjustment, allocateOrderPence } from '../../lib/etsy/fees/calculations'
import { groupSalesByReceipt } from '../../lib/etsy/fees/grouping'

describe('Etsy fee calculations', () => {
  it('subtracts the fee delta from saved net revenue and margin', () => {
    expect(calculateFeeAdjustment({ etsyFees: 400, netRevenue: 3600, margin: 2200 }, 976)).toEqual({
      feeDeltaPence: 576,
      etsyFeesPence: 976,
      netRevenuePence: 3024,
      marginPence: 1624,
    })
  })

  it('adds back a negative fee delta when the next fee total is lower', () => {
    expect(calculateFeeAdjustment({ etsyFees: 976, netRevenue: 3024, margin: 1624 }, 400)).toEqual({
      feeDeltaPence: -576,
      etsyFeesPence: 400,
      netRevenuePence: 3600,
      marginPence: 2200,
    })
  })

  it('rejects a fee delta whose exact integer result is outside safe pence', () => {
    const maxSafePence = Number.MAX_SAFE_INTEGER

    expect(() => calculateFeeAdjustment({
      etsyFees: maxSafePence,
      netRevenue: 0,
      margin: 0,
    }, -maxSafePence)).toThrow(RangeError)
  })

  it('rejects a net revenue result outside safe pence', () => {
    const maxSafePence = Number.MAX_SAFE_INTEGER

    expect(() => calculateFeeAdjustment({
      etsyFees: 2,
      netRevenue: maxSafePence,
      margin: 0,
    }, 1)).toThrow(RangeError)
  })

  it('allocates an order fee exactly across suffixed historical rows', () => {
    const result = allocateOrderPence(576, [
      { id: 'a', grossRevenuePence: 2999 },
      { id: 'b', grossRevenuePence: 1000 },
    ])

    expect(result).toEqual(new Map([['a', 432], ['b', 144]]))
    expect([...result.values()].reduce((sum, value) => sum + value, 0)).toBe(576)
  })

  it('ignores non-positive weights when at least one positive weight exists', () => {
    expect(allocateOrderPence(7, [
      { id: 'positive', grossRevenuePence: 3 },
      { id: 'zero', grossRevenuePence: 0 },
      { id: 'negative', grossRevenuePence: -2 },
    ])).toEqual(new Map([
      ['negative', 0],
      ['positive', 7],
      ['zero', 0],
    ]))
  })

  it('falls back to equal weights when every weight is non-positive', () => {
    expect(allocateOrderPence(5, [
      { id: 'b', grossRevenuePence: 0 },
      { id: 'a', grossRevenuePence: -1 },
    ])).toEqual(new Map([
      ['a', 3],
      ['b', 2],
    ]))
  })

  it('uses the sale ID to break equal largest-remainder ties', () => {
    const input = [
      { id: 'c', grossRevenuePence: 1 },
      { id: 'a', grossRevenuePence: 1 },
      { id: 'b', grossRevenuePence: 1 },
    ]

    expect(allocateOrderPence(1, input)).toEqual(new Map([
      ['a', 1],
      ['b', 0],
      ['c', 0],
    ]))
    expect(allocateOrderPence(1, [...input].reverse())).toEqual(allocateOrderPence(1, input))
  })

  it('allocates exactly when weight products and totals exceed safe intermediates', () => {
    const maxSafePence = Number.MAX_SAFE_INTEGER

    expect(allocateOrderPence(maxSafePence, [
      { id: 'a', grossRevenuePence: maxSafePence },
      { id: 'b', grossRevenuePence: 2 },
    ])).toEqual(new Map([
      ['a', 9007199254740989],
      ['b', 2],
    ]))
  })

  it('rejects duplicate sale IDs before allocating into a Map', () => {
    expect(() => allocateOrderPence(5, [
      { id: 'duplicate', grossRevenuePence: 1 },
      { id: 'duplicate', grossRevenuePence: 1 },
    ])).toThrow(/unique sale ID/i)
  })

  it('matches only an exact receipt or numeric historical suffix', () => {
    const saleSnapshots = [
      { id: 'unrelated-prefix', etsyOrderId: 'x-4137418052' },
      { id: 'suffix-text', etsyOrderId: '4137418052-foo' },
      { id: 'suffix-2-extra', etsyOrderId: '4137418052-2-extra' },
      { id: 'suffix-2', etsyOrderId: '4137418052-2' },
      { id: 'exact', etsyOrderId: '4137418052' },
      { id: 'other-order', etsyOrderId: '41374180520' },
      { id: 'no-order', etsyOrderId: null },
    ]

    expect(groupSalesByReceipt('4137418052', saleSnapshots).map((sale) => sale.id)).toEqual([
      'exact',
      'suffix-2',
    ])
  })
})
