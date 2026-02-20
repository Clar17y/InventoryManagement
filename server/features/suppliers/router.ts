import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  supplierCreateBodySchema,
  supplierUpdateBodySchema,
} from '#contracts/routes/suppliers'

const router = Router()

// GET all active suppliers
router.get('/', async (_, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
    res.json(suppliers)
  } catch (error) {
    console.error('Error fetching suppliers:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers' })
  }
})

// POST create supplier
router.post('/', async (req, res) => {
  try {
    const data = supplierCreateBodySchema.parse(req.body)
    const supplier = await prisma.supplier.create({
      data: { name: data.name },
    })
    res.status(201).json(supplier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'A supplier with this name already exists' })
    }
    console.error('Error creating supplier:', error)
    res.status(500).json({ error: 'Failed to create supplier' })
  }
})

// PUT update supplier
router.put('/:id', async (req, res) => {
  try {
    const data = supplierUpdateBodySchema.parse(req.body)
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: { ...(data.name !== undefined && { name: data.name }) },
    })
    res.json(supplier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating supplier:', error)
    res.status(500).json({ error: 'Failed to update supplier' })
  }
})

// DELETE (soft) supplier
router.delete('/:id', async (req, res) => {
  try {
    await prisma.supplier.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting supplier:', error)
    res.status(500).json({ error: 'Failed to delete supplier' })
  }
})

// GET low-stock products for a supplier
router.get('/:id/low-stock', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        lowStockThreshold: { gt: 0 },
        suppliers: {
          some: { supplierId: req.params.id },
        },
      },
      include: {
        category: { select: { name: true } },
        lots: {
          where: { remaining: { gt: 0 } },
          select: { remaining: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const lowStockProducts = products
      .map((product) => {
        const totalRemaining = product.lots.reduce(
          (sum, lot) => sum + Number(lot.remaining),
          0
        )
        const totalStock = product.unit === 'units' ? totalRemaining : product.lots.length
        return {
          id: product.id,
          name: product.name,
          categoryName: product.category?.name ?? null,
          unit: product.unit,
          totalStock,
          lowStockThreshold: product.lowStockThreshold,
        }
      })
      .filter((p) => p.totalStock <= p.lowStockThreshold)

    res.json(lowStockProducts)
  } catch (error) {
    console.error('Error fetching supplier low stock:', error)
    res.status(500).json({ error: 'Failed to fetch low stock for supplier' })
  }
})

// GET product IDs for a supplier
router.get('/:id/products', async (req, res) => {
  try {
    const links = await prisma.productSupplier.findMany({
      where: { supplierId: req.params.id },
      select: { productId: true },
    })
    res.json(links.map((l) => l.productId))
  } catch (error) {
    console.error('Error fetching supplier products:', error)
    res.status(500).json({ error: 'Failed to fetch supplier products' })
  }
})

// PUT set product IDs for a supplier (replace all)
router.put('/:id/products', async (req, res) => {
  try {
    const { productIds } = z.object({ productIds: z.array(z.string()) }).parse(req.body)

    await prisma.$transaction([
      prisma.productSupplier.deleteMany({
        where: { supplierId: req.params.id },
      }),
      ...(productIds.length > 0
        ? [prisma.productSupplier.createMany({
            data: productIds.map((productId) => ({ productId, supplierId: req.params.id })),
          })]
        : []),
    ])

    res.json(productIds)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating supplier products:', error)
    res.status(500).json({ error: 'Failed to update supplier products' })
  }
})

// GET supplier IDs for a product
router.get('/by-product/:productId', async (req, res) => {
  try {
    const links = await prisma.productSupplier.findMany({
      where: { productId: req.params.productId },
      select: { supplierId: true },
    })
    res.json(links.map((l) => l.supplierId))
  } catch (error) {
    console.error('Error fetching product suppliers:', error)
    res.status(500).json({ error: 'Failed to fetch product suppliers' })
  }
})

// PUT set supplier IDs for a product (replace all)
router.put('/by-product/:productId', async (req, res) => {
  try {
    const { supplierIds } = z.object({ supplierIds: z.array(z.string()) }).parse(req.body)

    await prisma.$transaction([
      prisma.productSupplier.deleteMany({
        where: { productId: req.params.productId },
      }),
      ...(supplierIds.length > 0
        ? [prisma.productSupplier.createMany({
            data: supplierIds.map((supplierId) => ({ productId: req.params.productId, supplierId })),
          })]
        : []),
    ])

    res.json(supplierIds)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating product suppliers:', error)
    res.status(500).json({ error: 'Failed to update product suppliers' })
  }
})

export default router
