import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    componentCategory: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '../../lib/prisma'
import categoriesRouter from '../../features/categories/router'

const findMany = vi.mocked(prisma.componentCategory.findMany)
let activeServer: Server | null = null

async function startServer(): Promise<string> {
  const app = express()
  app.use('/api/categories', categoriesRouter)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not start')
  activeServer = server
  return `http://127.0.0.1:${address.port}`
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  if (!activeServer) return
  await new Promise<void>((resolve, reject) => {
    activeServer!.close((error) => (error ? reject(error) : resolve()))
  })
  activeServer = null
})

describe('categories router', () => {
  it('counts only active products in category list badges', async () => {
    findMany.mockResolvedValue([{
      id: 'category-1',
      name: 'Chocolate',
      description: null,
      pickRule: 'FIFO',
      isActive: true,
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      updatedAt: new Date('2026-08-21T00:00:00.000Z'),
      _count: { products: 1 },
    }] as never)
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/api/categories`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({ _count: { products: 1 } }),
    ])
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            products: { where: { isActive: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })
  })
})
