import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import {
  inventoryAddLotBodySchema,
  inventoryUpdateLotBodySchema,
} from '#contracts/routes/inventory'

const router = Router()

// GET inventory summary by category
router.get('/by-category', async (_, res) => {
  try {
    const categories = await prisma.componentCategory.findMany({
      where: { isActive: true },
      include: {
        products: {
          where: { isActive: true },
          include: {
            lots: {
              where: { remaining: { gt: 0 } },
              select: { remaining: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const summary = categories.map((cat) => {
      const totalStock = cat.products.reduce((catSum, prod) => {
        const productStock = prod.lots.reduce(
          (prodSum, lot) => prodSum + Number(lot.remaining),
          0
        )
        return catSum + productStock
      }, 0)

      return {
        id: cat.id,
        name: cat.name,
        productCount: cat.products.length,
        totalStock,
      }
    })

    res.json(summary)
  } catch (error) {
    console.error('Error fetching inventory by category:', error)
    res.status(500).json({ error: 'Failed to fetch inventory' })
  }
})

// GET lots for a product
router.get('/lots/:productId', async (req, res) => {
  try {
    const lots = await prisma.inventoryLot.findMany({
      where: {
        productId: req.params.productId,
        remaining: { gt: 0 },
      },
      orderBy: { receivedAt: 'asc' },
    })
    res.json(lots)
  } catch (error) {
    console.error('Error fetching lots:', error)
    res.status(500).json({ error: 'Failed to fetch lots' })
  }
})

// GET available lots by category (for manual allocation override)
router.get('/lots-by-category/:categoryId', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        categoryId: req.params.categoryId,
        isActive: true,
      },
      include: {
        lots: {
          where: { remaining: { gt: 0 } },
          orderBy: { receivedAt: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Flatten to a list of lots with product info
    const lots = products.flatMap((product) =>
      product.lots.map((lot) => ({
        ...lot,
        productId: product.id,
        productName: product.name,
      }))
    )

    res.json(lots)
  } catch (error) {
    console.error('Error fetching lots by category:', error)
    res.status(500).json({ error: 'Failed to fetch lots' })
  }
})

// POST add inventory lot (receive stock)
router.post('/lots', async (req, res) => {
  try {
    const data = inventoryAddLotBodySchema.parse(req.body)

    // Create lot and update/create cost record in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the inventory lot
      const lot = await tx.inventoryLot.create({
        data: {
          productId: data.productId,
          quantity: data.quantity,
          remaining: data.quantity,
          unitCost: data.unitCost,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        },
        include: { product: true },
      })

      // Close any existing cost record and create new one if cost changed
      const currentCost = await tx.productCost.findFirst({
        where: {
          productId: data.productId,
          effectiveTo: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      })

      if (!currentCost || Number(currentCost.unitCost) !== data.unitCost) {
        // Close existing cost record
        if (currentCost) {
          await tx.productCost.update({
            where: { id: currentCost.id },
            data: { effectiveTo: new Date() },
          })
        }

        // Create new cost record
        await tx.productCost.create({
          data: {
            productId: data.productId,
            unitCost: data.unitCost,
          },
        })
      }

      return lot
    })

    res.status(201).json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error adding inventory lot:', error)
    res.status(500).json({ error: 'Failed to add inventory' })
  }
})

// PUT update inventory lot
router.put('/lots/:id', async (req, res) => {
  try {
    const data = inventoryUpdateLotBodySchema.parse(req.body)

    const lot = await prisma.inventoryLot.update({
      where: { id: req.params.id },
      data: {
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.remaining !== undefined && { remaining: data.remaining }),
        ...(data.unitCost !== undefined && { unitCost: data.unitCost }),
        ...(data.expiresAt !== undefined && {
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
        }),
      },
      include: { product: true },
    })

    res.json(lot)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating inventory lot:', error)
    res.status(500).json({ error: 'Failed to update lot' })
  }
})

// DELETE inventory lot
router.delete('/lots/:id', async (req, res) => {
  try {
    // Set remaining to 0 (soft delete - keeps history)
    await prisma.inventoryLot.update({
      where: { id: req.params.id },
      data: { remaining: 0 },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting inventory lot:', error)
    res.status(500).json({ error: 'Failed to delete lot' })
  }
})

// GET low stock alerts
router.get('/alerts/low-stock', async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        lowStockThreshold: { gt: 0 }, // Exclude products with alerts disabled
      },
      include: {
        category: true,
        lots: {
          where: { remaining: { gt: 0 } },
          select: { remaining: true },
        },
      },
    })

    const lowStock = products
      .map((product) => {
        const totalRemaining = product.lots.reduce(
          (sum, lot) => sum + Number(lot.remaining),
          0
        )
        const lotCount = product.lots.length

        // For "units" products: use sum of remaining
        // For continuous products: use lot count
        const totalStock = product.unit === 'units' ? totalRemaining : lotCount

        return { ...product, totalStock, totalRemaining, lotCount, lots: undefined }
      })
      .filter((product) => product.totalStock <= product.lowStockThreshold)
      .sort((a, b) => a.totalStock - b.totalStock)

    res.json(lowStock)
  } catch (error) {
    console.error('Error fetching low stock alerts:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// GET expiring lots
router.get('/alerts/expiring', async (req, res) => {
  try {
    const daysAhead = Number(req.query.days) || 30
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + daysAhead)

    const expiringLots = await prisma.inventoryLot.findMany({
      where: {
        remaining: { gt: 0 },
        expiresAt: {
          not: null,
          lte: futureDate,
        },
      },
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: { expiresAt: 'asc' },
    })

    res.json(expiringLots)
  } catch (error) {
    console.error('Error fetching expiring lots:', error)
    res.status(500).json({ error: 'Failed to fetch expiring lots' })
  }
})

export default router
