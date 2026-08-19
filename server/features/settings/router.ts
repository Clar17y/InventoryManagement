import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  includeArchivedQuerySchema,
  etsyFeeCreateBodySchema,
  packagingOverheadCreateBodySchema,
  packagingOverheadUpdateBodySchema,
  postageTierCreateBodySchema,
  postageTierUpdateBodySchema,
} from '#contracts/routes/settings'
import { writeSettingsAudit } from '../../lib/settingsAudit'

const router = Router()

function isPrismaError(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

async function serializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (!isPrismaError(error, 'P2034') || attempt === 2) throw error
    }
  }
  throw new Error('Unreachable transaction retry')
}

function postageSnapshot(tier: {
  etsyCharge: { toString(): string }
  actualCost: { toString(): string }
  label: string | null
  isActive: boolean
}): Prisma.InputJsonObject {
  return {
    etsyCharge: tier.etsyCharge.toString(),
    actualCost: tier.actualCost.toString(),
    label: tier.label,
    isActive: tier.isActive,
  }
}

function packagingSnapshot(overhead: {
  name: string
  costPerOrder: { toString(): string }
  isActive: boolean
  effectiveFrom: Date
  effectiveTo: Date | null
}): Prisma.InputJsonObject {
  return {
    name: overhead.name,
    costPerOrder: overhead.costPerOrder.toString(),
    isActive: overhead.isActive,
    effectiveFrom: overhead.effectiveFrom.toISOString(),
    effectiveTo: overhead.effectiveTo?.toISOString() ?? null,
  }
}

function etsyFeeSnapshot(config: {
  name: string
  transactionFee: { toString(): string }
  regulatoryFee: { toString(): string }
  paymentFeePercent: { toString(): string }
  paymentFeeFixed: { toString(): string }
  vatRate: { toString(): string }
  listingFee: { toString(): string }
  isActive: boolean
}): Prisma.InputJsonObject {
  return {
    name: config.name,
    transactionFee: config.transactionFee.toString(),
    regulatoryFee: config.regulatoryFee.toString(),
    paymentFeePercent: config.paymentFeePercent.toString(),
    paymentFeeFixed: config.paymentFeeFixed.toString(),
    vatRate: config.vatRate.toString(),
    listingFee: config.listingFee.toString(),
    isActive: config.isActive,
  }
}

function validationFailed(error: unknown, res: Parameters<Parameters<typeof router.post>[1]>[1]): boolean {
  if (!(error instanceof z.ZodError)) return false
  res.status(400).json({ error: 'Validation failed', details: error.errors })
  return true
}

function notFound(res: Parameters<Parameters<typeof router.post>[1]>[1], message: string): void {
  res.status(404).json({ error: message })
}

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

    const config = await serializableTransaction(async (tx) => {
      await tx.etsyFeeConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false, effectiveTo: new Date() },
      })

      const created = await tx.etsyFeeConfig.create({
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

      await writeSettingsAudit(tx, {
        settingType: 'ETSY_FEE_CONFIG',
        settingId: created.id,
        action: 'CREATE',
        before: null,
        after: etsyFeeSnapshot(created),
      })

      return created
    })

    res.status(201).json(config)
  } catch (error) {
    if (validationFailed(error, res)) return
    console.error('Error creating Etsy fee config:', error)
    res.status(500).json({ error: 'Failed to create Etsy fee config' })
  }
})

router.get('/audit', async (_, res) => {
  try {
    const entries = await prisma.settingsAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json(entries)
  } catch (error) {
    console.error('Error fetching settings audit log:', error)
    res.status(500).json({ error: 'Failed to fetch settings audit log' })
  }
})

// === Packaging Overhead ===

// GET all packaging overheads
router.get('/packaging-overhead', async (req, res) => {
  try {
    const { includeArchived } = includeArchivedQuerySchema.parse(req.query)
    const overheads = await prisma.packagingOverhead.findMany({
      where: includeArchived ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    })

    const total = overheads
      .filter((overhead) => overhead.isActive)
      .reduce((sum, overhead) => sum + Number(overhead.costPerOrder), 0)

    res.json({ overheads, totalPerOrder: total })
  } catch (error) {
    if (validationFailed(error, res)) return
    console.error('Error fetching packaging overhead:', error)
    res.status(500).json({ error: 'Failed to fetch packaging overhead' })
  }
})

