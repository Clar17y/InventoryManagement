import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import {
  hamperVariantCreateBodySchema,
  hamperVariantUpdateBodySchema,
  hampersCreateBodySchema,
  hampersListQuerySchema,
  hampersUpdateBodySchema,
} from '#contracts/routes/hampers'
import {
  calculateAvailabilityMap,
  calculateVariantAvailabilityMap,
  loadAvailabilityInputs,
} from '../../lib/hampers/availabilityBatch'
import { listHampers } from '../../lib/hampers/list'

const router = Router()

// GET all hampers with availability
router.get('/', async (req, res) => {
  try {
    const query = hampersListQuerySchema.parse(req.query)
    const result = await listHampers(query)
    res.json({
      items: result.items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / query.pageSize),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error fetching hampers:', error)
    res.status(500).json({ error: 'Failed to fetch hampers' })
  }
})

// GET single hamper with detailed availability
router.get('/:id', async (req, res) => {
  try {
    const hamper = await prisma.hamper.findUnique({
      where: { id: req.params.id },
      include: {
        requirements: {
          include: {
            category: {
              include: {
                products: {
                  where: { isActive: true },
                  include: {
                    lots: {
                      where: { remaining: { gt: 0 } },
                      select: { remaining: true, unitCost: true },
                    },
                  },
                },
              },
            },
          },
        },
        variants: {
          where: { isActive: true },
          include: {
            mappings: {
              orderBy: { priority: 'asc' },
              include: {
                category: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    lots: {
                      where: { remaining: { gt: 0 } },
                      select: { remaining: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!hamper) {
      return res.status(404).json({ error: 'Hamper not found' })
    }

    // Calculate detailed availability per requirement
    const requirementsWithStock = hamper.requirements.map((req) => {
      const categoryStock = req.category.products.reduce((sum, product) => {
        const productStock = product.lots.reduce(
          (lotSum, lot) => lotSum + Number(lot.remaining),
          0
        )
        return sum + productStock
      }, 0)

      const canFulfill = Math.floor(categoryStock / Number(req.quantity))

      // Calculate average cost for this category
      let totalCostWeighted = 0
      let totalQuantity = 0
      req.category.products.forEach((product) => {
        product.lots.forEach((lot) => {
          totalCostWeighted += Number(lot.remaining) * Number(lot.unitCost)
          totalQuantity += Number(lot.remaining)
        })
      })
      const avgCost = totalQuantity > 0 ? totalCostWeighted / totalQuantity : 0

      return {
        id: req.id,
        category: { id: req.category.id, name: req.category.name },
        quantityRequired: Number(req.quantity),
        isOptional: req.isOptional,
        availableStock: categoryStock,
        canFulfill,
        estimatedCost: avgCost * Number(req.quantity),
      }
    })

    const estimatedCost = requirementsWithStock.reduce(
      (sum, r) => sum + r.estimatedCost,
      0
    )

    const availabilityInputs = await loadAvailabilityInputs([hamper.id])
    const canMake = calculateAvailabilityMap(availabilityInputs).get(hamper.id) ?? 0
    const variantAvailabilityByHamper = hamper.hasVariants
      ? calculateVariantAvailabilityMap(availabilityInputs).get(hamper.id) ?? []
      : []

    // Calculate variant availability if hasVariants
    const variantAvailability = hamper.hasVariants
      ? hamper.variants.map((variant) => {
        const summary = variantAvailabilityByHamper.find((item) => item.variantId === variant.id)
        return {
          variantId: variant.id,
          name: variant.name,
          etsySku: variant.etsySku,
          sellingPrice: variant.sellingPrice ? Number(variant.sellingPrice) : null,
          etsyIsEnabled: variant.etsyIsEnabled,
          indicativeQuantity: variant.indicativeQuantity,
          canMake: summary?.canMake ?? 0,
          mappings: variant.mappings.map((mapping) => {
            const stock = mapping.product.lots?.reduce(
              (sum: number, lot: { remaining: unknown }) => sum + Number(lot.remaining),
              0,
            ) ?? 0
            return {
              categoryId: mapping.categoryId,
              productId: mapping.productId,
              priority: mapping.priority,
              category: mapping.category,
              product: { id: mapping.product.id, name: mapping.product.name },
              stock,
            }
          }),
        }
      })
      : undefined

    res.json({
      ...hamper,
      requirements: requirementsWithStock,
      canMake,
      estimatedCost,
      estimatedMargin: Number(hamper.sellingPrice) - estimatedCost,
      variantAvailability,
    })
  } catch (error) {
    console.error('Error fetching hamper:', error)
    res.status(500).json({ error: 'Failed to fetch hamper' })
  }
})

// POST create hamper
router.post('/', async (req, res) => {
  try {
    const data = hampersCreateBodySchema.parse(req.body)

    const hamper = await prisma.hamper.create({
      data: {
        name: data.name,
        sellingPrice: data.sellingPrice,
        etsyListingId: data.etsyListingId,
        etsyIsEnabled: data.etsyIsEnabled,
        indicativeQuantity: data.indicativeQuantity,
        hasVariants: data.hasVariants,
        requirements: {
          create: data.requirements.map((r) => ({
            categoryId: r.categoryId,
            quantity: r.quantity,
            isOptional: r.isOptional,
          })),
        },
      },
      include: {
        requirements: {
          include: { category: true },
        },
      },
    })

    res.status(201).json(hamper)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating hamper:', error)
    res.status(500).json({ error: 'Failed to create hamper' })
  }
})

// PUT update hamper
router.put('/:id', async (req, res) => {
  try {
    const data = hampersUpdateBodySchema.parse(req.body)

    // If requirements are being updated, delete old ones and create new
    if (data.requirements) {
      await prisma.hamperRequirement.deleteMany({
        where: { hamperId: req.params.id },
      })
    }

    const hamper = await prisma.hamper.update({
      where: { id: req.params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.sellingPrice && { sellingPrice: data.sellingPrice }),
        ...(data.etsyListingId !== undefined && { etsyListingId: data.etsyListingId }),
        ...(data.etsyIsEnabled !== undefined && { etsyIsEnabled: data.etsyIsEnabled }),
        ...(data.indicativeQuantity !== undefined && { indicativeQuantity: data.indicativeQuantity }),
        ...(data.hasVariants !== undefined && { hasVariants: data.hasVariants }),
        ...(data.requirements && data.requirements.length > 0 && {
          requirements: {
            create: data.requirements.map((r) => ({
              categoryId: r.categoryId,
              quantity: r.quantity,
              isOptional: r.isOptional,
            })),
          },
        }),
      },
      include: {
        requirements: {
          include: { category: true },
        },
      },
    })

    res.json(hamper)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating hamper:', error)
    res.status(500).json({ error: 'Failed to update hamper' })
  }
})

// DELETE (soft delete) hamper
router.delete('/:id', async (req, res) => {
  try {
    await prisma.$transaction([
      prisma.hamperVariant.updateMany({
        where: { hamperId: req.params.id },
        data: { isActive: false },
      }),
      prisma.hamper.update({
        where: { id: req.params.id },
        data: { isActive: false },
      }),
    ])
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting hamper:', error)
    res.status(500).json({ error: 'Failed to delete hamper' })
  }
})

// ============ VARIANT ENDPOINTS ============

// GET all variants for a hamper
router.get('/:id/variants', async (req, res) => {
  try {
    const variants = await prisma.hamperVariant.findMany({
      where: { hamperId: req.params.id, isActive: true },
      include: {
        mappings: {
          orderBy: { priority: 'asc' },
          include: {
            category: true,
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const availabilityInputs = await loadAvailabilityInputs([req.params.id])
    const variantAvailability = calculateVariantAvailabilityMap(availabilityInputs).get(req.params.id) ?? []
    const variantsWithAvailability = variants.map((variant) => ({
      ...variant,
      canMake: variantAvailability.find((item) => item.variantId === variant.id)?.canMake ?? 0,
    }))

    res.json(variantsWithAvailability)
  } catch (error) {
    console.error('Error fetching variants:', error)
    res.status(500).json({ error: 'Failed to fetch variants' })
  }
})

// POST create variant
router.post('/:id/variants', async (req, res) => {
  try {
    const data = hamperVariantCreateBodySchema.parse(req.body)
    const hamperId = req.params.id

    // Verify hamper exists
    const hamper = await prisma.hamper.findUnique({
      where: { id: hamperId },
      include: {
        requirements: {
          include: { category: true },
        },
      },
    })

    if (!hamper) {
      return res.status(404).json({ error: 'Hamper not found' })
    }

    // Build maps for validation
    const requirementMap = new Map(hamper.requirements.map((r) => [r.categoryId, r]))

    // Group mappings by category for validation and priority normalization
    const mappingsByCategory = new Map<string, typeof data.mappings>()
    for (const mapping of data.mappings) {
      const existing = mappingsByCategory.get(mapping.categoryId) || []
      mappingsByCategory.set(mapping.categoryId, [...existing, mapping])
    }

    // Validate mappings
    for (const mapping of data.mappings) {
      const requirement = requirementMap.get(mapping.categoryId)
      if (!requirement) {
        return res.status(400).json({
          error: `Category ${mapping.categoryId} is not a requirement for this hamper`,
        })
      }

      // Check for duplicate products within the same category
      const catMappings = mappingsByCategory.get(mapping.categoryId) || []
      const productIds = catMappings.map((m) => m.productId)
      if (new Set(productIds).size !== productIds.length) {
        return res.status(400).json({
          error: `Duplicate product in category "${requirement.category.name}"`,
        })
      }

      // Validate product belongs to category
      const product = await prisma.product.findUnique({
        where: { id: mapping.productId },
        select: { categoryId: true, name: true },
      })
      if (!product) {
        return res.status(400).json({ error: `Product ${mapping.productId} not found` })
      }
      if (product.categoryId !== mapping.categoryId) {
        return res.status(400).json({
          error: `Product "${product.name}" does not belong to category "${requirement.category.name}"`,
        })
      }
    }

    // Normalize priorities to 1..n per category
    const normalizedMappings: { categoryId: string; productId: string; priority: number }[] = []
    for (const catMappings of mappingsByCategory.values()) {
      const sorted = [...catMappings].sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1))
      sorted.forEach((m, i) => normalizedMappings.push({
        categoryId: m.categoryId,
        productId: m.productId,
        priority: i + 1,
      }))
    }

    const variant = await prisma.hamperVariant.create({
      data: {
        hamperId,
        name: data.name,
        sellingPrice: data.sellingPrice,
        etsySku: data.etsySku,
        etsyIsEnabled: data.etsyIsEnabled,
        indicativeQuantity: data.indicativeQuantity,
        mappings: {
          create: normalizedMappings,
        },
      },
      include: {
        mappings: {
          orderBy: { priority: 'asc' },
          include: {
            category: true,
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })

    // Enable hasVariants on hamper if not already
    if (!hamper.hasVariants) {
      await prisma.hamper.update({
        where: { id: hamperId },
        data: { hasVariants: true },
      })
    }

    const availabilityInputs = await loadAvailabilityInputs([hamperId])
    const variantAvailability = calculateVariantAvailabilityMap(availabilityInputs).get(hamperId) ?? []
    res.status(201).json({
      ...variant,
      canMake: variantAvailability.find((item) => item.variantId === variant.id)?.canMake ?? 0,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating variant:', error)
    res.status(500).json({ error: 'Failed to create variant' })
  }
})

// PUT update variant
router.put('/:id/variants/:variantId', async (req, res) => {
  try {
    const data = hamperVariantUpdateBodySchema.parse(req.body)

    let normalizedMappings: { categoryId: string; productId: string; priority: number }[] | undefined

    // Validate and normalize mappings if being updated
    if (data.mappings) {
      const hamper = await prisma.hamper.findUnique({
        where: { id: req.params.id },
        include: { requirements: { include: { category: true } } },
      })

      if (!hamper) {
        return res.status(404).json({ error: 'Hamper not found' })
      }

      const requirementMap = new Map(hamper.requirements.map((r) => [r.categoryId, r]))

      // Group mappings by category for validation and priority normalization
      const mappingsByCategory = new Map<string, typeof data.mappings>()
      for (const mapping of data.mappings) {
        const existing = mappingsByCategory.get(mapping.categoryId) || []
        mappingsByCategory.set(mapping.categoryId, [...existing, mapping])
      }

      for (const mapping of data.mappings) {
        const requirement = requirementMap.get(mapping.categoryId)
        if (!requirement) {
          return res.status(400).json({
            error: `Category ${mapping.categoryId} is not a requirement for this hamper`,
          })
        }

        // Check for duplicate products within the same category
        const catMappings = mappingsByCategory.get(mapping.categoryId) || []
        const productIds = catMappings.map((m) => m.productId)
        if (new Set(productIds).size !== productIds.length) {
          return res.status(400).json({
            error: `Duplicate product in category "${requirement.category.name}"`,
          })
        }

        const product = await prisma.product.findUnique({
          where: { id: mapping.productId },
          select: { categoryId: true, name: true },
        })
        if (!product) {
          return res.status(400).json({ error: `Product ${mapping.productId} not found` })
        }
        if (product.categoryId !== mapping.categoryId) {
          return res.status(400).json({
            error: `Product "${product.name}" does not belong to category "${requirement.category.name}"`,
          })
        }
      }

      // Normalize priorities to 1..n per category
      normalizedMappings = []
      for (const catMappings of mappingsByCategory.values()) {
        const sorted = [...catMappings].sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1))
        sorted.forEach((m, i) => normalizedMappings!.push({
          categoryId: m.categoryId,
          productId: m.productId,
          priority: i + 1,
        }))
      }

      // Delete old mappings before creating new ones
      await prisma.hamperVariantMapping.deleteMany({
        where: { variantId: req.params.variantId },
      })
    }

    const variant = await prisma.hamperVariant.update({
      where: { id: req.params.variantId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.sellingPrice !== undefined && { sellingPrice: data.sellingPrice }),
        ...(data.etsySku !== undefined && { etsySku: data.etsySku }),
        ...(data.etsyIsEnabled !== undefined && { etsyIsEnabled: data.etsyIsEnabled }),
        ...(data.indicativeQuantity !== undefined && { indicativeQuantity: data.indicativeQuantity }),
        ...(normalizedMappings && {
          mappings: {
            create: normalizedMappings,
          },
        }),
      },
      include: {
        mappings: {
          orderBy: { priority: 'asc' },
          include: {
            category: true,
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })

    const availabilityInputs = await loadAvailabilityInputs([req.params.id])
    const variantAvailability = calculateVariantAvailabilityMap(availabilityInputs).get(req.params.id) ?? []
    res.json({
      ...variant,
      canMake: variantAvailability.find((item) => item.variantId === variant.id)?.canMake ?? 0,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating variant:', error)
    res.status(500).json({ error: 'Failed to update variant' })
  }
})

// DELETE (soft delete) variant
router.delete('/:id/variants/:variantId', async (req, res) => {
  try {
    await prisma.hamperVariant.update({
      where: { id: req.params.variantId },
      data: { isActive: false },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting variant:', error)
    res.status(500).json({ error: 'Failed to delete variant' })
  }
})

export default router

