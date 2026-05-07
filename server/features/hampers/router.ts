import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import {
  hamperVariantCreateBodySchema,
  hamperVariantUpdateBodySchema,
  hampersCreateBodySchema,
  hampersUpdateBodySchema,
} from '#contracts/routes/hampers'

const router = Router()

type VariantAvailabilitySummary = {
  variantId: string
  name: string
  etsySku: string | null
  sellingPrice: number | null
  etsyIsEnabled: boolean
  indicativeQuantity: number | null
  canMake: number
}

// Calculate how many hampers can be made based on stock (aggregated across category)
async function calculateAvailability(hamperId: string): Promise<number> {
  const hamper = await prisma.hamper.findUnique({
    where: { id: hamperId },
    include: {
      requirements: {
        where: { isOptional: false },
        include: {
          category: {
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
          },
        },
      },
    },
  })

  if (!hamper || hamper.requirements.length === 0) return 0

  const availabilityPerRequirement = hamper.requirements.map((req) => {
    // Sum all stock across all products in the category
    const categoryStock = req.category.products.reduce((sum, product) => {
      const productStock = product.lots.reduce(
        (lotSum, lot) => lotSum + Number(lot.remaining),
        0
      )
      return sum + productStock
    }, 0)

    // How many times can we fulfill this requirement
    return Math.floor(categoryStock / Number(req.quantity))
  })

  // The hamper availability is the minimum across all requirements
  return Math.min(...availabilityPerRequirement)
}

// Calculate availability for a specific variant
// - For optional requirements: only check if variant has mappings for that category
// - Multiple mappings per category = alternatives (any ONE of these products)
// - Availability = sum of stock across all alternatives / quantity required
async function calculateVariantAvailability(variantId: string): Promise<number> {
  const variant = await prisma.hamperVariant.findUnique({
    where: { id: variantId },
    include: {
      hamper: {
        include: {
          requirements: {
            // Include ALL requirements (including optional) - we filter by mappings below
            include: {
              category: {
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
              },
            },
          },
        },
      },
      mappings: {
        orderBy: { priority: 'asc' },
        include: {
          category: true,
          product: {
            include: {
              lots: {
                where: { remaining: { gt: 0 } },
                select: { remaining: true },
              },
            },
          },
        },
      },
    },
  })

  if (!variant || !variant.hamper) return 0

  const requirements = variant.hamper.requirements
  if (requirements.length === 0) return 0

  // Group mappings by categoryId (multiple mappings = alternatives)
  const mappingsByCategory = new Map<string, typeof variant.mappings>()
  for (const mapping of variant.mappings) {
    const existing = mappingsByCategory.get(mapping.categoryId) || []
    mappingsByCategory.set(mapping.categoryId, [...existing, mapping])
  }

  const availabilityPerRequirement: number[] = []

  for (const req of requirements) {
    const categoryMappings = mappingsByCategory.get(req.categoryId) || []
    const hasMappings = categoryMappings.length > 0

    // Optional requirements: skip if no mappings for this variant
    if (req.isOptional && !hasMappings) {
      continue
    }

    if (hasMappings) {
      // ALTERNATIVES MODEL: Sum stock across all alternative products
      const totalAlternativeStock = categoryMappings.reduce((sum, mapping) => {
        return sum + mapping.product.lots.reduce(
          (lotSum: number, lot: { remaining: unknown }) => lotSum + Number(lot.remaining),
          0
        )
      }, 0)
      // How many can we make from total alternative pool?
      availabilityPerRequirement.push(Math.floor(totalAlternativeStock / Number(req.quantity)))
    } else {
      // Non-optional, no mappings: fall back to category-wide aggregation
      const categoryStock = req.category.products.reduce((sum: number, product) => {
        const productStock = product.lots.reduce(
          (lotSum: number, lot: { remaining: unknown }) => lotSum + Number(lot.remaining),
          0
        )
        return sum + productStock
      }, 0)
      availabilityPerRequirement.push(Math.floor(categoryStock / Number(req.quantity)))
    }
  }

  if (availabilityPerRequirement.length === 0) return 0
  return Math.min(...availabilityPerRequirement)
}

// Get variant availability for all variants of a hamper
async function getVariantAvailabilities(hamperId: string): Promise<VariantAvailabilitySummary[]> {
  const variants = await prisma.hamperVariant.findMany({
    where: { hamperId, isActive: true },
    orderBy: { name: 'asc' },
  })

  return Promise.all(
    variants.map(async (v) => ({
      variantId: v.id,
      name: v.name,
      etsySku: v.etsySku,
      sellingPrice: v.sellingPrice ? Number(v.sellingPrice) : null,
      etsyIsEnabled: v.etsyIsEnabled,
      indicativeQuantity: v.indicativeQuantity,
      canMake: await calculateVariantAvailability(v.id),
    }))
  )
}

// GET all hampers with availability
router.get('/', async (_, res) => {
  try {
    const hampers = await prisma.hamper.findMany({
      where: { isActive: true },
      include: {
        requirements: {
          include: { category: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Calculate availability for each hamper
    const hampersWithAvailability = await Promise.all(
      hampers.map(async (hamper) => {
        const canMake = await calculateAvailability(hamper.id)
        const variantAvailability = hamper.hasVariants
          ? await getVariantAvailabilities(hamper.id)
          : undefined

        return {
          ...hamper,
          canMake,
          variantAvailability,
        }
      })
    )

    res.json(hampersWithAvailability)
  } catch (error) {
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

    const nonOptionalRequirements = requirementsWithStock.filter((r) => !r.isOptional)
    const canMake = nonOptionalRequirements.length > 0
      ? Math.min(...nonOptionalRequirements.map((r) => r.canFulfill))
      : 0

    const estimatedCost = requirementsWithStock.reduce(
      (sum, r) => sum + r.estimatedCost,
      0
    )

    // Calculate variant availability if hasVariants
    const variantAvailability = hamper.hasVariants
      ? await Promise.all(
        hamper.variants.map(async (v) => ({
          variantId: v.id,
          name: v.name,
          etsySku: v.etsySku,
          sellingPrice: v.sellingPrice ? Number(v.sellingPrice) : null,
          etsyIsEnabled: v.etsyIsEnabled,
          indicativeQuantity: v.indicativeQuantity,
          canMake: await calculateVariantAvailability(v.id),
          mappings: v.mappings.map((m) => {
            const stock = m.product.lots?.reduce(
              (sum: number, lot: { remaining: unknown }) => sum + Number(lot.remaining),
              0
            ) ?? 0
            return {
              categoryId: m.categoryId,
              productId: m.productId,
              priority: m.priority,
              category: m.category,
              product: { id: m.product.id, name: m.product.name },
              stock,
            }
          }),
        }))
      )
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

    // Calculate availability for each variant
    const variantsWithAvailability = await Promise.all(
      variants.map(async (v) => ({
        ...v,
        canMake: await calculateVariantAvailability(v.id),
      }))
    )

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

    res.status(201).json({
      ...variant,
      canMake: await calculateVariantAvailability(variant.id),
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

    res.json({
      ...variant,
      canMake: await calculateVariantAvailability(variant.id),
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

