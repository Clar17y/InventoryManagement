import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/prisma', () => ({
  prisma: {
    sale: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '../../lib/prisma'
import salesRouter from '../../features/sales/router'

const mockPrisma = prisma as unknown as {
  sale: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
}

let activeServer: Server | null = null

async function startServer(): Promise<string> {
  const app = express()
  app.use(express.json())
  app.use('/api/sales', salesRouter)

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

describe('sales pagination router', () => {
  it('returns the requested page with deterministic sort and pagination metadata', async () => {
    const items = [{ id: 'sale-1' }]
    mockPrisma.sale.findMany.mockResolvedValue(items)
    mockPrisma.sale.count.mockResolvedValue(51)
    const baseUrl = await startServer()

    const response = await fetch(
      `${baseUrl}/api/sales?page=2&pageSize=25&startDate=2026-08-01&endDate=2026-08-20&search=etsy&sort=saleDate&direction=desc`,
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      items,
      pagination: { page: 2, pageSize: 25, totalItems: 51, totalPages: 3 },
    })
    expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 25,
      take: 25,
      orderBy: [{ saleDate: 'desc' }, { id: 'desc' }],
    }))
    expect(mockPrisma.sale.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.any(Object),
    }))
  })

  it('rejects unsupported page sizes with HTTP 400', async () => {
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/api/sales?page=1&pageSize=26`)

    expect(response.status).toBe(400)
    expect(mockPrisma.sale.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.sale.count).not.toHaveBeenCalled()
  })
})
