import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ExpenseCategory } from '@prisma/client'

const router = Router()

// Validation schemas
const expenseSchema = z.object({
  date: z.string().datetime().optional(),
  category: z.nativeEnum(ExpenseCategory),
  supplier: z.string().max(100).optional(),
  description: z.string().min(1).max(500),
  amountIncVat: z.number().nonnegative(),
  amountExcVat: z.number().nonnegative(),
})

const expenseUpdateSchema = expenseSchema.partial()

const listQuerySchema = z.object({
  category: z.nativeEnum(ExpenseCategory).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
})

// GET /expenses - List expenses with filters
router.get('/', async (req, res) => {
  try {
    const query = listQuerySchema.parse(req.query)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      isActive: true,
    }

    if (query.category) {
      where.category = query.category
    }

    if (query.startDate || query.endDate) {
      where.date = {}
      if (query.startDate) where.date.gte = new Date(query.startDate)
      if (query.endDate) where.date.lte = new Date(query.endDate)
    }

    // Search across description and supplier
    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim()
      where.OR = [
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { supplier: { contains: searchTerm, mode: 'insensitive' } },
      ]
    }

    const [expenses, total] = await Promise.all([
      prisma.businessExpense.findMany({
        where,
        orderBy: { date: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.businessExpense.count({ where }),
    ])

    res.json({ expenses, total, limit: query.limit, offset: query.offset })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error fetching expenses:', error)
    res.status(500).json({ error: 'Failed to fetch expenses' })
  }
})

// GET /expenses/summary - Get expense totals by category and period
router.get('/summary', async (req, res) => {
  try {
    const query = z
      .object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        search: z.string().optional(),
      })
      .parse(req.query)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      isActive: true,
    }

    if (query.startDate || query.endDate) {
      where.date = {}
      if (query.startDate) where.date.gte = new Date(query.startDate)
      if (query.endDate) where.date.lte = new Date(query.endDate)
    }

    // Search across description and supplier
    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim()
      where.OR = [
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { supplier: { contains: searchTerm, mode: 'insensitive' } },
      ]
    }

    // Get totals by category
    const byCategory = await prisma.businessExpense.groupBy({
      by: ['category'],
      where,
      _sum: {
        amountIncVat: true,
        amountExcVat: true,
      },
      _count: true,
    })

    // Get overall totals
    const totals = await prisma.businessExpense.aggregate({
      where,
      _sum: {
        amountIncVat: true,
        amountExcVat: true,
      },
      _count: true,
    })

    // Get monthly breakdown for the period
    const expenses = await prisma.businessExpense.findMany({
      where,
      select: {
        date: true,
        amountIncVat: true,
        amountExcVat: true,
      },
      orderBy: { date: 'asc' },
    })

    // Group by month
    const byMonth: Record<string, { incVat: number; excVat: number; count: number }> = {}
    for (const expense of expenses) {
      const monthKey = expense.date.toISOString().slice(0, 7) // YYYY-MM
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { incVat: 0, excVat: 0, count: 0 }
      }
      byMonth[monthKey].incVat += Number(expense.amountIncVat)
      byMonth[monthKey].excVat += Number(expense.amountExcVat)
      byMonth[monthKey].count += 1
    }

    res.json({
      byCategory: byCategory.map((c) => ({
        category: c.category,
        totalIncVat: Number(c._sum.amountIncVat) || 0,
        totalExcVat: Number(c._sum.amountExcVat) || 0,
        count: c._count,
      })),
      byMonth: Object.entries(byMonth).map(([month, data]) => ({
        month,
        totalIncVat: data.incVat,
        totalExcVat: data.excVat,
        count: data.count,
      })),
      totals: {
        totalIncVat: Number(totals._sum.amountIncVat) || 0,
        totalExcVat: Number(totals._sum.amountExcVat) || 0,
        count: totals._count,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error fetching expense summary:', error)
    res.status(500).json({ error: 'Failed to fetch expense summary' })
  }
})

// GET /expenses/:id - Get single expense
router.get('/:id', async (req, res) => {
  try {
    const expense = await prisma.businessExpense.findUnique({
      where: { id: req.params.id },
    })

    if (!expense || !expense.isActive) {
      return res.status(404).json({ error: 'Expense not found' })
    }

    res.json(expense)
  } catch (error) {
    console.error('Error fetching expense:', error)
    res.status(500).json({ error: 'Failed to fetch expense' })
  }
})

// POST /expenses - Create expense
router.post('/', async (req, res) => {
  try {
    const data = expenseSchema.parse(req.body)

    const expense = await prisma.businessExpense.create({
      data: {
        date: data.date ? new Date(data.date) : new Date(),
        category: data.category,
        supplier: data.supplier,
        description: data.description,
        amountIncVat: data.amountIncVat,
        amountExcVat: data.amountExcVat,
      },
    })

    res.status(201).json(expense)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating expense:', error)
    res.status(500).json({ error: 'Failed to create expense' })
  }
})

// PUT /expenses/:id - Update expense
router.put('/:id', async (req, res) => {
  try {
    const data = expenseUpdateSchema.parse(req.body)

    const expense = await prisma.businessExpense.update({
      where: { id: req.params.id },
      data: {
        ...(data.date && { date: new Date(data.date) }),
        ...(data.category && { category: data.category }),
        ...(data.supplier !== undefined && { supplier: data.supplier }),
        ...(data.description && { description: data.description }),
        ...(data.amountIncVat !== undefined && { amountIncVat: data.amountIncVat }),
        ...(data.amountExcVat !== undefined && { amountExcVat: data.amountExcVat }),
      },
    })

    res.json(expense)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating expense:', error)
    res.status(500).json({ error: 'Failed to update expense' })
  }
})

// DELETE /expenses/:id - Soft delete expense
router.delete('/:id', async (req, res) => {
  try {
    await prisma.businessExpense.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })

    res.status(204).send()
  } catch (error) {
    console.error('Error deleting expense:', error)
    res.status(500).json({ error: 'Failed to delete expense' })
  }
})

export default router
