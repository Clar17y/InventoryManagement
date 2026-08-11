import express from 'express'
import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EtsyPayment } from '../../lib/etsy/types'
import type { SaleFeeSnapshot } from '../../lib/etsy/fees/types'
import { createEtsyFeeRouter, type EtsyFeeRouterDependencies } from '../../features/etsy/feeRouter'
import { attributedCsv, createFeeDbFixture, sale } from './feeTestHelpers'

const paymentFixture: EtsyPayment = {
  payment_id: 9001,
  receipt_id: 4137418052,
  currency: 'GBP',
  amount_gross: { amount: 3999, divisor: 100, currency_code: 'GBP' },
  amount_fees: { amount: 976, divisor: 100, currency_code: 'GBP' },
  amount_net: { amount: 3023, divisor: 100, currency_code: 'GBP' },
  adjusted_gross: { amount: 0, divisor: 100, currency_code: 'GBP' },
  adjusted_fees: { amount: 0, divisor: 100, currency_code: 'GBP' },
  adjusted_net: { amount: 0, divisor: 100, currency_code: 'GBP' },
}

function dependencies(): EtsyFeeRouterDependencies {
  return {
    db: createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    }),
    paymentClient: {
      getPaymentsForReceipt: vi.fn(async () => [paymentFixture]),
    },
    summary: async () => ({
      NOT_APPLICABLE: 0,
      PENDING: 1,
      PAYMENT_SYNCED: 0,
      STATEMENT_VERIFIED: 0,
      MANUAL_REVIEW: 0,
    }),
  }
}

