import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const router = Router()

const requirementSchema = z.object({
  categoryId: z.string().cuid(),
  quantity: z.number().positive(),
  isOptional: z.boolean().default(false),
})

const createHamperSchema = z.object({
  name: z.string().min(1).max(200),
  sellingPrice: z.number().positive(),
  etsyListingId: z.string().max(50).optional().nullable().transform(v => v === "" ? null : v),
  hasVariants: z.boolean().default(false),
  requirements: z.array(requirementSchema).min(1),
})

const updateHamperSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sellingPrice: z.number().positive().optional(),
  etsyListingId: z.string().max(50).optional().nullable().transform(v => v === "" ? null : v),
  hasVariants: z.boolean().optional(),
  requirements: z.array(requirementSchema).optional(),
})

const variantMappingSchema = z.object({
  categoryId: z.string().cuid(),
  productId: z.string().cuid(),
})

const createVariantSchema = z.object({
  name: z.string().min(1).max(100),
  sellingPrice: z.union([z.number(), z.string()]).optional().nullable().transform(v => {
    if (v === null || v === undefined || v === '') return null;
    const num = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(num) ? null : num;
  }),
  etsySku: z.string().max(50).optional().nullable().transform(v => v === "" ? null : v),
  mappings: z.array(variantMappingSchema).min(1),
})

const updateVariantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sellingPrice: z.union([z.number(), z.string()]).optional().nullable().transform(v => {
    if (v === null || v === undefined || v === '') return null;
    const num = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(num) ? null : num;
  }),
  etsySku: z.string().max(50).optional().nullable().transform(v => v === "" ? null : v),
  mappings: z.array(variantMappingSchema).optional(),
})

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

// Calculate availability for a specific variant (uses mapped products for mapped categories,
// falls back to category-wide aggregation for unmapped requirements)
async function calculateVariantAvailability(variantId: string): Promise<number> {
  const variant = await prisma.hamperVariant.findUnique({
    where: { id: variantId },
    include: {
      hamper: {
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
      },
      mappings: {
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

  // Create a map of categoryId -> mapped product
  const mappedProducts = new Map(variant.mappings.map((m) => [m.categoryId, m]))

  const availabilityPerRequirement = requirements.map((req) => {
    const mapping = mappedProducts.get(req.categoryId)

    if (mapping) {
      // Use mapped product's stock only
      const productStock = mapping.product.lots.reduce(
        (sum: number, lot: { remaining: unknown }) => sum + Number(lot.remaining),
        0
      )
      return Math.floor(productStock / Number(req.quantity))
    } else {
      // Fall back to category-wide aggregation for unmapped requirements
      const categoryStock = req.category.products.reduce((sum: number, product) => {
        const productStock = product.lots.reduce(
          (lotSum: number, lot: { remaining: unknown }) => lotSum + Number(lot.remaining),
          0
        )
        return sum + productStock
      }, 0)
      return Math.floor(categoryStock / Number(req.quantity))
    }
  })

  if (availabilityPerRequirement.length === 0) return 0
  return Math.min(...availabilityPerRequirement)
}

// Get variant availability for all variants of a hamper
async function getVariantAvailabilities(hamperId: string): Promise<{ variantId: string; name: string; etsySku: string | null; sellingPrice: number | null; canMake: number }[]> {
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
              include: {
                category: true,
                product: {
                  select: { id: true, name: true },
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

    const canMake = Math.min(
      ...requirementsWithStock
        .filter((r) => !r.isOptional)
        .map((r) => r.canFulfill)
    )

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
          canMake: await calculateVariantAvailability(v.id),
          mappings: v.mappings.map((m) => ({
            categoryId: m.categoryId,
            productId: m.productId,
            product: m.product,
          })),
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
    const data = createHamperSchema.parse(req.body)

    const hamper = await prisma.hamper.create({
      data: {
        name: data.name,
        sellingPrice: data.sellingPrice,
        etsyListingId: data.etsyListingId,
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
    const data = updateHamperSchema.parse(req.body)

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
        ...(data.hasVariants !== undefined && { hasVariants: data.hasVariants }),
        ...(data.requirements && {
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
    await prisma.hamper.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })
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
    const data = createVariantSchema.parse(req.body)
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

    // Build a map of categoryId -> category for validation
    const categoryMap = new Map(hamper.requirements.map((r) => [r.categoryId, r.category]))

    // Validate that all mappings reference valid categories for this hamper
    // and that the product belongs to that category
    for (const mapping of data.mappings) {
      if (!categoryMap.has(mapping.categoryId)) {
        return res.status(400).json({
          error: `Category ${mapping.categoryId} is not a requirement for this hamper`,
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
          error: `Product "${product.name}" does not belong to category "${categoryMap.get(mapping.categoryId)?.name}"`,
        })
      }
    }

    const variant = await prisma.hamperVariant.create({
      data: {
        hamperId,
        name: data.name,
        sellingPrice: data.sellingPrice,
        etsySku: data.etsySku,
        mappings: {
          create: data.mappings.map((m) => ({
            categoryId: m.categoryId,
            productId: m.productId,
          })),
        },
      },
      include: {
        mappings: {
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
    const data = updateVariantSchema.parse(req.body)

    // If mappings are being updated, delete old ones and create new
    if (data.mappings) {
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
        ...(data.mappings && {
          mappings: {
            create: data.mappings.map((m) => ({
              categoryId: m.categoryId,
              productId: m.productId,
            })),
          },
        }),
      },
      include: {
        mappings: {
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

