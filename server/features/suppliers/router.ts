import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { includeArchivedQuerySchema } from '#contracts/routes/settings'
import { supplierCreateBodySchema, supplierIdParamSchema, supplierUpdateBodySchema } from '#contracts/routes/suppliers'
import { writeSettingsAudit } from '../../lib/settingsAudit'

const router = Router()

function isPrismaError(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

function supplierSnapshot(supplier: { name: string; isActive: boolean }): Prisma.InputJsonObject {
  return {
    name: supplier.name,
    isActive: supplier.isActive,
  }
}

function notFound(res: Parameters<Parameters<typeof router.get>[1]>[1]): void {
  res.status(404).json({ error: 'Supplier not found' })
}

// GET suppliers
router.get('/', async (_, res) => {
  try {
    const { includeArchived } = includeArchivedQuerySchema.parse(_.query)
    const suppliers = await prisma.supplier.findMany({
      where: includeArchived ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    })
    res.json(suppliers)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error fetching suppliers:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers' })
  }
})

// POST create, restore, or return an existing supplier
router.post('/', async (req, res) => {
  try {
    const data = supplierCreateBodySchema.parse(req.body)
    const existing = await prisma.supplier.findUnique({ where: { name: data.name } })

    if (existing?.isActive) {
      res.json({ item: existing, outcome: 'existing' })
      return
    }

    if (existing) {
      const restored = await prisma.$transaction(async (tx) => {
        const changed = await tx.supplier.updateMany({
          where: { id: existing.id, isActive: false },
          data: { isActive: true },
        })
        const current = await tx.supplier.findUnique({ where: { id: existing.id } })
        if (!current) return { item: existing, outcome: 'existing' as const }
        if (changed.count === 0) return { item: current, outcome: 'existing' as const }

        await writeSettingsAudit(tx, {
          settingType: 'SUPPLIER',
          settingId: current.id,
          action: 'RESTORE',
          before: supplierSnapshot(existing),
          after: supplierSnapshot(current),
        })

        return { item: current, outcome: 'restored' as const }
      })

      res.json(restored)
      return
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: { name: data.name },
        })

        await writeSettingsAudit(tx, {
          settingType: 'SUPPLIER',
          settingId: supplier.id,
          action: 'CREATE',
          before: null,
          after: supplierSnapshot(supplier),
        })

        return supplier
      })

      res.status(201).json({ item: created, outcome: 'created' })
    } catch (error) {
      if (!isPrismaError(error, 'P2002')) throw error

      const raced = await prisma.$transaction(async (tx) => {
        const winner = await tx.supplier.findUnique({ where: { name: data.name } })
        if (!winner) return null
        if (winner.isActive) return { item: winner, outcome: 'existing' as const }

        const changed = await tx.supplier.updateMany({
          where: { id: winner.id, isActive: false },
          data: { isActive: true },
        })
        const current = await tx.supplier.findUnique({ where: { id: winner.id } })
        if (!current) return null
        if (changed.count === 0) return { item: current, outcome: 'existing' as const }

        await writeSettingsAudit(tx, {
          settingType: 'SUPPLIER',
          settingId: current.id,
          action: 'RESTORE',
          before: supplierSnapshot(winner),
          after: supplierSnapshot(current),
        })

        return { item: current, outcome: 'restored' as const }
      })

      if (!raced) {
        res.status(409).json({ error: 'A supplier with this name already exists' })
        return
      }
      res.json(raced)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (isPrismaError(error, 'P2002')) {
      return res.status(409).json({ error: 'A supplier with this name already exists' })
    }
    if (isPrismaError(error, 'P2025')) {
      return notFound(res)
    }
    console.error('Error creating supplier:', error)
    res.status(500).json({ error: 'Failed to create supplier' })
  }
})

// PUT update supplier
router.put('/:id', async (req, res) => {
  try {
    const id = supplierIdParamSchema.parse(req.params.id)
    const data = supplierUpdateBodySchema.parse(req.body)
    const supplier = await prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id } })
      if (!existing) return null
      if (data.name !== undefined) {
        const conflicting = await tx.supplier.findUnique({ where: { name: data.name } })
        if (conflicting && conflicting.id !== existing.id) {
          throw new Error('SUPPLIER_NAME_CONFLICT')
        }
      }
      const updated = await tx.supplier.update({
        where: { id },
        data: { ...(data.name !== undefined && { name: data.name }) },
      })

      await writeSettingsAudit(tx, {
        settingType: 'SUPPLIER',
        settingId: updated.id,
        action: 'UPDATE',
        before: supplierSnapshot(existing),
        after: supplierSnapshot(updated),
      })

      return updated
    })
    if (!supplier) {
      notFound(res)
      return
    }
    res.json(supplier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (isPrismaError(error, 'P2025')) {
      return notFound(res)
    }
    if (error instanceof Error && error.message === 'SUPPLIER_NAME_CONFLICT') {
      res.status(409).json({ error: 'Supplier name is already in use', field: 'name' })
      return
    }
    if (isPrismaError(error, 'P2002')) {
      res.status(409).json({ error: 'Supplier name is already in use', field: 'name' })
      return
    }
    console.error('Error updating supplier:', error)
    res.status(500).json({ error: 'Failed to update supplier' })
  }
})

// DELETE (soft) supplier
router.delete('/:id', async (req, res) => {
  try {
    const id = supplierIdParamSchema.parse(req.params.id)
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.supplier.findUnique({ where: { id } })
      if (!before) return { kind: 'missing' as const }

      const changed = await tx.supplier.updateMany({
        where: { id, isActive: true },
        data: { isActive: false },
      })
      const current = await tx.supplier.findUnique({ where: { id } })
      if (!current) return { kind: 'missing' as const }
      if (changed.count === 0) return { kind: 'unchanged' as const }

      await writeSettingsAudit(tx, {
        settingType: 'SUPPLIER',
        settingId: current.id,
        action: 'ARCHIVE',
        before: supplierSnapshot(before),
        after: supplierSnapshot(current),
      })

      return { kind: 'changed' as const }
    })

    if (result.kind === 'missing') {
      notFound(res)
      return
    }
    res.status(204).send()
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (isPrismaError(error, 'P2025')) {
      return notFound(res)
    }
    console.error('Error deleting supplier:', error)
    res.status(500).json({ error: 'Failed to delete supplier' })
  }
})

// POST restore supplier
router.post('/:id/restore', async (req, res) => {
  try {
    const id = supplierIdParamSchema.parse(req.params.id)
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.supplier.findUnique({ where: { id } })
      if (!before) return { kind: 'missing' as const }

      const changed = await tx.supplier.updateMany({
        where: { id, isActive: false },
        data: { isActive: true },
      })
      const current = await tx.supplier.findUnique({ where: { id } })
      if (!current) return { kind: 'missing' as const }
      if (changed.count === 0) return { kind: 'unchanged' as const, item: current }

      await writeSettingsAudit(tx, {
        settingType: 'SUPPLIER',
        settingId: current.id,
        action: 'RESTORE',
        before: supplierSnapshot(before),
        after: supplierSnapshot(current),
      })

      return { kind: 'changed' as const, item: current }
    })

    if (result.kind === 'missing') {
      notFound(res)
      return
    }
    res.json(result.item)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    if (isPrismaError(error, 'P2025')) {
      return notFound(res)
    }
    console.error('Error restoring supplier:', error)
    res.status(500).json({ error: 'Failed to restore supplier' })
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
