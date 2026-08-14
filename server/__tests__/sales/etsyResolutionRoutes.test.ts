import { createServer, type Server } from 'node:http'
import express from 'express'
import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    sale: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../../lib/prisma'
import salesRouter from '../../features/sales/router'

const SALE_ID = 'clx0q2p1w0000s1l1n4m9n9n9'
const UPDATED_AT = new Date('2026-08-14T12:00:00.000Z')

function sale(overrides: Record<string, unknown> = {}) {
  return {
    id: SALE_ID,
    saleChannel: 'etsy',
    etsyOrderId: '4137418052',
    grossRevenue: new Prisma.Decimal('30.00'),
    postageCharged: new Prisma.Decimal('5.00'),
    postageCost: new Prisma.Decimal('2.50'),
    transactionFee: new Prisma.Decimal('0.60'),
    postageTransactionFee: new Prisma.Decimal('0.10'),
    regulatoryFee: new Prisma.Decimal('0.25'),
    processingFee: new Prisma.Decimal('0.40'),
    vatOnProcessingFee: new Prisma.Decimal('0.08'),
    listingFee: new Prisma.Decimal('0.20'),
    offsiteAdsAttributed: true,
    offsiteAdsFee: new Prisma.Decimal('1.00'),
    vatOnOffsiteAdsFee: new Prisma.Decimal('0.20'),
    etsyFees: new Prisma.Decimal('2.83'),
    packagingOverhead: new Prisma.Decimal('0.30'),
    netRevenue: new Prisma.Decimal('31.87'),
    totalCost: new Prisma.Decimal('11.00'),
    margin: new Prisma.Decimal('18.37'),
    etsyPaymentGross: null,
    etsyPaymentFees: null,
    etsyPaymentNet: null,
    etsyFeeReconciliationStatus: 'PENDING',
    etsyFeeReconciliationSource: null,
    etsyFeeReconciledAt: null,
    etsyStatementImportId: null,
    etsyManualResolutionNote: null,
    updatedAt: UPDATED_AT,
    ...overrides,
  }
}

const mockPrisma = prisma as unknown as {
  sale: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
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
  return `http://127.0.0.1:${address.port}/api/sales`
}

async function post(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/${SALE_ID}/etsy-resolution/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
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
  const current = sale()
  mockPrisma.sale.findUnique.mockResolvedValue(current)
  mockPrisma.sale.findMany.mockResolvedValue([current])
  mockPrisma.sale.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.$transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
    sale: { updateMany: mockPrisma.sale.updateMany },
  }))
})

describe('manual Etsy Sale resolution routes', () => {
  it('previews through the actual Sales router without writing', async () => {
    const baseUrl = await startServer()
    const response = await post(baseUrl, 'preview', {
      resolution: { type: 'reclassify', channel: 'direct' },
    })
    const body = await response.json() as { fingerprint: string; applied?: boolean }

    expect(response.status).toBe(200)
    expect(body.fingerprint).toMatch(/^[a-f0-9]{64}$/u)
    expect(body.applied).toBeUndefined()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('applies a fingerprinted preview through the actual Sales router', async () => {
    const baseUrl = await startServer()
    const previewResponse = await post(baseUrl, 'preview', {
      resolution: { type: 'reclassify', channel: 'direct' },
    })
    const preview = await previewResponse.json() as { fingerprint: string }

    const response = await post(baseUrl, 'apply', {
      fingerprint: preview.fingerprint,
      resolution: { type: 'reclassify', channel: 'direct' },
    })
    const body = await response.json() as { applied: boolean }

    expect(response.status).toBe(200)
    expect(body.applied).toBe(true)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('returns 400 for a malformed resolution body', async () => {
    const baseUrl = await startServer()
    const response = await post(baseUrl, 'preview', {
      resolution: { type: 'reclassify', channel: 'etsy' },
    })

    expect(response.status).toBe(400)
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled()
  })

  it('maps collision, immutable, and stale preview failures to 409', async () => {
    const baseUrl = await startServer()
    const placeholderSale = sale({ etsyOrderId: '1' })
    mockPrisma.sale.findUnique.mockResolvedValue(placeholderSale)
    mockPrisma.sale.findMany.mockImplementation(async (args: { where: { OR: Array<{ etsyOrderId: string | { startsWith: string } }> } }) => {
      const exact = args.where.OR[0]?.etsyOrderId
      if (exact === '4137418052') return [sale({ id: 'conflict-sale', etsyOrderId: '4137418052-1' })]
      return [placeholderSale]
    })
    const collision = await post(baseUrl, 'preview', {
      resolution: { type: 'correct_receipt_id', etsyOrderId: '4137418052' },
    })
    expect(collision.status).toBe(409)

    mockPrisma.sale.findMany.mockResolvedValue([sale({
      etsyOrderId: '1',
      etsyFeeReconciliationStatus: 'STATEMENT_VERIFIED',
    })])
    const immutable = await post(baseUrl, 'preview', {
      resolution: { type: 'reclassify', channel: 'fair' },
    })
    expect(immutable.status).toBe(409)

    mockPrisma.sale.findUnique.mockResolvedValue(sale())
    mockPrisma.sale.findMany.mockResolvedValue([sale()])
    const preview = await post(baseUrl, 'preview', {
      resolution: { type: 'reclassify', channel: 'direct' },
    })
    const previewBody = await preview.json() as { fingerprint: string }
    mockPrisma.sale.findUnique.mockResolvedValue(sale({ updatedAt: new Date('2026-08-14T12:01:00.000Z') }))
    mockPrisma.sale.findMany.mockResolvedValue([sale({ updatedAt: new Date('2026-08-14T12:01:00.000Z') })])
    const stale = await post(baseUrl, 'apply', {
      fingerprint: previewBody.fingerprint,
      resolution: { type: 'reclassify', channel: 'direct' },
    })
    expect(stale.status).toBe(409)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns 404 when the target Sale is unknown', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null)
    const baseUrl = await startServer()
    const response = await post(baseUrl, 'preview', {
      resolution: { type: 'reclassify', channel: 'direct' },
    })

    expect(response.status).toBe(404)
  })

  it('returns 500 and leaves the transaction uncommitted when the repository fails', async () => {
    const baseUrl = await startServer()
    const preview = await post(baseUrl, 'preview', {
      resolution: { type: 'reclassify', channel: 'direct' },
    })
    const previewBody = await preview.json() as { fingerprint: string }
    let committed = false
    mockPrisma.$transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
      await work({
        sale: {
          updateMany: vi.fn().mockRejectedValue(new Error('database unavailable')),
        },
      })
      committed = true
    })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await post(baseUrl, 'apply', {
      fingerprint: previewBody.fingerprint,
      resolution: { type: 'reclassify', channel: 'direct' },
    })
    consoleError.mockRestore()

    expect(response.status).toBe(500)
    expect(committed).toBe(false)
  })
})
