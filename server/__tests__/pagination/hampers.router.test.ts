import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    hamper: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    hamperRequirement: { findMany: vi.fn() },
    hamperVariant: { findMany: vi.fn() },
    hamperVariantMapping: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    inventoryLot: { groupBy: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '../../lib/prisma'
import hampersRouter from '../../features/hampers/router'

const mockPrisma = prisma as unknown as {
  hamper: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
  }
  hamperRequirement: { findMany: ReturnType<typeof vi.fn> }
  hamperVariant: { findMany: ReturnType<typeof vi.fn> }
  hamperVariantMapping: { findMany: ReturnType<typeof vi.fn> }
  product: { findMany: ReturnType<typeof vi.fn> }
  inventoryLot: { groupBy: ReturnType<typeof vi.fn> }
  $queryRaw: ReturnType<typeof vi.fn>
}

const hamper = {
  id: 'hamper-1', name: 'Chocolate Hamper', sellingPrice: 30, etsyListingId: null,
  etsyIsEnabled: true, indicativeQuantity: null, hasVariants: true, isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  requirements: [],
}
let activeServer: Server | null = null

async function startServer(): Promise<string> {
  const app = express()
  app.use(express.json())
  app.use('/api/hampers', hampersRouter)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not start')
  activeServer = server
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  if (!activeServer) return
  await new Promise<void>((resolve, reject) => activeServer!.close((error) => error ? reject(error) : resolve()))
  activeServer = null
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.hamper.findMany.mockResolvedValue([hamper])
  mockPrisma.hamper.count.mockResolvedValue(51)
  mockPrisma.$queryRaw.mockResolvedValue([{ id: hamper.id }])
  mockPrisma.hamperRequirement.findMany.mockResolvedValue([])
  mockPrisma.hamperVariant.findMany.mockResolvedValue([])
  mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([])
  mockPrisma.product.findMany.mockResolvedValue([])
  mockPrisma.inventoryLot.groupBy.mockResolvedValue([])
})

describe('hampers pagination router', () => {
  const prismaSorts = [
    ['name-asc', [{ name: 'asc' }, { id: 'asc' }]],
    ['name-desc', [{ name: 'desc' }, { id: 'desc' }]],
    ['price-asc', [{ sellingPrice: 'asc' }, { id: 'asc' }]],
    ['price-desc', [{ sellingPrice: 'desc' }, { id: 'desc' }]],
    ['reqs-asc', [{ requirements: { _count: 'asc' } }, { id: 'asc' }]],
    ['reqs-desc', [{ requirements: { _count: 'desc' } }, { id: 'desc' }]],
    ['date-desc', [{ createdAt: 'desc' }, { id: 'desc' }]],
    ['date-asc', [{ createdAt: 'asc' }, { id: 'asc' }]],
  ] as const

  it.each(prismaSorts)('uses a bounded deterministic page for %s', async (sort, orderBy) => {
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/hampers?page=2&pageSize=25&sort=${sort}`)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, totalItems: 51, totalPages: 3 })
    expect(mockPrisma.hamper.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 25, take: 25, orderBy })
    expect(mockPrisma.hamper.findMany).toHaveBeenCalledTimes(2)
    expect(mockPrisma.hamper.count).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperRequirement.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperVariant.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperVariantMapping.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.inventoryLot.groupBy).toHaveBeenCalledTimes(1)
  })

  it.each(['canmake-desc', 'canmake-asc'] as const)(
    'selects the global %s page in parameterized SQL before bounded hydration',
    async (sort) => {
      const baseUrl = await startServer()
      const response = await fetch(`${baseUrl}/api/hampers?page=3&pageSize=25&search=tea&hideEtsyHidden=false&sort=${sort}`)
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(1)
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1)
      const sql = mockPrisma.$queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] }
      expect(sql.strings.join(' ')).toContain('ORDER BY "canMake"')
      expect(sql.strings.join(' ')).toContain('LIMIT')
      expect(sql.strings.join(' ')).toContain('GROUP BY r."id"')
      expect(sql.values).toEqual(expect.arrayContaining(['%tea%', 25, 50]))
      expect(mockPrisma.hamper.findMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.hamper.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: [hamper.id] }, isActive: true },
      }))
    },
  )

  it('applies search and exact Etsy visibility semantics to totals and variant summaries', async () => {
    mockPrisma.hamperVariant.findMany.mockResolvedValue([
      { id: 'visible', hamperId: hamper.id, name: 'Visible', etsySku: null, sellingPrice: null, etsyIsEnabled: true, indicativeQuantity: null },
      { id: 'hidden', hamperId: hamper.id, name: 'Hidden', etsySku: null, sellingPrice: null, etsyIsEnabled: false, indicativeQuantity: null },
    ])
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/hampers?page=1&pageSize=25&search=choc&hideEtsyHidden=true&sort=name-asc`)
    const body = await response.json()
    const expectedWhere = {
      isActive: true,
      etsyIsEnabled: true,
      name: { contains: 'choc', mode: 'insensitive' },
      OR: [
        { hasVariants: false },
        { variants: { some: { isActive: true, etsyIsEnabled: true } } },
      ],
    }
    expect(mockPrisma.hamper.count).toHaveBeenCalledWith({ where: expectedWhere })
    expect(mockPrisma.hamper.findMany.mock.calls[0]?.[0]).toMatchObject({ where: expectedWhere })
    expect(body.items[0].variantAvailability).toEqual([
      expect.objectContaining({ variantId: 'visible', etsyIsEnabled: true }),
    ])
  })

  it('uses the shared batch calculation for rich ordinary Hamper availability', async () => {
    mockPrisma.hamper.findUnique.mockResolvedValue({
      ...hamper,
      hasVariants: false,
      requirements: [{
        id: 'requirement-1',
        hamperId: hamper.id,
        categoryId: 'category-1',
        quantity: 2,
        isOptional: false,
        category: {
          id: 'category-1',
          name: 'Chocolate',
          products: [{ id: 'product-1', lots: [{ remaining: 5, unitCost: 1 }] }],
        },
      }],
      variants: [],
    })
    mockPrisma.hamperRequirement.findMany.mockResolvedValue([
      { hamperId: hamper.id, categoryId: 'category-1', quantity: 2, isOptional: false },
    ])
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'product-1', categoryId: 'category-1' }])
    mockPrisma.inventoryLot.groupBy.mockResolvedValue([
      { productId: 'product-1', _sum: { remaining: 5 } },
    ])
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/hampers/${hamper.id}`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.canMake).toBe(2)
    expect(mockPrisma.hamperRequirement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { hamperId: { in: [hamper.id] } },
    }))
    expect(mockPrisma.inventoryLot.groupBy).toHaveBeenCalledTimes(1)
  })

  it('rejects unsupported page sizes before loading data', async () => {
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/hampers?page=1&pageSize=101`)
    expect(response.status).toBe(400)
    expect(mockPrisma.hamper.findMany).not.toHaveBeenCalled()
  })
})
