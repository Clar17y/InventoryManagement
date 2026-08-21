import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { Prisma } from '@prisma/client'
import { buildPaginationMeta, toPrismaPagination } from '../../lib/pagination'
import {
  productsAddBarcodeBodySchema,
  productsCreateBodySchema,
  productsListQuerySchema,
  productsUpdateBodySchema,
} from '#contracts/routes/products'

const router = Router()
const productsSortFields = {
  name: 'name',
  createdAt: 'createdAt',
} as const

const productListSelect = {
  id: true,
  name: true,
  categoryId: true,
  unit: true,
  lowStockThreshold: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      description: true,
      pickRule: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.ProductSelect

type ProductListBarcode = { id: string; barcode: string }
type ProductListAggregate = {
  productId: string
  totalRemaining: Prisma.Decimal | number | string
  lotCount: number | bigint
  currentCost: Prisma.Decimal | number | string | null
  primaryBarcode: string | null
  barcodes: ProductListBarcode[] | null
}

async function loadProductListAggregates(productIds: string[]): Promise<ProductListAggregate[]> {
  if (productIds.length === 0) return []

  return prisma.$queryRaw<ProductListAggregate[]>(Prisma.sql`
    WITH page_products AS (
      SELECT p.id
      FROM "Product" p
      WHERE p.id IN (${Prisma.join(productIds)})
    ), stock AS (
      SELECT l."productId",
        COALESCE(SUM(l.remaining), 0) AS "totalRemaining",
        COUNT(*)::integer AS "lotCount"
      FROM "InventoryLot" l
      JOIN page_products page ON page.id = l."productId"
      WHERE l.remaining > 0
      GROUP BY l."productId"
    ), barcode_summary AS (
      SELECT b."productId",
        json_agg(
          json_build_object('id', b.id, 'barcode', b.barcode)
          ORDER BY b."createdAt" ASC, b.id ASC
        ) AS barcodes,
        (array_agg(b.barcode ORDER BY b."createdAt" ASC, b.id ASC))[1] AS "primaryBarcode"
      FROM "ProductBarcode" b
      JOIN page_products page ON page.id = b."productId"
      GROUP BY b."productId"
    )
    SELECT page.id AS "productId",
      COALESCE(stock."totalRemaining", 0) AS "totalRemaining",
      COALESCE(stock."lotCount", 0) AS "lotCount",
      current_cost."unitCost" AS "currentCost",
      COALESCE(barcode_summary.barcodes, '[]'::json) AS barcodes,
      barcode_summary."primaryBarcode"
    FROM page_products page
    LEFT JOIN stock ON stock."productId" = page.id
    LEFT JOIN LATERAL (
      SELECT pc."unitCost"
      FROM "ProductCost" pc
      WHERE pc."productId" = page.id
        AND pc."effectiveTo" IS NULL
      ORDER BY pc."effectiveFrom" DESC, pc.id DESC
      LIMIT 1
    ) current_cost ON true
    LEFT JOIN barcode_summary ON barcode_summary."productId" = page.id
  `)
}

// GET products with stock levels
router.get('/', async (req, res) => {
  try {
    const query = productsListQuerySchema.parse(req.query)
    const { skip, take } = toPrismaPagination(query)
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { category: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    }
    const sortField = productsSortFields[query.sort]

    const [products, totalItems] = await Promise.all([
      prisma.product.findMany({
        where,
        select: productListSelect,
        orderBy: [{ [sortField]: query.direction }, { id: query.direction }],
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ])

    const aggregates = await loadProductListAggregates(products.map((product) => product.id))
    const aggregatesById = new Map(aggregates.map((aggregate) => [aggregate.productId, aggregate]))

    // Calculate total stock for each product
    // For "units" products: sum the remaining quantity
    // For continuous products (metres, grams, etc.): count number of lots
    const productsWithStock = products.map((product) => {
      const aggregate = aggregatesById.get(product.id)
      const totalRemaining = Number(aggregate?.totalRemaining ?? 0)
      const lotCount = Number(aggregate?.lotCount ?? 0)

      // For non-unit products, totalStock = number of lots
      // For unit products, totalStock = sum of remaining quantities
      const totalStock = product.unit === 'units' ? totalRemaining : lotCount

      const currentCost = aggregate?.currentCost ?? null
      const barcodes = aggregate?.barcodes ?? []
      return {
        ...product,
        barcodes,
        barcode: aggregate?.primaryBarcode ?? null, // Backward compatibility
        totalStock,
        totalRemaining, // Always include the actual remaining quantity
        lotCount,
        currentCost,
        lots: undefined,
        costs: undefined,
      }
    })

    res.json({
      items: productsWithStock,
      pagination: buildPaginationMeta(query, totalItems),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error fetching products:', error)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// GET product by barcode (for scanner)
router.get('/barcode/:barcode', async (req, res) => {
  try {
    // Query the ProductBarcode table to find the product
    const barcodeRecord = await prisma.productBarcode.findUnique({
      where: { barcode: req.params.barcode },
      include: {
        product: {
          include: {
            category: true,
            barcodes: {
              select: { id: true, barcode: true },
            },
            costs: {
              where: { effectiveTo: null },
              take: 1,
              orderBy: { effectiveFrom: 'desc' },
            },
          },
        },
      },
    })

    if (!barcodeRecord) {
      return res.status(404).json({ error: 'Product not found', barcode: req.params.barcode })
    }

    const product = barcodeRecord.product
    const primaryBarcode = product.barcodes[0]?.barcode || null

    res.json({
      ...product,
      barcode: primaryBarcode, // Backward compatibility
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
        barcodes: {
          select: { id: true, barcode: true },
        },
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

    const primaryBarcode = product.barcodes[0]?.barcode || null
    res.json({
      ...product,
      barcode: primaryBarcode, // Backward compatibility
    })
  } catch (error) {
    console.error('Error fetching product:', error)
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// POST create product
router.post('/', async (req, res) => {
  try {
    const data = productsCreateBodySchema.parse(req.body)

    const product = await prisma.product.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        unit: data.unit,
        lowStockThreshold: data.lowStockThreshold,
        // Create initial barcode if provided
        ...(data.barcode && {
          barcodes: {
            create: { barcode: data.barcode },
          },
        }),
      },
      include: {
        category: true,
        barcodes: {
          select: { id: true, barcode: true },
        },
      },
    })

    const primaryBarcode = product.barcodes[0]?.barcode || null
    res.status(201).json({
      ...product,
      barcode: primaryBarcode, // Backward compatibility
    })
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

// POST add barcode to existing product
router.post('/:id/barcodes', async (req, res) => {
  try {
    const data = productsAddBarcodeBodySchema.parse(req.body)

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    const barcodeRecord = await prisma.productBarcode.create({
      data: {
        barcode: data.barcode,
        productId: req.params.id,
      },
    })

    res.status(201).json(barcodeRecord)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Barcode already exists' })
      }
    }
    console.error('Error adding barcode:', error)
    res.status(500).json({ error: 'Failed to add barcode' })
  }
})

// DELETE barcode from product
router.delete('/:id/barcodes/:barcodeId', async (req, res) => {
  try {
    // Verify barcode belongs to this product
    const barcodeRecord = await prisma.productBarcode.findFirst({
      where: {
        id: req.params.barcodeId,
        productId: req.params.id,
      },
    })

    if (!barcodeRecord) {
      return res.status(404).json({ error: 'Barcode not found' })
    }

    await prisma.productBarcode.delete({
      where: { id: req.params.barcodeId },
    })

    res.status(204).send()
  } catch (error) {
    console.error('Error deleting barcode:', error)
    res.status(500).json({ error: 'Failed to delete barcode' })
  }
})

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const data = productsUpdateBodySchema.parse(req.body)

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.categoryId && { categoryId: data.categoryId }),
        ...(data.unit && { unit: data.unit }),
        ...(data.lowStockThreshold !== undefined && { lowStockThreshold: data.lowStockThreshold }),
      },
      include: {
        category: true,
        barcodes: {
          select: { id: true, barcode: true },
        },
      },
    })

    const primaryBarcode = product.barcodes[0]?.barcode || null
    res.json({
      ...product,
      barcode: primaryBarcode, // Backward compatibility
    })
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