async function startRouter(deps = dependencies()): Promise<{
  baseUrl: string
  server: Server
  deps: EtsyFeeRouterDependencies
}> {
  const app = express()
  app.use(express.json({ limit: '3mb' }))
  app.use('/api/etsy/fees', createEtsyFeeRouter(deps))
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not start')
  return { baseUrl: `http://127.0.0.1:${address.port}/api/etsy/fees`, server, deps }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

let activeServer: Server | null = null

afterEach(async () => {
  if (activeServer) {
    await closeServer(activeServer)
    activeServer = null
  }
})

describe('Etsy fee reconciliation routes', () => {
  it('rejects payment preview receipt IDs that contain non-digits', async () => {
    const started = await startRouter()
    activeServer = started.server

    const response = await fetch(`${started.baseUrl}/reconcile/payments/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptIds: ['4137abc'] }),
    })

    expect(response.status).toBe(400)
  })

  it('rejects more than one hundred payment receipts', async () => {
    const started = await startRouter()
    activeServer = started.server

    const response = await fetch(`${started.baseUrl}/reconcile/payments/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptIds: Array.from({ length: 101 }, (_, index) => String(index + 1)) }),
    })

    expect(response.status).toBe(400)
  })

  it('rejects a missing payment apply fingerprint', async () => {
    const started = await startRouter()
    activeServer = started.server

    const response = await fetch(`${started.baseUrl}/reconcile/payments/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptIds: ['4137418052'] }),
    })

    expect(response.status).toBe(400)
  })

  it('rejects invalid statement months and oversized CSV uploads', async () => {
    const started = await startRouter()
    activeServer = started.server

    const invalidMonth = await fetch(`${started.baseUrl}/statements/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statementMonth: '2025-13', fileName: 'statement.csv', csv: attributedCsv }),
    })
    expect(invalidMonth.status).toBe(400)

    const oversizedCsv = 'x'.repeat(2_500_001)
    const oversized = await fetch(`${started.baseUrl}/statements/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statementMonth: '2025-07', fileName: 'statement.csv', csv: oversizedCsv }),
    })
    expect(oversized.status).toBe(400)

    const invalidType = await fetch(`${started.baseUrl}/statements/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statementMonth: '2025-07', fileName: 'statement.csv', csv: 123 }),
    })
    expect(invalidType.status).toBe(400)
  })

  it('previews statement fees in pounds without writing sales', async () => {
    const started = await startRouter()
    activeServer = started.server

    const response = await fetch(`${started.baseUrl}/statements/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        statementMonth: '2025-07',
        fileName: 'statement.csv',
        csv: attributedCsv,
      }),
    })
    const body = await response.json() as { fingerprint: string; changes: Array<{ oldFees: number; newFees: number }> }

    expect(response.status).toBe(200)
    expect(body.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(body.changes[0]).toMatchObject({ oldFees: 4, newFees: 9.76 })
    expect((started.deps.db as typeof started.deps.db & { writeCount: number }).writeCount).toBe(0)
  })

  it('requires a statement apply fingerprint', async () => {
    const started = await startRouter()
    activeServer = started.server

    const response = await fetch(`${started.baseUrl}/statements/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statementMonth: '2025-07', fileName: 'statement.csv', csv: attributedCsv }),
    })

    expect(response.status).toBe(400)
  })

  it('maps a stale statement fingerprint to a typed conflict without writing', async () => {
    const started = await startRouter()
    activeServer = started.server
    const statement = { statementMonth: '2025-07', fileName: 'statement.csv', csv: attributedCsv }

    const previewResponse = await fetch(`${started.baseUrl}/statements/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(statement),
    })
    const preview = await previewResponse.json() as { fingerprint: string }
    const db = started.deps.db as typeof started.deps.db & { sales: SaleFeeSnapshot[] }
    db.sales = [{
      id: 's1',
      etsyOrderId: '4137418052',
      grossRevenuePence: 3999,
      etsyFeesPence: 400,
      netRevenuePence: 3599,
      marginPence: 2199,
      previousOffsiteAdsFeePence: null,
      previousVatOnOffsiteAdsFeePence: null,
      status: 'PENDING',
      updatedAt: '2025-08-01T12:00:00.000Z',
    }]

    const applyResponse = await fetch(`${started.baseUrl}/statements/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...statement, fingerprint: preview.fingerprint }),
    })

    expect(applyResponse.status).toBe(409)
    expect((db as typeof db & { writeCount: number }).writeCount).toBe(0)
  })

  it('maps an unconfirmed statement revision during preview to a typed conflict', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        status: 'STATEMENT_VERIFIED',
        offsiteAdsAttributed: true,
        previousOffsiteAdsFeePence: 100,
        previousVatOnOffsiteAdsFeePence: 20,
      })],
    })
    const started = await startRouter({ ...dependencies(), db })
    activeServer = started.server

    const response = await fetch(`${started.baseUrl}/statements/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        statementMonth: '2025-07',
        fileName: 'statement.csv',
        csv: attributedCsv,
      }),
    })
    const body = await response.json() as { code?: string; error?: string }

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ code: 'RECONCILIATION_CONFLICT' })
    expect(body.error).not.toContain(attributedCsv)
    expect(db.writeCount).toBe(0)
  })

  it('returns duplicate semantics for a repeated statement checksum', async () => {
    const started = await startRouter()
    activeServer = started.server
    const statement = { statementMonth: '2025-07', fileName: 'statement.csv', csv: attributedCsv }

    const previewResponse = await fetch(`${started.baseUrl}/statements/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(statement),
    })
    const preview = await previewResponse.json() as { fingerprint: string }
    const body = { ...statement, fingerprint: preview.fingerprint }

    const first = await fetch(`${started.baseUrl}/statements/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const firstBody = await first.json() as { applied: boolean; duplicate: boolean }
    const writesAfterFirst = (started.deps.db as typeof started.deps.db & { writeCount: number }).writeCount

    const second = await fetch(`${started.baseUrl}/statements/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const secondBody = await second.json() as { applied: boolean; duplicate: boolean }

    expect(first.status).toBe(200)
    expect(firstBody).toMatchObject({ applied: true, duplicate: false })
    expect(second.status).toBe(200)
    expect(secondBody).toMatchObject({ applied: false, duplicate: true })
    expect((started.deps.db as typeof started.deps.db & { writeCount: number }).writeCount).toBe(writesAfterFirst)
  })

  it('keeps Payment API failures per-order and leaves the gate disabled', async () => {
    const deps = dependencies()
    deps.paymentClient = {
      getPaymentsForReceipt: vi.fn(async () => {
        throw new Error('Etsy unavailable')
      }),
    }
    const started = await startRouter(deps)
    activeServer = started.server
    delete process.env.ETSY_PAYMENT_FEES_VALIDATED

    const response = await fetch(`${started.baseUrl}/reconcile/payments/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptIds: ['4137418052'] }),
    })
    const body = await response.json() as { canApplyCanonicalFees: boolean; failures: Array<{ receiptId: string; status: string }> }

    expect(response.status).toBe(200)
    expect(body.canApplyCanonicalFees).toBe(false)
    expect(body.failures).toEqual([{ receiptId: '4137418052', status: 'PENDING', message: 'Etsy unavailable' }])
  })

  it('returns reconciliation counts for every status', async () => {
    const started = await startRouter()
    activeServer = started.server

    const response = await fetch(`${started.baseUrl}/reconciliation-summary`)
    const body = await response.json() as { counts: Record<string, number> }

    expect(response.status).toBe(200)
    expect(body.counts).toEqual({
      NOT_APPLICABLE: 0,
      PENDING: 1,
      PAYMENT_SYNCED: 0,
      STATEMENT_VERIFIED: 0,
      MANUAL_REVIEW: 0,
    })
  })
})
