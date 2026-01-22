import { PickRule, PrismaClient } from '@prisma/client'
import { prisma } from '../prisma'

// Type for Prisma client or transaction client
export type PrismaClientLike = PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export interface AllocationLine {
  lotId: string
  productId: string
  productName: string
  quantity: number
  unitCost: number
}

export interface RequirementAllocation {
  categoryId: string
  categoryName: string
  productId?: string      // Set when variant maps to specific product
  productName?: string    // Set when variant maps to specific product
  quantityRequired: number
  allocations: AllocationLine[]
  totalCost: number
  fulfilled: boolean
}

type LotWithProduct = {
  id: string
  remaining: unknown
  unitCost: unknown
  receivedAt: Date
  expiresAt: Date | null
  productId: string
  productName: string
}

function sortLotsByPickRule(lots: LotWithProduct[], pickRule: PickRule): LotWithProduct[] {
  return [...lots].sort((a, b) => {
    switch (pickRule) {
      case 'FIFO':
        return a.receivedAt.getTime() - b.receivedAt.getTime()
      case 'FEFO':
        if (!a.expiresAt && !b.expiresAt) return a.receivedAt.getTime() - b.receivedAt.getTime()
        if (!a.expiresAt) return 1
        if (!b.expiresAt) return -1
        return a.expiresAt.getTime() - b.expiresAt.getTime()
      case 'CHEAPEST':
        return Number(a.unitCost) - Number(b.unitCost)
      case 'MANUAL':
      default:
        return a.receivedAt.getTime() - b.receivedAt.getTime()
    }
  })
}

function allocateFromLots(sortedLots: LotWithProduct[], quantityNeeded: number) {
  const allocations: AllocationLine[] = []
  let remaining = quantityNeeded
  let totalCost = 0

  for (const lot of sortedLots) {
    if (remaining <= 0) break

    const allocateQty = Math.min(remaining, Number(lot.remaining))
    if (allocateQty > 0) {
      allocations.push({
        lotId: lot.id,
        productId: lot.productId,
        productName: lot.productName,
        quantity: allocateQty,
        unitCost: Number(lot.unitCost),
      })
      totalCost += allocateQty * Number(lot.unitCost)
      remaining -= allocateQty
    }
  }

  return { allocations, totalCost, fulfilled: remaining <= 0 }
}

// Allocate stock for a requirement based on pick rule
// Accepts optional client for use within transactions
export async function allocateStockForRequirement(
  categoryId: string,
  quantityNeeded: number,
  pickRule: PickRule,
  client: PrismaClientLike = prisma
): Promise<RequirementAllocation> {
  const category = await client.componentCategory.findUnique({
    where: { id: categoryId },
    include: {
      products: {
        where: { isActive: true },
        include: {
          lots: {
            where: { remaining: { gt: 0 } },
          },
        },
      },
    },
  })

  if (!category) {
    return {
      categoryId,
      categoryName: 'Unknown',
      quantityRequired: quantityNeeded,
      allocations: [],
      totalCost: 0,
      fulfilled: false,
    }
  }

  // Gather all available lots across products in category
  const allLots: LotWithProduct[] = category.products.flatMap((product) =>
    product.lots.map((lot) => ({
      ...lot,
      productId: product.id,
      productName: product.name,
    }))
  )

  const sortedLots = sortLotsByPickRule(allLots, pickRule)
  const { allocations, totalCost, fulfilled } = allocateFromLots(sortedLots, quantityNeeded)

  return {
    categoryId,
    categoryName: category.name,
    quantityRequired: quantityNeeded,
    allocations,
    totalCost,
    fulfilled,
  }
}

// Allocate stock for a variant requirement (uses specific mapped products, or falls back to category-wide)
// A variant can have multiple mappings to the same category (e.g., L Plate + P Plate)
// Accepts optional client for use within transactions
export async function allocateStockForVariantRequirement(
  variantId: string,
  categoryId: string,
  quantityNeeded: number,
  pickRule: PickRule,
  client: PrismaClientLike = prisma
): Promise<RequirementAllocation> {
  // Get all variant mappings for this category (can be multiple products)
  const mappings = await client.hamperVariantMapping.findMany({
    where: {
      variantId,
      categoryId,
    },
    include: {
      category: true,
      product: {
        include: {
          lots: {
            where: { remaining: { gt: 0 } },
          },
        },
      },
    },
  })

  if (mappings.length === 0) {
    // No mapping for this category - fall back to category-wide allocation
    return allocateStockForRequirement(categoryId, quantityNeeded, pickRule, client)
  }

  // Gather lots from all mapped products
  const allLots: LotWithProduct[] = mappings.flatMap((mapping) =>
    mapping.product.lots.map((lot) => ({
      ...lot,
      productId: mapping.product.id,
      productName: mapping.product.name,
    }))
  )

  const sortedLots = sortLotsByPickRule(allLots, pickRule)
  const { allocations, totalCost, fulfilled } = allocateFromLots(sortedLots, quantityNeeded)

  // Use first mapping for category info (all mappings share same category)
  const firstMapping = mappings[0]
  return {
    categoryId: firstMapping.categoryId,
    categoryName: firstMapping.category.name,
    // Don't set productId/productName when multiple products could be used
    productId: mappings.length === 1 ? firstMapping.product.id : undefined,
    productName: mappings.length === 1 ? firstMapping.product.name : undefined,
    quantityRequired: quantityNeeded,
    allocations,
    totalCost,
    fulfilled,
  }
}

