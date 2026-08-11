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

const MAX_SAFE_PENCE = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE_PENCE = BigInt(Number.MIN_SAFE_INTEGER)

function toSafePence(value: bigint, name: string): number {
  if (value < MIN_SAFE_PENCE || value > MAX_SAFE_PENCE) {
    throw new RangeError(`${name} exceeds the safe integer pence range`)
  }
  return Number(value)
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  return numerator < 0n && numerator % denominator !== 0n ? quotient - 1n : quotient
}

/** Calculate the exact fee delta and the resulting saved profit values. */
export function calculateFeeAdjustment(current: CurrentFees, nextFees: number): FeeAdjustment {
  assertIntegerPence(current.etsyFees, 'current.etsyFees')
  assertIntegerPence(current.netRevenue, 'current.netRevenue')
  assertIntegerPence(current.margin, 'current.margin')
  assertIntegerPence(nextFees, 'nextFees')

  const feeDeltaPence = BigInt(nextFees) - BigInt(current.etsyFees)
  const netRevenuePence = BigInt(current.netRevenue) - feeDeltaPence
  const marginPence = BigInt(current.margin) - feeDeltaPence
  return {
    feeDeltaPence: toSafePence(feeDeltaPence, 'feeDeltaPence'),
    etsyFeesPence: nextFees,
    netRevenuePence: toSafePence(netRevenuePence, 'netRevenuePence'),
    marginPence: toSafePence(marginPence, 'marginPence'),
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

  if (new Set(sales.map((sale) => sale.id)).size !== sales.length) {
    throw new RangeError('unique sale ID values are required; duplicate supplied')
  }

  const ordered = [...sales].sort(compareIds)
  if (ordered.length === 0) return new Map()

  for (const sale of ordered) {
    assertIntegerPence(sale.grossRevenuePence, `grossRevenuePence for ${sale.id}`)
  }

  const positiveWeights = ordered.map((sale) => {
    const weight = BigInt(sale.grossRevenuePence)
    return weight > 0n ? weight : 0n
  })
  const positiveWeightTotal = positiveWeights.reduce((sum, weight) => sum + weight, 0n)
  const hasPositiveWeight = positiveWeightTotal > 0n
  const weights = hasPositiveWeight ? positiveWeights : ordered.map(() => 1n)
  const denominator = hasPositiveWeight ? positiveWeightTotal : BigInt(ordered.length)
  const total = BigInt(totalPence)

  const allocations = ordered.map((sale, index) => {
    const numerator = total * weights[index]!
    const base = floorDivide(numerator, denominator)
    return {
      id: sale.id,
      base,
      // Keeping the fractional remainder as an integer avoids floating-point
      // tie differences when one penny must be assigned.
      remainderNumerator: numerator - base * denominator,
    }
  })

  let remainder = total - allocations.reduce((sum, allocation) => sum + allocation.base, 0n)
  const byLargestRemainder = [...allocations].sort((a, b) => {
    if (a.remainderNumerator !== b.remainderNumerator) {
      return b.remainderNumerator > a.remainderNumerator ? 1 : -1
    }
    return compareIds(a, b)
  })

  for (let index = 0; remainder > 0n; index = (index + 1) % byLargestRemainder.length) {
    byLargestRemainder[index]!.base += 1n
    remainder -= 1n
  }

  for (let index = 0; remainder < 0n; index = (index + 1) % byLargestRemainder.length) {
    byLargestRemainder[index]!.base -= 1n
    remainder += 1n
  }

  return new Map(allocations.map((allocation) => [
    allocation.id,
    toSafePence(allocation.base, `allocation for sale ${allocation.id}`),
  ]))
}

// Keep the proposal type reachable from the calculation module for callers
// that import the fee primitives from one place.
export type { SaleFeeProposal }
