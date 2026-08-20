import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/inventory/productList', () => ({
  listInventoryProducts: vi.fn(),
}))

import inventoryRouter from '../../features/inventory/router'
import { listInventoryProducts } from '../../lib/inventory/productList'

const mockListInventoryProducts = vi.mocked(listInventoryProducts)
let activeServer: Server | null = null

async function startServer(): Promise<string> {
  const app = express()
  app.use(express.json())
  app.use('/api/inventory', inventoryRouter)
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

describe('inventory products pagination router', () => {
  it('parses all server filters and returns the service pagination envelope', async () => {
    const categoryId = `c${'1'.repeat(24)}`
    const serviceResponse = {
      items: [],
      pagination: { page: 2, pageSize: 50 as const, totalItems: 83, totalPages: 2 },
    }
    mockListInventoryProducts.mockResolvedValue(serviceResponse)
    const baseUrl = await startServer()

    const response = await fetch(
      `${baseUrl}/api/inventory/products?page=2&pageSize=50&categoryId=${categoryId}&search=dark&lowStockOnly=true&sort=newest`,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(serviceResponse)
    expect(mockListInventoryProducts).toHaveBeenCalledWith(expect.anything(), {
      page: 2,
      pageSize: 50,
      categoryId,
      search: 'dark',
      lowStockOnly: true,
      sort: 'newest',
    })
  })

  it('rejects unsupported sort and page size before calling the service', async () => {
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/inventory/products?pageSize=10&sort=name;DROP TABLE Product`)

    expect(response.status).toBe(400)
    expect(mockListInventoryProducts).not.toHaveBeenCalled()
  })
})
