import { Router } from 'express'
import { z } from 'zod'
import type { EtsyFeeReconciliationStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { allocateStockForRequirement, allocateStockForVariantRequirement, type AllocationLine } from '../../lib/sales/allocation'
import { calculateEtsyFees, calculatePackagingOverhead } from '../../lib/sales/fees'
import { buildSalesWhereClause } from '../../lib/sales/filters'
import { groupSalesByChannel, groupSalesByHamper } from '../../lib/sales/grouping'
import { salesCreateBodySchema, salesPreviewBodySchema } from '#contracts/routes/sales'

const router = Router()

export function getEtsyFeeReconciliationStatus(
  saleChannel: string,
  etsyOrderId?: string | null,
): EtsyFeeReconciliationStatus {
  if (saleChannel !== 'etsy') return 'NOT_APPLICABLE'
  return etsyOrderId ? 'PENDING' : 'MANUAL_REVIEW'
}

// POST preview sale allocation (before confirming)
router.post('/preview', async (req, res) => {
  try {
    const { lines, postageCharged, saleChannel } = salesPreviewBodySchema.parse(req.body)

    const previews = await Promise.all(
      lines.map(async (line) => {
        // Handle bespoke items (no hamperId)
        if (!line.hamperId) {
          return {
            hamperId: null,
            hamperName: line.description || 'Bespoke Item',
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice || 0,
            requirements: [],
            totalCost: 0, // Bespoke items don't consume stock automatically
            canFulfill: true,
            isBespoke: true,
          }
        }

        const hamper = await prisma.hamper.findUnique({
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

        // For each requirement, calculate allocation (variant-aware)
        const requirementAllocations = await Promise.all(
          hamper.requirements.map(async (req) => {
            const totalNeeded = Number(req.quantity) * line.quantity
            if (line.variantId) {
              return allocateStockForVariantRequirement(
                line.variantId,
                req.categoryId,
                totalNeeded,
                req.category.pickRule
              )
            }
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
          isBespoke: false,
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

    // Calculate estimated fees based on channel
    const feeConfig = saleChannel === 'etsy'
      ? await prisma.etsyFeeConfig.findFirst({
        where: { isActive: true, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      })
      : null

    const estimatedFees = calculateEtsyFees({
      grossRevenue: totalGross,
      postageCharged,
      saleChannel,
      feeConfig,
    }).etsyFees

    // Calculate packaging overhead
    const overheads = await prisma.packagingOverhead.findMany({
      where: { isActive: true, effectiveTo: null },
    })
    const packagingOverhead = calculatePackagingOverhead(overheads)

    res.json({
      lines: previews,
      summary: {
        totalGross,
        postageCharged,
        totalCost,
        estimatedFees,
        packagingOverhead,
        estimatedMargin: totalGross + postageCharged - estimatedFees - totalCost - packagingOverhead,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message })
    }
    console.error('Error previewing sale:', error)
    res.status(500).json({ error: 'Failed to preview sale' })
  }
})

// POST record sale (with stock consumption)
router.post('/', async (req, res) => {
  try {
    const data = salesCreateBodySchema.parse(req.body)

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

    // Calculate fees based on channel
    const { transactionFee, postageTransactionFee, regulatoryFee, processingFee, vatOnProcessingFee, listingFee, etsyFees } =
      calculateEtsyFees({
        grossRevenue: data.grossRevenue,
        postageCharged: data.postageCharged,
        saleChannel: data.saleChannel,
        feeConfig,
      })

    // Calculate packaging overhead
    const packagingOverhead = calculatePackagingOverhead(overheads)

    const etsyFeeReconciliationStatus = getEtsyFeeReconciliationStatus(
      data.saleChannel,
      data.etsyOrderId,
    )

    // Net revenue = gross + postage - fees - overhead
    // Note: For Etsy, postageCharged is what we receive, but postageCost is what we pay
    const netRevenue = data.grossRevenue + data.postageCharged - etsyFees - packagingOverhead

    // Process in transaction
    const sale = await prisma.$transaction(async (tx) => {
      let totalCost = 0
      const saleLines: Array<{
        hamperId: string | null
        description: string | null
        quantity: number
        unitPrice: number
        lineCost: number
        consumptions: Array<{ lotId: string; quantity: number; unitCost: number }>
      }> = []

      // Process each line
      for (const line of data.lines) {
        // Handle bespoke items (no hamperId)
        if (!line.hamperId) {
          saleLines.push({
            hamperId: null,
            description: line.description || 'Bespoke Item',
            quantity: line.quantity,
            unitPrice: line.unitPrice || 0,
            lineCost: 0, // Bespoke items don't have automatic stock cost
            consumptions: [],
          })
          continue
        }

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

        // Historical sales skip inventory allocation entirely
        if (data.isHistorical) {
          saleLines.push({
            hamperId: hamper.id,
            description: null,
            quantity: line.quantity,
            unitPrice: Number(hamper.sellingPrice),
            lineCost: 0, // No stock cost for historical sales
            consumptions: [],
          })
          continue
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
          } else if (line.variantId) {
            // Use variant-specific allocation (maps to specific product)
            const allocation = await allocateStockForVariantRequirement(
              line.variantId,
              req.categoryId,
              totalNeeded,
              req.category.pickRule
            )

            if (!allocation.fulfilled && !req.isOptional) {
              throw new Error(
                `Insufficient stock for ${req.category.name} variant (need ${totalNeeded}, can allocate ${allocation.allocations.reduce((s, a) => s + a.quantity, 0)})`
              )
            }

            allocations = allocation.allocations
          } else {
            // Use automatic category-wide allocation
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
          description: null,
          quantity: line.quantity,
          unitPrice: Number(hamper.sellingPrice),
          lineCost,
          consumptions,
        })

        totalCost += lineCost
      }

      // Calculate margin: net revenue - stock cost - postage cost
      const margin = netRevenue - totalCost - data.postageCost

      // Create the sale record
      const createdSale = await tx.sale.create({
        data: {
          saleDate: data.saleDate ? new Date(data.saleDate) : new Date(),
          saleChannel: data.saleChannel,
          grossRevenue: data.grossRevenue,
          postageCharged: data.postageCharged,
          postageCost: data.postageCost,
          transactionFee,
          postageTransactionFee,
          regulatoryFee,
          processingFee,
          vatOnProcessingFee,
          listingFee,
          etsyFees,
          packagingOverhead,
          netRevenue,
          totalCost,
          margin,
          etsyOrderId: data.etsyOrderId,
          etsyFeeReconciliationStatus,
          notes: data.notes,
          isHistorical: data.isHistorical,
          lines: {
            create: saleLines.map((sl) => ({
              hamperId: sl.hamperId,
              description: sl.description,
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
    const { limit = '50', offset = '0', startDate, endDate, search } = req.query

    const where = buildSalesWhereClause({ startDate, endDate, search })

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
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
      }),
      prisma.sale.count({ where }),
    ])

    res.json({ sales, total })
  } catch (error) {
    console.error('Error fetching sales:', error)
    res.status(500).json({ error: 'Failed to fetch sales' })
  }
})

// GET sales summary (like expenses summary)
router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate, search } = req.query

    const where = buildSalesWhereClause({ startDate, endDate, search })

    const [sales, unverifiedEtsySales] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          lines: {
            include: { hamper: true },
          },
        },
      }),
      prisma.sale.count({
        where: {
          ...where,
          saleChannel: 'etsy',
          etsyFeeReconciliationStatus: { not: 'STATEMENT_VERIFIED' },
        },
      }),
    ])

    const totals = {
      salesCount: sales.length,
      totalRevenue: sales.reduce((sum, s) => sum + Number(s.grossRevenue), 0),
      totalPostageCharged: sales.reduce((sum, s) => sum + Number(s.postageCharged), 0),
      totalPostageCost: sales.reduce((sum, s) => sum + Number(s.postageCost), 0),
      totalFees: sales.reduce((sum, s) => sum + Number(s.etsyFees), 0),
      totalCost: sales.reduce((sum, s) => sum + Number(s.totalCost), 0),
      totalMargin: sales.reduce((sum, s) => sum + Number(s.margin), 0),
    }

    res.json({
      unverifiedEtsySales,
      totals,
      byChannel: groupSalesByChannel(sales),
      byHamper: groupSalesByHamper(sales),
    })
  } catch (error) {
    console.error('Error fetching sales summary:', error)
    res.status(500).json({ error: 'Failed to fetch sales summary' })
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
      where: { saleDate: { gte: startDate }, isHistorical: false },
      include: {
        lines: {
          include: { hamper: true },
        },
      },
      orderBy: { saleDate: 'asc' },
    })

    const unverifiedEtsySales = sales.filter(
      (sale) => sale.saleChannel === 'etsy' && sale.etsyFeeReconciliationStatus !== 'STATEMENT_VERIFIED',
    ).length

    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.grossRevenue), 0)
    const totalPostageCharged = sales.reduce((sum, s) => sum + Number(s.postageCharged), 0)
    const totalPostageCost = sales.reduce((sum, s) => sum + Number(s.postageCost), 0)
    const totalFees = sales.reduce((sum, s) => sum + Number(s.etsyFees), 0)
    const totalOverhead = sales.reduce((sum, s) => sum + Number(s.packagingOverhead), 0)
    const totalCost = sales.reduce((sum, s) => sum + Number(s.totalCost), 0)
    const totalMargin = sales.reduce((sum, s) => sum + Number(s.margin), 0)

    const byHamper = groupSalesByHamper(sales)
    const byChannel = groupSalesByChannel(sales)

    res.json({
      period: { days: Number(days), startDate, endDate: new Date() },
      summary: {
        salesCount: sales.length,
        unverifiedEtsySales,
        totalRevenue,
        totalPostageCharged,
        totalPostageCost,
        postageProfit: totalPostageCharged - totalPostageCost,
        totalFees,
        totalOverhead,
        totalCost,
        totalMargin,
        marginPercent: totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0,
      },
      byHamper,
      byChannel,
    })
  } catch (error) {
    console.error('Error fetching margin analytics:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

export default router