// POST create packaging overhead
router.post('/packaging-overhead', async (req, res) => {
  try {
    const data = packagingOverheadCreateBodySchema.parse(req.body)

    const overhead = await prisma.$transaction(async (tx) => {
      const created = await tx.packagingOverhead.create({
        data: {
          name: data.name,
          costPerOrder: data.costPerOrder,
        },
      })

      await writeSettingsAudit(tx, {
        settingType: 'PACKAGING_OVERHEAD',
        settingId: created.id,
        action: 'CREATE',
        before: null,
        after: packagingSnapshot(created),
      })

      return created
    })

    res.status(201).json(overhead)
  } catch (error) {
    if (validationFailed(error, res)) return
    console.error('Error creating packaging overhead:', error)
    res.status(500).json({ error: 'Failed to create packaging overhead' })
  }
})

// PUT update packaging overhead
router.put('/packaging-overhead/:id', async (req, res) => {
  try {
    const data = packagingOverheadUpdateBodySchema.parse(req.body)
    const existing = await prisma.packagingOverhead.findUnique({ where: { id: req.params.id } })
    if (!existing) {
      notFound(res, 'Packaging overhead not found')
      return
    }

    const overhead = await prisma.$transaction(async (tx) => {
      const updated = await tx.packagingOverhead.update({
        where: { id: req.params.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.costPerOrder !== undefined && { costPerOrder: data.costPerOrder }),
        },
      })

      await writeSettingsAudit(tx, {
        settingType: 'PACKAGING_OVERHEAD',
        settingId: updated.id,
        action: 'UPDATE',
        before: packagingSnapshot(existing),
        after: packagingSnapshot(updated),
      })

      return updated
    })

    res.json(overhead)
  } catch (error) {
    if (validationFailed(error, res)) return
    if (isPrismaError(error, 'P2025')) {
      notFound(res, 'Packaging overhead not found')
      return
    }
    console.error('Error updating packaging overhead:', error)
    res.status(500).json({ error: 'Failed to update packaging overhead' })
  }
})

// DELETE packaging overhead
router.delete('/packaging-overhead/:id', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.packagingOverhead.findUnique({ where: { id: req.params.id } })
      if (!before) return { kind: 'missing' as const }

      const changed = await tx.packagingOverhead.updateMany({
        where: { id: req.params.id, isActive: true },
        data: { isActive: false, effectiveTo: new Date() },
      })
      const current = await tx.packagingOverhead.findUnique({ where: { id: req.params.id } })
      if (!current) return { kind: 'missing' as const }
      if (changed.count === 0) return { kind: 'unchanged' as const, item: current }

      await writeSettingsAudit(tx, {
        settingType: 'PACKAGING_OVERHEAD',
        settingId: current.id,
        action: 'ARCHIVE',
        before: packagingSnapshot(before),
        after: packagingSnapshot(current),
      })
      return { kind: 'changed' as const }
    })
    if (result.kind === 'missing') {
      notFound(res, 'Packaging overhead not found')
      return
    }
    res.status(204).send()
  } catch (error) {
    if (isPrismaError(error, 'P2025')) {
      notFound(res, 'Packaging overhead not found')
      return
    }
    console.error('Error deleting packaging overhead:', error)
    res.status(500).json({ error: 'Failed to delete packaging overhead' })
  }
})

router.post('/packaging-overhead/:id/restore', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.packagingOverhead.findUnique({ where: { id: req.params.id } })
      if (!before) return { kind: 'missing' as const }

      const changed = await tx.packagingOverhead.updateMany({
        where: { id: req.params.id, isActive: false },
        data: { isActive: true, effectiveTo: null },
      })
      const current = await tx.packagingOverhead.findUnique({ where: { id: req.params.id } })
      if (!current) return { kind: 'missing' as const }
      if (changed.count === 0) return { kind: 'unchanged' as const, item: current }

      await writeSettingsAudit(tx, {
        settingType: 'PACKAGING_OVERHEAD',
        settingId: current.id,
        action: 'RESTORE',
        before: packagingSnapshot(before),
        after: packagingSnapshot(current),
      })

      return { kind: 'changed' as const, item: current }
    })
    if (result.kind === 'missing') {
      notFound(res, 'Packaging overhead not found')
      return
    }
    res.json(result.item)
  } catch (error) {
    if (isPrismaError(error, 'P2025')) {
      notFound(res, 'Packaging overhead not found')
      return
    }
    console.error('Error restoring packaging overhead:', error)
    res.status(500).json({ error: 'Failed to restore packaging overhead' })
  }
})

