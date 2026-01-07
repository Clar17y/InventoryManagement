import { PickRule } from '@prisma/client'
import { prisma } from '../prisma'

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
export async function allocateStockForRequirement(
  categoryId: string,
  quantityNeeded: number,
  pickRule: PickRule
): Promise<RequirementAllocation> {
  const category = await prisma.componentCategory.findUnique({
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

// Allocate stock for a variant requirement (uses specific mapped product only)
export async function allocateStockForVariantRequirement(
  variantId: string,
  categoryId: string,
  quantityNeeded: number,
  pickRule: PickRule
): Promise<RequirementAllocation> {
  // Get the variant mapping for this category
  const mapping = await prisma.hamperVariantMapping.findUnique({
    where: {
      variantId_categoryId: {
        variantId,
        categoryId,
      },
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

  if (!mapping) {
    // No mapping for this category in this variant - return unfulfilled
    return {
      categoryId,
      categoryName: 'Unmapped',
      quantityRequired: quantityNeeded,
      allocations: [],
      totalCost: 0,
      fulfilled: false,
    }
  }

  const allLots: LotWithProduct[] = mapping.product.lots.map((lot) => ({
    ...lot,
    productId: mapping.product.id,
    productName: mapping.product.name,
  }))

  const sortedLots = sortLotsByPickRule(allLots, pickRule)
  const { allocations, totalCost, fulfilled } = allocateFromLots(sortedLots, quantityNeeded)

  return {
    categoryId: mapping.categoryId,
    categoryName: mapping.category.name,
    quantityRequired: quantityNeeded,
    allocations,
    totalCost,
    fulfilled,
  }
}

