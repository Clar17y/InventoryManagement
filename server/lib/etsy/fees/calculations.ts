import type { SaleFeeProposal } from './types'

export interface FeeAdjustment {
  feeDeltaPence: number
  etsyFeesPence: number
  netRevenuePence: number
  marginPence: number
}

interface CurrentFees {
  etsyFees: number
  netRevenue: number
  margin: number
}

export interface WeightedSale {
  id: string
  grossRevenuePence: number
}

function assertIntegerPence(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be an integer number of pence`)
  }
}

/** Calculate the exact fee delta and the resulting saved profit values. */
export function calculateFeeAdjustment(current: CurrentFees, nextFees: number): FeeAdjustment {
  assertIntegerPence(current.etsyFees, 'current.etsyFees')
  assertIntegerPence(current.netRevenue, 'current.netRevenue')
  assertIntegerPence(current.margin, 'current.margin')
  assertIntegerPence(nextFees, 'nextFees')

  const feeDeltaPence = nextFees - current.etsyFees
  return {
    feeDeltaPence,
    etsyFeesPence: nextFees,
    netRevenuePence: current.netRevenue - feeDeltaPence,
    marginPence: current.margin - feeDeltaPence,
  }
}

function compareIds(a: { id: string }, b: { id: string }): number {
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/**
 * Allocate an order-level amount in whole pence using deterministic largest
 * remainder allocation. Non-positive revenue is ignored when a positive row
 * exists; if every row is non-positive, rows receive equal weights.
 */
export function allocateOrderPence(totalPence: number, sales: readonly WeightedSale[]): Map<string, number> {
  assertIntegerPence(totalPence, 'totalPence')

  const ordered = [...sales].sort(compareIds)
  if (ordered.length === 0) return new Map()

  for (const sale of ordered) {
    assertIntegerPence(sale.grossRevenuePence, `grossRevenuePence for ${sale.id}`)
  }

  const positiveWeights = ordered.map((sale) => Math.max(0, sale.grossRevenuePence))
  const positiveWeightTotal = positiveWeights.reduce((sum, weight) => sum + weight, 0)
  const hasPositiveWeight = positiveWeightTotal > 0
  const weights = hasPositiveWeight ? positiveWeights : ordered.map(() => 1)
  const denominator = hasPositiveWeight ? positiveWeightTotal : ordered.length

  const allocations = ordered.map((sale, index) => {
    const numerator = totalPence * weights[index]!
    const base = Math.floor(numerator / denominator)
    return {
      id: sale.id,
      base,
      // Keeping the fractional remainder as an integer avoids floating-point
      // tie differences when one penny must be assigned.
      remainderNumerator: numerator - base * denominator,
    }
  })

  let remainder = totalPence - allocations.reduce((sum, allocation) => sum + allocation.base, 0)
  const byLargestRemainder = [...allocations].sort((a, b) => {
    if (a.remainderNumerator !== b.remainderNumerator) {
      return b.remainderNumerator - a.remainderNumerator
    }
    return compareIds(a, b)
  })

  for (let index = 0; remainder > 0; index = (index + 1) % byLargestRemainder.length) {
    byLargestRemainder[index]!.base += 1
    remainder -= 1
  }

  for (let index = 0; remainder < 0; index = (index + 1) % byLargestRemainder.length) {
    byLargestRemainder[index]!.base -= 1
    remainder += 1
  }

  return new Map(allocations.map((allocation) => [allocation.id, allocation.base]))
}

// Keep the proposal type reachable from the calculation module for callers
// that import the fee primitives from one place.
export type { SaleFeeProposal }