// === Postage Tiers ===

router.get('/postage-tiers', async (req, res) => {
  try {
    const { includeArchived } = includeArchivedQuerySchema.parse(req.query)
    const tiers = await prisma.postageTier.findMany({
      where: includeArchived ? undefined : { isActive: true },
      orderBy: { etsyCharge: 'asc' },
    })
    res.json(tiers)
  } catch (error) {
    if (validationFailed(error, res)) return
    console.error('Error fetching postage tiers:', error)
    res.status(500).json({ error: 'Failed to fetch postage tiers' })
  }
})

router.post('/postage-tiers', async (req, res) => {
  try {
    const data = postageTierCreateBodySchema.parse(req.body)
    const existing = await prisma.postageTier.findUnique({ where: { etsyCharge: data.etsyCharge } })

    if (existing) {
      if (existing.isActive) {
        const tier = await prisma.$transaction(async (tx) => {
          const updated = await tx.postageTier.update({
            where: { id: existing.id },
            data: { actualCost: data.actualCost, label: data.label, isActive: true },
          })
          await writeSettingsAudit(tx, {
            settingType: 'POSTAGE_TIER', settingId: updated.id, action: 'UPDATE',
            before: postageSnapshot(existing), after: postageSnapshot(updated),
          })
          return updated
        })
        res.json({ item: tier, outcome: 'updated' })
        return
      }

      const restored = await prisma.$transaction(async (tx) => {
        const changed = await tx.postageTier.updateMany({
          where: { id: existing.id, isActive: false },
          data: { actualCost: data.actualCost, label: data.label, isActive: true },
        })
        const current = await tx.postageTier.findUnique({ where: { id: existing.id } })
        if (!current) return null
        if (changed.count === 0) return { item: current, outcome: 'updated' as const }

        await writeSettingsAudit(tx, {
          settingType: 'POSTAGE_TIER', settingId: current.id, action: 'RESTORE',
          before: postageSnapshot(existing), after: postageSnapshot(current),
        })
        return { item: current, outcome: 'restored' as const }
      })
      if (!restored) {
        notFound(res, 'Postage tier not found')
        return
      }
      res.json(restored)
      return
    }

    try {
      const tier = await prisma.$transaction(async (tx) => {
        const created = await tx.postageTier.create({
          data: {
            etsyCharge: data.etsyCharge,
            actualCost: data.actualCost,
            label: data.label,
          },
        })

        await writeSettingsAudit(tx, {
          settingType: 'POSTAGE_TIER',
          settingId: created.id,
          action: 'CREATE',
          before: null,
          after: postageSnapshot(created),
        })

        return created
      })
      res.status(201).json({ item: tier, outcome: 'created' })
    } catch (error) {
      if (!isPrismaError(error, 'P2002')) throw error

      const raced = await prisma.$transaction(async (tx) => {
        const winner = await tx.postageTier.findUnique({ where: { etsyCharge: data.etsyCharge } })
        if (!winner) return null

        if (winner.isActive) {
          const updated = await tx.postageTier.update({
            where: { id: winner.id },
            data: { actualCost: data.actualCost, label: data.label, isActive: true },
          })
          await writeSettingsAudit(tx, {
            settingType: 'POSTAGE_TIER', settingId: updated.id, action: 'UPDATE',
            before: postageSnapshot(winner), after: postageSnapshot(updated),
          })
          return { item: updated, outcome: 'updated' as const }
        }

        const changed = await tx.postageTier.updateMany({
          where: { id: winner.id, isActive: false },
          data: { actualCost: data.actualCost, label: data.label, isActive: true },
        })
        const current = await tx.postageTier.findUnique({ where: { id: winner.id } })
        if (!current) return null
        if (changed.count === 0) return { item: current, outcome: 'updated' as const }

        await writeSettingsAudit(tx, {
          settingType: 'POSTAGE_TIER',
          settingId: current.id,
          action: 'RESTORE',
          before: postageSnapshot(winner),
          after: postageSnapshot(current),
        })
        return { item: current, outcome: 'restored' as const }
      })

      if (!raced) {
        res.status(409).json({ error: 'A tier with this Etsy charge already exists' })
        return
      }
      res.json(raced)
    }
  } catch (error) {
    if (validationFailed(error, res)) return
    if (isPrismaError(error, 'P2002')) {
      return res.status(409).json({ error: 'A tier with this Etsy charge already exists' })
    }
    console.error('Error creating postage tier:', error)
    res.status(500).json({ error: 'Failed to create postage tier' })
  }
})

