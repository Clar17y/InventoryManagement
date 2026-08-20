import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '../../lib/prisma'
import productsRouter from '../../features/products/router'

const mockPrisma = prisma as unknown as {
  product: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
}

let activeServer: Server | null = null

async function startServer(): Promise<string> {
  const app = express()
  app.use(express.json())
  app.use('/api/products', productsRouter)

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

describe('products pagination router', () => {
  it('returns a bounded, server-filtered page with deterministic ordering and stock projection', async () => {
    const categoryId = `c${'1'.repeat(24)}`
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: `c${String(index + 1).padStart(24, '0')}`,
      name: `Tea ${index + 1}`,
      categoryId,
      unit: 'units',
      lowStockThreshold: 5,
      isActive: true,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      updatedAt: new Date('2026-08-20T00:00:00.000Z'),
      category: { id: categoryId, name: 'Tea', isActive: true },
      barcodes: [{ id: `c${String(index + 100).padStart(24, '0')}`, barcode: `barcode-${index}` }],
      lots: [{ remaining: 3, unitCost: 1.25 }],
      costs: [{ unitCost: 1.5 }],
    }))
    mockPrisma.product.findMany.mockResolvedValue(items)
    mockPrisma.product.count.mockResolvedValue(51)
    const baseUrl = await startServer()

    const response = await fetch(
      `${baseUrl}/api/products?page=2&pageSize=25&categoryId=${categoryId}&search=tea&sort=name&direction=asc`,
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items).toHaveLength(25)
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, totalItems: 51, totalPages: 3 })
    expect(body.items[0]).toMatchObject({
      id: items[0]!.id,
      name: 'Tea 1',
      barcode: 'barcode-0',
      totalStock: 3,
      totalRemaining: 3,
      lotCount: 1,
      currentCost: 1.5,
    })
    expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        categoryId,
        name: { contains: 'tea', mode: 'insensitive' },
      },
      include: {
        category: true,
        barcodes: { select: { id: true, barcode: true } },
        lots: {
          where: { remaining: { gt: 0 } },
          select: { remaining: true, unitCost: true },
        },
        costs: {
          where: { effectiveTo: null },
          take: 1,
          orderBy: { effectiveFrom: 'desc' },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 25,
      take: 25,
    })
    expect(mockPrisma.product.count).toHaveBeenCalledWith({
      where: {
        isActive: true,
        categoryId,
        name: { contains: 'tea', mode: 'insensitive' },
      },
    })
  })

  it('rejects unsupported page sizes before querying Prisma', async () => {
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/api/products?page=1&pageSize=10`)

    expect(response.status).toBe(400)
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.product.count).not.toHaveBeenCalled()
  })
})
