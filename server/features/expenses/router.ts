import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { getExpensesSummary } from '../../lib/expenses/summary'
import { buildPaginationMeta, toPrismaPagination } from '../../lib/pagination'
import {
  expensesCreateBodySchema,
  expensesListQuerySchema,
  expensesSummaryQuerySchema,
  expensesUpdateBodySchema,
} from '#contracts/routes/expenses'

const router = Router()
const expenseSortFields = {
  date: 'date',
  amountIncVat: 'amountIncVat',
} as const

// GET /expenses - List expenses with filters
router.get('/', async (req, res) => {
  try {
    const query = expensesListQuerySchema.parse(req.query)
    const { skip, take } = toPrismaPagination(query)
    const where: Prisma.BusinessExpenseWhereInput = { isActive: true }

    if (query.category) {
      where.category = query.category
    }

    if (query.startDate || query.endDate) {
      where.date = {}
      if (query.startDate) where.date.gte = new Date(query.startDate)
      if (query.endDate) where.date.lte = new Date(query.endDate)
    }

    // Search across description and supplier
    if (query.search) {
      const searchTerm = query.search.trim()
      where.OR = [
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { supplier: { contains: searchTerm, mode: 'insensitive' } },
      ]
    }

    const sortField = expenseSortFields[query.sort]
    const [items, totalItems] = await Promise.all([
      prisma.businessExpense.findMany({
        where,
        orderBy: [{ [sortField]: query.direction }, { id: query.direction }],
        take,
        skip,
      }),
      prisma.businessExpense.count({ where }),
    ])

    res.json({ items, pagination: buildPaginationMeta(query, totalItems) })
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
    const query = expensesSummaryQuerySchema.parse(req.query)
    res.json(await getExpensesSummary(query))
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
    const data = expensesCreateBodySchema.parse(req.body)

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
    const data = expensesUpdateBodySchema.parse(req.body)

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
