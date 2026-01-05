import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { PickRule } from '@prisma/client'

const router = Router()

interface AllocationLine {
  lotId: string
  productId: string
  productName: string
  quantity: number
  unitCost: number
}

interface RequirementAllocation {
  categoryId: string
  categoryName: string
  quantityRequired: number
  allocations: AllocationLine[]
  totalCost: number
  fulfilled: boolean
}

// Allocate stock for a requirement based on pick rule
async function allocateStockForRequirement(
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
  const allLots = category.products.flatMap((product) =>
    product.lots.map((lot) => ({
      ...lot,
      productId: product.id,
      productName: product.name,
    }))
  )

  // Sort lots based on pick rule
  const sortedLots = [...allLots].sort((a, b) => {
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

  // Allocate from sorted lots
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

  return {
    categoryId,
    categoryName: category.name,
    quantityRequired: quantityNeeded,
    allocations,
    totalCost,
    fulfilled: remaining <= 0,
  }
}

const saleLineSchema = z.object({
  hamperId: z.string().cuid(),
  quantity: z.number().int().positive().default(1),
})

const recordSaleSchema = z.object({
  grossRevenue: z.number().positive(),
  etsyOrderId: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(saleLineSchema).min(1),
  // Optional overrides for allocations
  allocationOverrides: z.record(z.string(), z.array(z.object({
    lotId: z.string().cuid(),
    quantity: z.number().positive(),
  }))).optional(),
})

// POST preview sale allocation (before confirming)
router.post('/preview', async (req, res) => {
  try {
    const { lines } = z.object({ lines: z.array(saleLineSchema).min(1) }).parse(req.body)

    const previews = await Promise.all(
      lines.map(async (line) => {
        const hamper = await prisma.hamper.findUnique({
          where: { id: line.hamperId },
          include: {
            requirements: {
              include: { category: true },
            },
          },
        })

        if (!hamper) {
          return { hamperId: line.hamperId, error: 'Hamper not found' }
        }

        // For each requirement, calculate allocation
        const requirementAllocations = await Promise.all(
          hamper.requirements.map(async (req) => {
            const totalNeeded = Number(req.quantity) * line.quantity
            return allocateStockForRequirement(
              req.categoryId,
              totalNeeded,
              req.category.pickRule
            )
          })
        )

        const allFulfilled = requirementAllocations
          .filter((_, i) => !hamper.requirements[i]?.isOptional)
          .every((r) => r.fulfilled)

        const totalCost = requirementAllocations.reduce((sum, r) => sum + r.totalCost, 0)

        return {
          hamperId: hamper.id,
          hamperName: hamper.name,
          quantity: line.quantity,
          unitPrice: Number(hamper.sellingPrice),
          requirements: requirementAllocations,
          totalCost,
          canFulfill: allFulfilled,
        }
      })
    )

    const totalGross = previews.reduce((sum, p) => {
      if ('unitPrice' in p && p.unitPrice !== undefined && p.quantity !== undefined) {
        return sum + p.unitPrice * p.quantity
      }
      return sum
    }, 0)

    const totalCost = previews.reduce((sum, p) => {
      if ('totalCost' in p && p.totalCost !== undefined) {
        return sum + p.totalCost
      }
      return sum
    }, 0)

    res.json({
      lines: previews,
      summary: {
        totalGross,
        totalCost,
        estimatedMargin: totalGross - totalCost,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error previewing sale:', error)
    res.status(500).json({ error: 'Failed to preview sale' })
  }
})

// POST record sale (with stock consumption)
router.post('/', async (req, res) => {
  try {
    const data = recordSaleSchema.parse(req.body)

    // Get active fee config and overhead
    const [feeConfig, overheads] = await Promise.all([
      prisma.etsyFeeConfig.findFirst({
        where: { isActive: true, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      }),
      prisma.packagingOverhead.findMany({
        where: { isActive: true, effectiveTo: null },
      }),
    ])

    // Calculate Etsy fees
    let etsyFees = 0
    if (feeConfig) {
      etsyFees =
        data.grossRevenue * Number(feeConfig.percentageFee) +
        Number(feeConfig.fixedFee) +
        data.grossRevenue * Number(feeConfig.paymentFee)
    }

    // Calculate packaging overhead
    const packagingOverhead = overheads.reduce(
      (sum, o) => sum + Number(o.costPerOrder),
      0
    )

    const netRevenue = data.grossRevenue - etsyFees - packagingOverhead

    // Process in transaction
    const sale = await prisma.$transaction(async (tx) => {
      let totalCost = 0
      const saleLines: Array<{
        hamperId: string
        quantity: number
        unitPrice: number
        lineCost: number
        consumptions: Array<{ lotId: string; quantity: number; unitCost: number }>
      }> = []

      // Process each line
      for (const line of data.lines) {
        const hamper = await tx.hamper.findUnique({
          where: { id: line.hamperId },
          include: {
            requirements: {
              include: { category: true },
            },
          },
        })

        if (!hamper) {
          throw new Error(`Hamper ${line.hamperId} not found`)
        }

        let lineCost = 0
        const consumptions: Array<{ lotId: string; quantity: number; unitCost: number }> = []

        // Process each requirement
        for (const req of hamper.requirements) {
          const totalNeeded = Number(req.quantity) * line.quantity

          // Check for override
          const overrideKey = `${line.hamperId}:${req.categoryId}`
          const override = data.allocationOverrides?.[overrideKey]

          let allocations: AllocationLine[]

          if (override) {
            // Use override allocations
            allocations = await Promise.all(
              override.map(async (o) => {
                const lot = await tx.inventoryLot.findUnique({
                  where: { id: o.lotId },
                  include: { product: true },
                })
                if (!lot) throw new Error(`Lot ${o.lotId} not found`)
                return {
                  lotId: lot.id,
                  productId: lot.productId,
                  productName: lot.product.name,
                  quantity: o.quantity,
                  unitCost: Number(lot.unitCost),
                }
              })
            )
          } else {
            // Use automatic allocation
            const allocation = await allocateStockForRequirement(
              req.categoryId,
              totalNeeded,
              req.category.pickRule
            )

            if (!allocation.fulfilled && !req.isOptional) {
              throw new Error(
                `Insufficient stock for ${req.category.name} (need ${totalNeeded}, can allocate ${allocation.allocations.reduce((s, a) => s + a.quantity, 0)})`
              )
            }

            allocations = allocation.allocations
          }

          // Deduct from lots and record consumptions
          for (const alloc of allocations) {
            await tx.inventoryLot.update({
              where: { id: alloc.lotId },
              data: { remaining: { decrement: alloc.quantity } },
            })

            consumptions.push({
              lotId: alloc.lotId,
              quantity: alloc.quantity,
              unitCost: alloc.unitCost,
            })

            lineCost += alloc.quantity * alloc.unitCost
          }
        }

        saleLines.push({
          hamperId: hamper.id,
          quantity: line.quantity,
          unitPrice: Number(hamper.sellingPrice),
          lineCost,
          consumptions,
        })

        totalCost += lineCost
      }

      // Create the sale record
      const createdSale = await tx.sale.create({
        data: {
          grossRevenue: data.grossRevenue,
          etsyFees,
          packagingOverhead,
          netRevenue,
          totalCost,
          margin: netRevenue - totalCost,
          etsyOrderId: data.etsyOrderId,
          notes: data.notes,
          lines: {
            create: saleLines.map((sl) => ({
              hamperId: sl.hamperId,
              quantity: sl.quantity,
              unitPrice: sl.unitPrice,
              lineCost: sl.lineCost,
              consumptions: {
                create: sl.consumptions.map((c) => ({
                  lotId: c.lotId,
                  quantity: c.quantity,
                  unitCost: c.unitCost,
                })),
              },
            })),
          },
        },
        include: {
          lines: {
            include: {
              hamper: true,
              consumptions: {
                include: {
                  lot: {
                    include: { product: true },
                  },
                },
              },
            },
          },
        },
      })

      return createdSale
    })

    res.status(201).json(sale)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message })
    }
    console.error('Error recording sale:', error)
    res.status(500).json({ error: 'Failed to record sale' })
  }
})

// GET all sales
router.get('/', async (req, res) => {
  try {
    const { limit = '50', offset = '0' } = req.query

    const sales = await prisma.sale.findMany({
      include: {
        lines: {
          include: {
            hamper: true,
            consumptions: {
              include: {
                lot: {
                  include: { product: true },
                },
              },
            },
          },
        },
      },
      orderBy: { saleDate: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    })

    res.json(sales)
  } catch (error) {
    console.error('Error fetching sales:', error)
    res.status(500).json({ error: 'Failed to fetch sales' })
  }
})

// GET single sale with full details
router.get('/:id', async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        lines: {
          include: {
            hamper: true,
            consumptions: {
              include: {
                lot: {
                  include: { product: true },
                },
              },
            },
          },
        },
      },
    })

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' })
    }

    res.json(sale)
  } catch (error) {
    console.error('Error fetching sale:', error)
    res.status(500).json({ error: 'Failed to fetch sale' })
  }
})