router.put('/postage-tiers/:id', async (req, res) => {
  try {
    const data = postageTierUpdateBodySchema.parse(req.body)
    const existing = await prisma.postageTier.findUnique({ where: { id: req.params.id } })
    if (!existing) {
      notFound(res, 'Postage tier not found')
      return
    }

    if (data.etsyCharge !== undefined) {
      const conflicting = await prisma.postageTier.findUnique({ where: { etsyCharge: data.etsyCharge } })
      if (conflicting && conflicting.id !== existing.id) {
        return res.status(409).json({
          error: `Etsy charge £${Number(data.etsyCharge).toFixed(2)} is already used by another tier`,
          field: 'etsyCharge',
        })
      }
    }

    const tier = await prisma.$transaction(async (tx) => {
      const updated = await tx.postageTier.update({
        where: { id: req.params.id },
        data: {
          ...(data.etsyCharge !== undefined && { etsyCharge: data.etsyCharge }),
          ...(data.actualCost !== undefined && { actualCost: data.actualCost }),
          ...(data.label !== undefined && { label: data.label }),
        },
      })

      await writeSettingsAudit(tx, {
        settingType: 'POSTAGE_TIER',
        settingId: updated.id,
        action: 'UPDATE',
        before: postageSnapshot(existing),
        after: postageSnapshot(updated),
      })

      return updated
    })
    res.json(tier)
  } catch (error) {
    if (validationFailed(error, res)) return
    if (isPrismaError(error, 'P2025')) {
      notFound(res, 'Postage tier not found')
      return
    }
    if (isPrismaError(error, 'P2002')) {
      res.status(409).json({ error: 'A tier with this Etsy charge already exists', field: 'etsyCharge' })
      return
    }
    console.error('Error updating postage tier:', error)
    res.status(500).json({ error: 'Failed to update postage tier' })
  }
})

router.delete('/postage-tiers/:id', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.postageTier.findUnique({ where: { id: req.params.id } })
      if (!before) return { kind: 'missing' as const }

      const changed = await tx.postageTier.updateMany({
        where: { id: req.params.id, isActive: true },
        data: { isActive: false },
      })
      const current = await tx.postageTier.findUnique({ where: { id: req.params.id } })
      if (!current) return { kind: 'missing' as const }
      if (changed.count === 0) return { kind: 'unchanged' as const, item: current }

      await writeSettingsAudit(tx, {
        settingType: 'POSTAGE_TIER',
        settingId: current.id,
        action: 'ARCHIVE',
        before: postageSnapshot(before),
        after: postageSnapshot(current),
      })
      return { kind: 'changed' as const }
    })
    if (result.kind === 'missing') {
      notFound(res, 'Postage tier not found')
      return
    }
    res.status(204).send()
  } catch (error) {
    if (isPrismaError(error, 'P2025')) {
      notFound(res, 'Postage tier not found')
      return
    }
    console.error('Error deleting postage tier:', error)
    res.status(500).json({ error: 'Failed to delete postage tier' })
  }
})

router.post('/postage-tiers/:id/restore', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.postageTier.findUnique({ where: { id: req.params.id } })
      if (!before) return { kind: 'missing' as const }

      const changed = await tx.postageTier.updateMany({
        where: { id: req.params.id, isActive: false },
        data: { isActive: true },
      })
      const current = await tx.postageTier.findUnique({ where: { id: req.params.id } })
      if (!current) return { kind: 'missing' as const }
      if (changed.count === 0) return { kind: 'unchanged' as const, item: current }

      await writeSettingsAudit(tx, {
        settingType: 'POSTAGE_TIER',
        settingId: current.id,
        action: 'RESTORE',
        before: postageSnapshot(before),
        after: postageSnapshot(current),
      })

      return { kind: 'changed' as const, item: current }
    })
    if (result.kind === 'missing') {
      notFound(res, 'Postage tier not found')
      return
    }
    res.json(result.item)
  } catch (error) {
    if (isPrismaError(error, 'P2025')) {
      notFound(res, 'Postage tier not found')
      return
    }
    console.error('Error restoring postage tier:', error)
    res.status(500).json({ error: 'Failed to restore postage tier' })
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
