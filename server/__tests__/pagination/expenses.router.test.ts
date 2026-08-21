import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    businessExpense: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '../../lib/prisma'
import expensesRouter from '../../features/expenses/router'

const mockPrisma = prisma as unknown as {
  businessExpense: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
}

let activeServer: Server | null = null

async function startServer(): Promise<string> {
  const app = express()
  app.use(express.json())
  app.use('/api/expenses', expensesRouter)

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not start')
  activeServer = server
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  if (!activeServer) return
  await new Promise<void>((resolve, reject) => {
    activeServer!.close((error) => (error ? reject(error) : resolve()))
  })
  activeServer = null
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('expenses pagination router', () => {
  it('returns the requested page with deterministic sort and pagination metadata', async () => {
    const items = [{ id: 'expense-1' }]
    mockPrisma.businessExpense.findMany.mockResolvedValue(items)
    mockPrisma.businessExpense.count.mockResolvedValue(101)
    const baseUrl = await startServer()

    const response = await fetch(
      `${baseUrl}/api/expenses?page=2&pageSize=100&category=STOCK&startDate=2026-08-01T00:00:00.000Z&endDate=2026-08-20T23:59:59.999Z&search=chocolate&sort=date&direction=desc`,
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      items,
      pagination: { page: 2, pageSize: 100, totalItems: 101, totalPages: 2 },
    })
    expect(mockPrisma.businessExpense.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 100,
      take: 100,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    }))
    expect(mockPrisma.businessExpense.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.any(Object),
    }))
  })

  it('rejects unsupported page sizes with HTTP 400', async () => {
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/api/expenses?page=1&pageSize=101`)

    expect(response.status).toBe(400)
    expect(mockPrisma.businessExpense.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.businessExpense.count).not.toHaveBeenCalled()
  })
})
