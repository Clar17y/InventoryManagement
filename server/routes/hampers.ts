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
  etsyListingId: z.string().max(50).optional(),
  requirements: z.array(requirementSchema).min(1),
})

const updateHamperSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sellingPrice: z.number().positive().optional(),
  etsyListingId: z.string().max(50).optional(),
  requirements: z.array(requirementSchema).optional(),
})

// Calculate how many hampers can be made based on stock
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
      hampers.map(async (hamper) => ({
        ...hamper,
        canMake: await calculateAvailability(hamper.id),
      }))
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

    res.json({
      ...hamper,
      requirements: requirementsWithStock,
      canMake,
      estimatedCost,
      estimatedMargin: Number(hamper.sellingPrice) - estimatedCost,
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

export default router
