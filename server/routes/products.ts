import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'

const router = Router()

const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  barcode: z.string().max(50).optional(),
  categoryId: z.string().cuid(),
  unit: z.string().max(20).default('units'),
  lowStockThreshold: z.number().int().min(0).default(5),
})

const updateProductSchema = createProductSchema.partial()

// GET all products with stock levels
router.get('/', async (req, res) => {
  try {
    const { categoryId } = req.query

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryId && { categoryId: categoryId as string }),
      },
      include: {
        category: true,
        lots: {
          where: { remaining: { gt: 0 } },
          select: { remaining: true, unitCost: true },
        },
        costs: {
          where: { effectiveTo: null },
          take: 1,
          orderBy: { effectiveFrom: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Calculate total stock for each product
    // For "units" products: sum the remaining quantity
    // For continuous products (metres, grams, etc.): count number of lots
    const productsWithStock = products.map((product) => {
      const totalRemaining = product.lots.reduce(
        (sum, lot) => sum + Number(lot.remaining),
        0
      )
      const lotCount = product.lots.length

      // For non-unit products, totalStock = number of lots
      // For unit products, totalStock = sum of remaining quantities
      const totalStock = product.unit === 'units' ? totalRemaining : lotCount

      const currentCost = product.costs[0]?.unitCost || null
      return {
        ...product,
        totalStock,
        totalRemaining, // Always include the actual remaining quantity
        lotCount,
        currentCost,
        lots: undefined,
        costs: undefined,
      }
    })

    res.json(productsWithStock)
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// GET product by barcode (for scanner)
router.get('/barcode/:barcode', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { barcode: req.params.barcode },
      include: {
        category: true,
        costs: {
          where: { effectiveTo: null },
          take: 1,
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found', barcode: req.params.barcode })
    }

    res.json({
      ...product,
      currentCost: product.costs[0]?.unitCost || null,
      costs: undefined,
    })
  } catch (error) {
    console.error('Error fetching product by barcode:', error)
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// GET single product with details
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        lots: {
          where: { remaining: { gt: 0 } },
          orderBy: { receivedAt: 'asc' },
        },
        costs: {
          orderBy: { effectiveFrom: 'desc' },
          take: 10,
        },
      },
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.json(product)
  } catch (error) {
    console.error('Error fetching product:', error)
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// POST create product
router.post('/', async (req, res) => {
  try {
    const data = createProductSchema.parse(req.body)

    const product = await prisma.product.create({
      data: {
        name: data.name,
        barcode: data.barcode || null,
        categoryId: data.categoryId,
        unit: data.unit,
        lowStockThreshold: data.lowStockThreshold,
      },
      include: { category: true },
    })

    res.status(201).json(product)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Barcode already exists' })
      }
    }
    console.error('Error creating product:', error)
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const data = updateProductSchema.parse(req.body)

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.barcode !== undefined && { barcode: data.barcode || null }),
        ...(data.categoryId && { categoryId: data.categoryId }),
        ...(data.unit && { unit: data.unit }),
        ...(data.lowStockThreshold !== undefined && { lowStockThreshold: data.lowStockThreshold }),
      },
      include: { category: true },
    })

    res.json(product)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating product:', error)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// DELETE (soft delete) product
router.delete('/:id', async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting product:', error)
    res.status(500).json({ error: 'Failed to delete product' })
  }
})

export default router
