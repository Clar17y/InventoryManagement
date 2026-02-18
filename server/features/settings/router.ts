import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import {
  etsyFeeCreateBodySchema,
  packagingOverheadCreateBodySchema,
  packagingOverheadUpdateBodySchema,
  postageTierCreateBodySchema,
  postageTierUpdateBodySchema,
} from '#contracts/routes/settings'

const router = Router()

// === Etsy Fees ===

// GET current Etsy fee config
router.get('/etsy-fees', async (_, res) => {
  try {
    const configs = await prisma.etsyFeeConfig.findMany({
      where: { isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    })
    res.json(configs)
  } catch (error) {
    console.error('Error fetching Etsy fees:', error)
    res.status(500).json({ error: 'Failed to fetch Etsy fees' })
  }
})

// POST create new Etsy fee config
router.post('/etsy-fees', async (req, res) => {
  try {
    const data = etsyFeeCreateBodySchema.parse(req.body)

    // Deactivate previous configs
    await prisma.etsyFeeConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false, effectiveTo: new Date() },
    })

    const config = await prisma.etsyFeeConfig.create({
      data: {
        name: data.name,
        transactionFee: data.transactionFee,
        regulatoryFee: data.regulatoryFee,
        paymentFeePercent: data.paymentFeePercent,
        paymentFeeFixed: data.paymentFeeFixed,
        vatRate: data.vatRate,
        listingFee: data.listingFee,
      },
    })

    res.status(201).json(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating Etsy fee config:', error)
    res.status(500).json({ error: 'Failed to create Etsy fee config' })
  }
})

// === Packaging Overhead ===

// GET all packaging overheads
router.get('/packaging-overhead', async (_, res) => {
  try {
    const overheads = await prisma.packagingOverhead.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })

    const total = overheads.reduce((sum, o) => sum + Number(o.costPerOrder), 0)

    res.json({ overheads, totalPerOrder: total })
  } catch (error) {
    console.error('Error fetching packaging overhead:', error)
    res.status(500).json({ error: 'Failed to fetch packaging overhead' })
  }
})

// POST create packaging overhead
router.post('/packaging-overhead', async (req, res) => {
  try {
    const data = packagingOverheadCreateBodySchema.parse(req.body)

    const overhead = await prisma.packagingOverhead.create({
      data: {
        name: data.name,
        costPerOrder: data.costPerOrder,
      },
    })

    res.status(201).json(overhead)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating packaging overhead:', error)
    res.status(500).json({ error: 'Failed to create packaging overhead' })
  }
})

// PUT update packaging overhead
router.put('/packaging-overhead/:id', async (req, res) => {
  try {
    const data = packagingOverheadUpdateBodySchema.parse(req.body)

    const overhead = await prisma.packagingOverhead.update({
      where: { id: req.params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.costPerOrder !== undefined && { costPerOrder: data.costPerOrder }),
      },
    })

    res.json(overhead)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating packaging overhead:', error)
    res.status(500).json({ error: 'Failed to update packaging overhead' })
  }
})

// DELETE packaging overhead
router.delete('/packaging-overhead/:id', async (req, res) => {
  try {
    await prisma.packagingOverhead.update({
      where: { id: req.params.id },
      data: { isActive: false, effectiveTo: new Date() },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting packaging overhead:', error)
    res.status(500).json({ error: 'Failed to delete packaging overhead' })
  }
})

// === Postage Tiers ===

router.get('/postage-tiers', async (_, res) => {
  try {
    const tiers = await prisma.postageTier.findMany({
      where: { isActive: true },
      orderBy: { etsyCharge: 'asc' },
    })
    res.json(tiers)
  } catch (error) {
    console.error('Error fetching postage tiers:', error)
    res.status(500).json({ error: 'Failed to fetch postage tiers' })
  }
})

router.post('/postage-tiers', async (req, res) => {
  try {
    const data = postageTierCreateBodySchema.parse(req.body)
    const tier = await prisma.postageTier.create({
      data: {
        etsyCharge: data.etsyCharge,
        actualCost: data.actualCost,
        label: data.label,
      },
    })
    res.status(201).json(tier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating postage tier:', error)
    res.status(500).json({ error: 'Failed to create postage tier' })
  }
})

router.put('/postage-tiers/:id', async (req, res) => {
  try {
    const data = postageTierUpdateBodySchema.parse(req.body)
    const tier = await prisma.postageTier.update({
      where: { id: req.params.id },
      data: {
        ...(data.etsyCharge !== undefined && { etsyCharge: data.etsyCharge }),
        ...(data.actualCost !== undefined && { actualCost: data.actualCost }),
        ...(data.label !== undefined && { label: data.label }),
      },
    })
    res.json(tier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating postage tier:', error)
    res.status(500).json({ error: 'Failed to update postage tier' })
  }
})

router.delete('/postage-tiers/:id', async (req, res) => {
  try {
    await prisma.postageTier.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting postage tier:', error)
    res.status(500).json({ error: 'Failed to delete postage tier' })
  }
})

// === Dashboard Stats ===

router.get('/dashboard-stats', async (_, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const [
      productCount,
      categoryCount,
      hamperCount,
      todaySales,
      weekSales,
      productsWithLots,
    ] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.componentCategory.count({ where: { isActive: true } }),
      prisma.hamper.count({ where: { isActive: true } }),
      prisma.sale.aggregate({
        where: { saleDate: { gte: today } },
        _sum: { grossRevenue: true, margin: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: { saleDate: { gte: weekAgo } },
        _sum: { grossRevenue: true, margin: true },
        _count: true,
      }),
      // Fetch products with their lots and thresholds to calculate low stock properly
      prisma.product.findMany({
        where: {
          isActive: true,
          lowStockThreshold: { gt: 0 }, // Exclude products with alerts disabled
        },
        select: {
          unit: true,
          lowStockThreshold: true,
          lots: {
            where: { remaining: { gt: 0 } },
            select: { remaining: true },
          },
        },
      }),
    ])

    // Calculate low stock count using per-product thresholds:
    // For "units" products: sum remaining quantities, check if <= product.lowStockThreshold
    // For continuous products (metres, grams, etc.): count lots, check if <= product.lowStockThreshold
    const lowStockCount = productsWithLots.filter((product) => {
      if (product.unit === 'units') {
        const totalRemaining = product.lots.reduce((sum, lot) => sum + Number(lot.remaining), 0)
        return totalRemaining <= product.lowStockThreshold
      } else {
        // For continuous products, count lots
        return product.lots.length <= product.lowStockThreshold
      }
    }).length

    res.json({
      products: productCount,
      categories: categoryCount,
      hampers: hamperCount,
      lowStockProducts: lowStockCount,
      today: {
        salesCount: todaySales._count,
        revenue: todaySales._sum.grossRevenue || 0,
        margin: todaySales._sum.margin || 0,
      },
      thisWeek: {
        salesCount: weekSales._count,
        revenue: weekSales._sum.grossRevenue || 0,
        margin: weekSales._sum.margin || 0,
      },
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

export default router
