import { Prisma } from '@prisma/client'
import type { SalesSummaryResponse } from '#contracts/routes/sales'
import { prisma } from '../prisma'
import { NEEDS_VERIFICATION_STATUSES } from './filters'

type SummaryDecimal = Prisma.Decimal | number | null

type SummaryTotals = {
  _count: { _all: number }
  _sum: {
    grossRevenue: SummaryDecimal
    postageCharged: SummaryDecimal
    postageCost: SummaryDecimal
    etsyFees: SummaryDecimal
    totalCost: SummaryDecimal
    margin: SummaryDecimal
  }
}

type ChannelGroup = {
  saleChannel: string
  _count: { _all: number }
  _sum: {
    grossRevenue: SummaryDecimal
    etsyFees: SummaryDecimal
    margin: SummaryDecimal
  }
}

type LineGroup = {
  hamperId: string | null
  description: string | null
  unitPrice: Prisma.Decimal | number
  _sum: { quantity: number | null }
}

export type SalesSummaryMappingInput = {
  totals: SummaryTotals
  channels: ChannelGroup[]
  lineGroups: LineGroup[]
  hamperNames: ReadonlyMap<string, string>
  unverifiedEtsySales: number
}

const channelOrder = new Map<string, number>([
  ['etsy', 0],
  ['direct', 1],
  ['fair', 2],
])

function asNumber(value: SummaryDecimal): number {
  return Number(value ?? 0)
}

export function mapSalesSummary({
  totals,
  channels,
  lineGroups,
  hamperNames,
  unverifiedEtsySales,
}: SalesSummaryMappingInput): SalesSummaryResponse {
  const byChannel = channels
    .map((group) => ({
      channel: group.saleChannel as SalesSummaryResponse['byChannel'][number]['channel'],
      count: group._count._all,
      revenue: asNumber(group._sum.grossRevenue),
      fees: asNumber(group._sum.etsyFees),
      margin: asNumber(group._sum.margin),
    }))
    .sort((left, right) => (
      (channelOrder.get(left.channel) ?? Number.MAX_SAFE_INTEGER)
      - (channelOrder.get(right.channel) ?? Number.MAX_SAFE_INTEGER)
    ))

  const byHamper = new Map<string, { name: string; count: number; revenue: number }>()
  for (const group of lineGroups) {
    const count = group._sum.quantity ?? 0
    const revenue = Number(group.unitPrice) * count
    const key = group.hamperId
      ? `hamper:${group.hamperId}`
      : `bespoke:${group.description}`
    const name = group.hamperId
      ? hamperNames.get(group.hamperId) ?? group.description ?? 'Bespoke Item'
      : group.description ?? 'Bespoke Item'
    const existing = byHamper.get(key)
    if (existing) {
      existing.count += count
      existing.revenue += revenue
    } else {
      byHamper.set(key, { name, count, revenue })
    }
  }

  return {
    unverifiedEtsySales,
    totals: {
      salesCount: totals._count._all,
      totalRevenue: asNumber(totals._sum.grossRevenue),
      totalPostageCharged: asNumber(totals._sum.postageCharged),
      totalPostageCost: asNumber(totals._sum.postageCost),
      totalFees: asNumber(totals._sum.etsyFees),
      totalCost: asNumber(totals._sum.totalCost),
      totalMargin: asNumber(totals._sum.margin),
    },
    byChannel,
    byHamper: [...byHamper.values()].sort((left, right) => right.count - left.count),
  }
}

export async function getSalesSummary(where: Prisma.SaleWhereInput): Promise<SalesSummaryResponse> {
  const [totals, channels, lineGroups, unverifiedEtsySales] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        grossRevenue: true,
        postageCharged: true,
        postageCost: true,
        etsyFees: true,
        totalCost: true,
        margin: true,
      },
    }),
    prisma.sale.groupBy({
      by: ['saleChannel'],
      where,
      _count: { _all: true },
      _sum: { grossRevenue: true, etsyFees: true, margin: true },
    }),
    prisma.saleLine.groupBy({
      by: ['hamperId', 'description', 'unitPrice'],
      where: { sale: where },
      _sum: { quantity: true },
    }),
    prisma.sale.count({
      where: {
        AND: [
          where,
          { saleChannel: 'etsy' },
          { etsyFeeReconciliationStatus: { in: NEEDS_VERIFICATION_STATUSES } },
        ],
      },
    }),
  ])

  const hamperIds = [...new Set(lineGroups.flatMap((group) => (
    group.hamperId ? [group.hamperId] : []
  )))]
  const hampers = hamperIds.length > 0
    ? await prisma.hamper.findMany({
        where: { id: { in: hamperIds } },
        select: { id: true, name: true },
      })
    : []
  const hamperNames = new Map(hampers.map((hamper) => [hamper.id, hamper.name]))

  return mapSalesSummary({ totals, channels, lineGroups, hamperNames, unverifiedEtsySales })
}