// GET margin analytics
router.get('/analytics/margins', async (req, res) => {
  try {
    const { days = '30' } = req.query
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Number(days))

    const sales = await prisma.sale.findMany({
      where: { saleDate: { gte: startDate } },
      include: {
        lines: {
          include: { hamper: true },
        },
      },
      orderBy: { saleDate: 'asc' },
    })

    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.grossRevenue), 0)
    const totalFees = sales.reduce((sum, s) => sum + Number(s.etsyFees), 0)
    const totalOverhead = sales.reduce((sum, s) => sum + Number(s.packagingOverhead), 0)
    const totalCost = sales.reduce((sum, s) => sum + Number(s.totalCost), 0)
    const totalMargin = sales.reduce((sum, s) => sum + Number(s.margin), 0)

    // Group by hamper
    const byHamper: Record<string, { name: string; count: number; revenue: number; margin: number }> = {}
    for (const sale of sales) {
      for (const line of sale.lines) {
        const key = line.hamperId
        if (!byHamper[key]) {
          byHamper[key] = { name: line.hamper.name, count: 0, revenue: 0, margin: 0 }
        }
        byHamper[key].count += line.quantity
        byHamper[key].revenue += Number(line.unitPrice) * line.quantity
      }
    }

    res.json({
      period: { days: Number(days), startDate, endDate: new Date() },
      summary: {
        salesCount: sales.length,
        totalRevenue,
        totalFees,
        totalOverhead,
        totalCost,
        totalMargin,
        marginPercent: totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0,
      },
      byHamper: Object.values(byHamper).sort((a, b) => b.count - a.count),
    })
  } catch (error) {
    console.error('Error fetching margin analytics:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

export default router
