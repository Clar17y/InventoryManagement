import type { Prisma, EtsyFeeReconciliationStatus } from '@prisma/client'
import type { SalesVerificationFilter } from '#contracts/routes/sales'
import { NEEDS_VERIFICATION_STATUSES as UNRESOLVED_STATUSES } from '#contracts/domain/etsyFees'

export const NEEDS_VERIFICATION_STATUSES: EtsyFeeReconciliationStatus[] = [...UNRESOLVED_STATUSES]

export function buildSalesWhereClause(query: {
  startDate?: unknown
  endDate?: unknown
  search?: unknown
  verificationStatus?: SalesVerificationFilter
}): Prisma.SaleWhereInput {
  const { startDate, endDate, search, verificationStatus } = query

  const where: Prisma.SaleWhereInput = {}

  if (startDate || endDate) {
    where.saleDate = {}
    if (startDate) where.saleDate.gte = new Date(startDate as string)
    if (endDate) {
      // Set to end of day for inclusive filtering
      const end = new Date(endDate as string)
      end.setHours(23, 59, 59, 999)
      where.saleDate.lte = end
    }
  }

  // Search across notes, etsyOrderId, and line hamper names/descriptions
  if (search && typeof search === 'string' && search.trim()) {
    const searchTerm = search.trim()
    where.OR = [
      { notes: { contains: searchTerm, mode: 'insensitive' } },
      { etsyOrderId: { contains: searchTerm, mode: 'insensitive' } },
      {
        lines: {
          some: {
            OR: [
              { description: { contains: searchTerm, mode: 'insensitive' } },
              { hamper: { name: { contains: searchTerm, mode: 'insensitive' } } },
            ],
          },
        },
      },
    ]
  }

  if (verificationStatus) {
    where.etsyFeeReconciliationStatus = verificationStatus === 'needs_verification'
      ? { in: NEEDS_VERIFICATION_STATUSES }
      : verificationStatus
  }

  return where
}

