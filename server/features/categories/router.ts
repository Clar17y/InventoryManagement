import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { PickRule } from '@prisma/client'
import {
  categoriesCreateBodySchema,
  categoriesUpdateBodySchema,
} from '#contracts/routes/categories'

const router = Router()

// GET all categories
router.get('/', async (_, res) => {
  try {
    const categories = await prisma.componentCategory.findMany({
      where: { isActive: true },
      include: {
        // Count only active products so the badge matches the soft-delete-filtered list.
        _count: { select: { products: { where: { isActive: true } } } },
      },
      orderBy: { name: 'asc' },
    })
    res.json(categories)
  } catch (error) {
    console.error('Error fetching categories:', error)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// GET single category with products
router.get('/:id', async (req, res) => {
  try {
    const category = await prisma.componentCategory.findUnique({
      where: { id: req.params.id },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    })
    if (!category) {
      return res.status(404).json({ error: 'Category not found' })
    }
    res.json(category)
  } catch (error) {
    console.error('Error fetching category:', error)
    res.status(500).json({ error: 'Failed to fetch category' })
  }
})

// POST create category
router.post('/', async (req, res) => {
  try {
    const data = categoriesCreateBodySchema.parse(req.body)
    const category = await prisma.componentCategory.create({
      data: {
        name: data.name,
        description: data.description,
        pickRule: data.pickRule as PickRule,
      },
    })
    res.status(201).json(category)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating category:', error)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// PUT update category
router.put('/:id', async (req, res) => {
  try {
    const data = categoriesUpdateBodySchema.parse(req.body)
    const category = await prisma.componentCategory.update({
      where: { id: req.params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.pickRule && { pickRule: data.pickRule as PickRule }),
      },
    })
    res.json(category)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating category:', error)
    res.status(500).json({ error: 'Failed to update category' })
  }
})

// DELETE (soft delete) category
router.delete('/:id', async (req, res) => {
  try {
    await prisma.componentCategory.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting category:', error)
    res.status(500).json({ error: 'Failed to delete category' })
  }
})

export default router
