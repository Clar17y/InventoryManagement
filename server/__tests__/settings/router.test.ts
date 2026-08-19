import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    etsyFeeConfig: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    packagingOverhead: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    postageTier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    settingsAuditLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../../lib/prisma'
import settingsRouter from '../../features/settings/router'

type MockFn = ReturnType<typeof vi.fn>
type ModelMocks = {
  etsyFeeConfig: {
    findMany: MockFn
    updateMany: MockFn
    create: MockFn
  }
  packagingOverhead: {
    findMany: MockFn
    findUnique: MockFn
    create: MockFn
    update: MockFn
    updateMany: MockFn
  }
  postageTier: {
    findMany: MockFn
    findUnique: MockFn
    create: MockFn
    update: MockFn
    updateMany: MockFn
  }
  settingsAuditLog: {
    findMany: MockFn
    create: MockFn
  }
  $transaction: MockFn
}

const prismaMock = prisma as unknown as ModelMocks
const postageTierRouteId = 'clx0q2p1w0000s1l1n4m9n9n'
const otherPostageTierRouteId = 'clx0q2p1w0000s1l1n4m9n9o'
const packagingRouteId = 'clx0q2p1w0000s1l1n4m9n9p'
const missingRouteId = 'clx0q2p1w0000s1l1n4m9n9q'
const transactionMock: Omit<ModelMocks, '$transaction'> = {
  etsyFeeConfig: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  packagingOverhead: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  postageTier: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  settingsAuditLog: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
}

const activeTier = {
  id: 'tier-5',
  etsyCharge: new Prisma.Decimal('5.00'),
  actualCost: new Prisma.Decimal('3.50'),
  label: 'Old Label',
  isActive: true,
  createdAt: new Date('2026-08-19T09:00:00.000Z'),
}

const archivedTier = {
  ...activeTier,
  actualCost: new Prisma.Decimal('3.25'),
  label: 'Archived',
  isActive: false,
}

const activePackaging = {
  id: 'packaging-1',
  name: 'Box',
  costPerOrder: new Prisma.Decimal('1.25'),
  effectiveFrom: new Date('2026-08-01T09:00:00.000Z'),
  effectiveTo: null,
  isActive: true,
  createdAt: new Date('2026-08-01T09:00:00.000Z'),
}

const archivedPackaging = {
  ...activePackaging,
  name: 'Old Box',
  costPerOrder: new Prisma.Decimal('9.00'),
  effectiveTo: new Date('2026-08-18T09:00:00.000Z'),
  isActive: false,
}

const activeFeeConfig = {
  id: 'fees-1',
  name: 'Current Etsy fees',
  transactionFee: new Prisma.Decimal('0.065'),
  regulatoryFee: new Prisma.Decimal('0.0032'),
  paymentFeePercent: new Prisma.Decimal('0.04'),
  paymentFeeFixed: new Prisma.Decimal('0.20'),
  vatRate: new Prisma.Decimal('0.20'),
  listingFee: new Prisma.Decimal('0.15'),
  effectiveFrom: new Date('2026-08-01T09:00:00.000Z'),
  effectiveTo: null,
  isActive: true,
  createdAt: new Date('2026-08-01T09:00:00.000Z'),
}

let activeServer: Server | null = null
let baseUrl = ''
let transactionError: unknown

function resetMockImplementations() {
  vi.resetAllMocks()
  transactionError = undefined

  prismaMock.$transaction.mockImplementation(
    async (work: (tx: Omit<ModelMocks, '$transaction'>) => Promise<unknown>) => {
      try {
        return await work(transactionMock)
      } catch (error) {
        transactionError = error
        throw error
      }
    },
  )

  transactionMock.etsyFeeConfig.updateMany.mockResolvedValue({ count: 1 })
  transactionMock.etsyFeeConfig.create.mockResolvedValue(activeFeeConfig)
  transactionMock.packagingOverhead.create.mockResolvedValue(activePackaging)
  transactionMock.packagingOverhead.update.mockResolvedValue(activePackaging)
  transactionMock.packagingOverhead.updateMany.mockResolvedValue({ count: 1 })
  transactionMock.postageTier.create.mockResolvedValue(activeTier)
  transactionMock.postageTier.update.mockResolvedValue(activeTier)
  transactionMock.postageTier.updateMany.mockResolvedValue({ count: 1 })
  transactionMock.settingsAuditLog.create.mockResolvedValue({ id: 'audit-1' })
}

async function startServer(): Promise<void> {
  const app = express()
  app.use(express.json())
  app.use('/api/settings', settingsRouter)

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not start')
  activeServer = server
  baseUrl = `http://127.0.0.1:${address.port}`
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const validPath = path
    .replaceAll('packaging-1', packagingRouteId)
    .replaceAll('tier-5', postageTierRouteId)
    .replaceAll('tier-3', otherPostageTierRouteId)
    .replaceAll('/missing', `/${missingRouteId}`)
  return fetch(`${baseUrl}${validPath}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(code, {
    code,
    clientVersion: '6.2.0',
  })
}

beforeEach(() => {
  resetMockImplementations()
})

afterEach(async () => {
  if (!activeServer) return
  await new Promise<void>((resolve, reject) => {
    activeServer!.close((error) => (error ? reject(error) : resolve()))
  })
  activeServer = null
  baseUrl = ''
})

describe('settings router', () => {
  it('keeps the active-only postage filter when includeArchived is omitted', async () => {
    prismaMock.postageTier.findMany.mockResolvedValue([activeTier])
    await startServer()

    const response = await request('/api/settings/postage-tiers')

    expect(response.status).toBe(200)
    expect(prismaMock.postageTier.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { etsyCharge: 'asc' },
    })
  })

  it('removes the active filter when postage includeArchived=true is requested', async () => {
    prismaMock.postageTier.findMany.mockResolvedValue([activeTier, archivedTier])
    await startServer()

    const response = await request('/api/settings/postage-tiers?includeArchived=true')

    expect(response.status).toBe(200)
    expect(prismaMock.postageTier.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { etsyCharge: 'asc' },
    })
  })

  it('keeps the active-only packaging filter when includeArchived is omitted', async () => {
    prismaMock.packagingOverhead.findMany.mockResolvedValue([activePackaging])
    await startServer()

    const response = await request('/api/settings/packaging-overhead')

    expect(response.status).toBe(200)
    expect(prismaMock.packagingOverhead.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
  })

  it('calculates packaging total from active rows when archived rows are included', async () => {
    prismaMock.packagingOverhead.findMany.mockResolvedValue([activePackaging, archivedPackaging])
    await startServer()

    const response = await request('/api/settings/packaging-overhead?includeArchived=true')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.totalPerOrder).toBe(1.25)
    expect(prismaMock.packagingOverhead.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { name: 'asc' },
    })
  })

  it('returns 400 for invalid settings bodies', async () => {
    await startServer()

    const postageResponse = await request('/api/settings/postage-tiers', {
      method: 'POST',
      body: JSON.stringify({ etsyCharge: -1, actualCost: 3.65 }),
    })
    const packagingResponse = await request('/api/settings/packaging-overhead/packaging-1', {
      method: 'PUT',
      body: JSON.stringify({ name: '' }),
    })

    expect(postageResponse.status).toBe(400)
    expect(packagingResponse.status).toBe(400)
  })

  it('returns field-associated validation errors for over-scale postage and packaging money', async () => {
    await startServer()

    const postageResponse = await request('/api/settings/postage-tiers', {
      method: 'POST', body: JSON.stringify({ etsyCharge: 1.234, actualCost: 2 }),
    })
    const packagingResponse = await request('/api/settings/packaging-overhead', {
      method: 'POST', body: JSON.stringify({ name: 'Box', costPerOrder: 1.12345 }),
    })

    expect(postageResponse.status).toBe(400)
    expect(await postageResponse.json()).toMatchObject({ field: 'etsyCharge', error: 'Must have at most 2 decimal places' })
    expect(packagingResponse.status).toBe(400)
    expect(await packagingResponse.json()).toMatchObject({ field: 'costPerOrder', error: 'Must have at most 4 decimal places' })
  })

  it('rejects invalid packaging and postage IDs before calling Prisma', async () => {
    await startServer()

    const responses = await Promise.all([
      request('/api/settings/packaging-overhead/not-a-cuid', { method: 'PUT', body: JSON.stringify({ name: 'Box' }) }),
      request('/api/settings/packaging-overhead/not-a-cuid', { method: 'DELETE' }),
      request('/api/settings/packaging-overhead/not-a-cuid/restore', { method: 'POST' }),
      request('/api/settings/postage-tiers/not-a-cuid', { method: 'PUT', body: JSON.stringify({ actualCost: 2 }) }),
      request('/api/settings/postage-tiers/not-a-cuid', { method: 'DELETE' }),
      request('/api/settings/postage-tiers/not-a-cuid/restore', { method: 'POST' }),
    ])

    for (const response of responses) expect(response.status).toBe(400)
    expect(prismaMock.packagingOverhead.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.postageTier.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('creates a new postage tier and audits the create in the same transaction', async () => {
    const createdTier = { ...activeTier, id: 'tier-new' }
    transactionMock.postageTier.findUnique.mockResolvedValue(null)
    transactionMock.postageTier.create.mockResolvedValue(createdTier)
    await startServer()

    const response = await request('/api/settings/postage-tiers', {
      method: 'POST',
      body: JSON.stringify({ etsyCharge: 7, actualCost: 4.25, label: '  Signed  ' }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ outcome: 'created', item: { id: 'tier-new' } })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(transactionMock.postageTier.create).toHaveBeenCalledWith({
      data: { etsyCharge: 7, actualCost: 4.25, label: 'Signed' },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settingType: 'POSTAGE_TIER',
        settingId: 'tier-new',
        action: 'CREATE',
      }),
    }))
  })

  it('restores and updates an archived £5 tier instead of returning 409', async () => {
    prismaMock.postageTier.findUnique.mockResolvedValue(archivedTier)
    const restoredTier = {
      ...archivedTier,
      etsyCharge: '5.00',
      actualCost: new Prisma.Decimal('3.65'),
      label: 'Tracked',
      isActive: true,
    }
    transactionMock.postageTier.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(archivedTier)
      .mockResolvedValueOnce(archivedTier)
      .mockResolvedValueOnce(restoredTier)
    await startServer()

    const response = await request('/api/settings/postage-tiers', {
      method: 'POST',
      body: JSON.stringify({ etsyCharge: 5, actualCost: 3.65, label: 'Tracked' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      outcome: 'restored',
      item: { id: 'tier-5', etsyCharge: '5.00', actualCost: '3.65', label: 'Tracked', isActive: true },
    })
    expect(transactionMock.postageTier.updateMany).toHaveBeenCalledWith({
      where: { id: 'tier-5', isActive: false },
      data: { actualCost: 3.65, label: 'Tracked', isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', settingId: 'tier-5' }),
    }))
  })

  it('updates an active matching tier and reports updated', async () => {
    transactionMock.postageTier.updateMany.mockResolvedValue({ count: 1 })
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(activeTier)
      .mockResolvedValueOnce({ ...activeTier, actualCost: new Prisma.Decimal('3.95') })
    await startServer()

    const response = await request('/api/settings/postage-tiers', {
      method: 'POST',
      body: JSON.stringify({ etsyCharge: 5, actualCost: 3.95 }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()).outcome).toBe('updated')
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'UPDATE', settingId: 'tier-5' }),
    }))
  })

  it('audits an Add update from the transaction-read active snapshot', async () => {
    const transactionRead = { ...activeTier, actualCost: new Prisma.Decimal('3.75'), label: 'Fresh' }
    const updated = { ...transactionRead, actualCost: new Prisma.Decimal('3.95') }
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(transactionRead)
      .mockResolvedValueOnce(updated)
    transactionMock.postageTier.updateMany.mockResolvedValue({ count: 1 })
    await startServer()

    const response = await request('/api/settings/postage-tiers', {
      method: 'POST', body: JSON.stringify({ etsyCharge: 5, actualCost: 3.95 }),
    })

    expect(response.status).toBe(200)
    expect(prismaMock.postageTier.findUnique).not.toHaveBeenCalled()
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'UPDATE', before: expect.objectContaining({ actualCost: '3.75', label: 'Fresh' }) }),
    }))
  })

  it('restores when an active match is archived before its conditional update', async () => {
    const restoredTier = { ...archivedTier, actualCost: new Prisma.Decimal('3.95'), isActive: true }
    transactionMock.postageTier.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(activeTier)
      .mockResolvedValueOnce(archivedTier)
      .mockResolvedValueOnce(restoredTier)
    await startServer()

    const response = await request('/api/settings/postage-tiers', {
      method: 'POST', body: JSON.stringify({ etsyCharge: 5, actualCost: 3.95 }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ outcome: 'restored', item: { id: 'tier-5', isActive: true } })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', before: expect.objectContaining({ isActive: false }), after: expect.objectContaining({ isActive: true }) }),
    }))
  })

  it('recovers a create uniqueness race by updating the winning row', async () => {
    transactionMock.postageTier.create.mockRejectedValueOnce(knownRequestError('P2002'))
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeTier)
      .mockResolvedValueOnce({ ...activeTier, actualCost: new Prisma.Decimal('3.65') })
    transactionMock.postageTier.updateMany.mockResolvedValue({ count: 1 })
    await startServer()

    const response = await request('/api/settings/postage-tiers', {
      method: 'POST',
      body: JSON.stringify({ etsyCharge: 5, actualCost: 3.65 }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()).outcome).toBe('updated')
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'UPDATE', settingId: 'tier-5' }),
    }))
  })

  it('returns the authoritative active tier without a duplicate restore audit when a concurrent restore wins', async () => {
    transactionMock.postageTier.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(archivedTier)
      .mockResolvedValueOnce({ ...archivedTier, isActive: true })
    await startServer()

    const response = await request('/api/settings/postage-tiers', {
      method: 'POST', body: JSON.stringify({ etsyCharge: 5, actualCost: 3.65 }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ outcome: 'updated', item: { id: 'tier-5', isActive: true } })
    expect(transactionMock.postageTier.updateMany).toHaveBeenCalledWith({
      where: { id: 'tier-5', isActive: true },
      data: { actualCost: 3.65, label: undefined },
    })
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('avoids a duplicate restore audit when the P2002 winner becomes active first', async () => {
    transactionMock.postageTier.create.mockRejectedValueOnce(knownRequestError('P2002'))
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(archivedTier)
      .mockResolvedValueOnce({ ...archivedTier, isActive: true })
    transactionMock.postageTier.updateMany.mockResolvedValue({ count: 0 })
    await startServer()

    const response = await request('/api/settings/postage-tiers', {
      method: 'POST', body: JSON.stringify({ etsyCharge: 5, actualCost: 3.65 }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()).outcome).toBe('updated')
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('rejects editing a tier to a charge owned by a different tier', async () => {
    prismaMock.postageTier.findUnique
      .mockResolvedValueOnce(activeTier)
      .mockResolvedValueOnce({ ...activeTier, id: 'tier-3', etsyCharge: new Prisma.Decimal('5.00') })
    await startServer()

    const response = await request('/api/settings/postage-tiers/tier-3', {
      method: 'PUT',
      body: JSON.stringify({ etsyCharge: 5 }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Etsy charge £5.00 is already used by another tier',
      field: 'etsyCharge',
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('clears an existing postage label when the edit sends null', async () => {
    prismaMock.postageTier.findUnique.mockResolvedValue(activeTier)
    transactionMock.postageTier.update.mockResolvedValue({ ...activeTier, label: null })
    await startServer()

    const response = await request('/api/settings/postage-tiers/tier-5', {
      method: 'PUT',
      body: JSON.stringify({ label: null }),
    })

    expect(response.status).toBe(200)
    expect(transactionMock.postageTier.update).toHaveBeenCalledWith({
      where: { id: postageTierRouteId },
      data: { label: null },
    })
  })

  it('maps missing postage IDs and update P2025 errors to 404', async () => {
    prismaMock.postageTier.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(activeTier)
    transactionMock.postageTier.update.mockRejectedValueOnce(knownRequestError('P2025'))
    await startServer()

    const missingResponse = await request('/api/settings/postage-tiers/missing', {
      method: 'PUT',
      body: JSON.stringify({ actualCost: 2 }),
    })
    const p2025Response = await request('/api/settings/postage-tiers/tier-5', {
      method: 'PUT',
      body: JSON.stringify({ actualCost: 2 }),
    })

    expect(missingResponse.status).toBe(404)
    expect(p2025Response.status).toBe(404)
  })

  it('archives postage tiers idempotently and audits only state changes', async () => {
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(activeTier)
      .mockResolvedValueOnce({ ...activeTier, isActive: false })
      .mockResolvedValueOnce({ ...activeTier, isActive: false })
      .mockResolvedValueOnce({ ...activeTier, isActive: false })
    transactionMock.postageTier.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await startServer()

    const archivedResponse = await request('/api/settings/postage-tiers/tier-5', { method: 'DELETE' })
    const alreadyArchivedResponse = await request('/api/settings/postage-tiers/tier-5', { method: 'DELETE' })

    expect(archivedResponse.status).toBe(204)
    expect(alreadyArchivedResponse.status).toBe(204)
    expect(transactionMock.postageTier.updateMany).toHaveBeenCalledTimes(2)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ARCHIVE', settingId: 'tier-5' }),
    }))
  })

  it('restores a postage tier and does not audit an already active row', async () => {
    transactionMock.postageTier.findUnique
      .mockResolvedValueOnce(archivedTier)
      .mockResolvedValueOnce(activeTier)
      .mockResolvedValueOnce(activeTier)
      .mockResolvedValueOnce(activeTier)
    transactionMock.postageTier.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await startServer()

    const restoredResponse = await request('/api/settings/postage-tiers/tier-5/restore', { method: 'POST' })
    const activeResponse = await request('/api/settings/postage-tiers/tier-5/restore', { method: 'POST' })

    expect(restoredResponse.status).toBe(200)
    expect(await restoredResponse.json()).toMatchObject({ id: 'tier-5', isActive: true })
    expect(activeResponse.status).toBe(200)
    expect(transactionMock.postageTier.updateMany).toHaveBeenCalledTimes(2)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
  })

  it('creates packaging overhead and audits the create transaction', async () => {
    const createdPackaging = { ...activePackaging, id: 'packaging-new' }
    transactionMock.packagingOverhead.create.mockResolvedValue(createdPackaging)
    await startServer()

    const response = await request('/api/settings/packaging-overhead', {
      method: 'POST',
      body: JSON.stringify({ name: '  New Box  ', costPerOrder: 2.5 }),
    })

    expect(response.status).toBe(201)
    expect((await response.json()).id).toBe('packaging-new')
    expect(transactionMock.packagingOverhead.create).toHaveBeenCalledWith({
      data: { name: 'New Box', costPerOrder: 2.5 },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'CREATE', settingId: 'packaging-new', settingType: 'PACKAGING_OVERHEAD' }),
    }))
  })

  it('updates packaging overhead without changing its effectiveTo value', async () => {
    const archivedUpdate = {
      ...archivedPackaging,
      costPerOrder: new Prisma.Decimal('2.50'),
    }
    prismaMock.packagingOverhead.findUnique.mockResolvedValue(archivedPackaging)
    transactionMock.packagingOverhead.update.mockResolvedValue(archivedUpdate)
    await startServer()

    const response = await request('/api/settings/packaging-overhead/packaging-1', {
      method: 'PUT',
      body: JSON.stringify({ costPerOrder: 2.5 }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: 'packaging-1',
      effectiveTo: '2026-08-18T09:00:00.000Z',
    })
    expect(transactionMock.packagingOverhead.update).toHaveBeenCalledWith({
      where: { id: packagingRouteId },
      data: { costPerOrder: 2.5 },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'UPDATE',
        before: expect.objectContaining({ name: 'Old Box', costPerOrder: '9', isActive: false, effectiveTo: '2026-08-18T09:00:00.000Z' }),
        after: expect.objectContaining({ name: 'Old Box', costPerOrder: '2.5', isActive: false, effectiveTo: '2026-08-18T09:00:00.000Z' }),
      }),
    }))
  })

  it('archives and restores packaging overhead while maintaining effectiveTo', async () => {
    transactionMock.packagingOverhead.findUnique
      .mockResolvedValueOnce(activePackaging)
      .mockResolvedValueOnce({ ...activePackaging, effectiveTo: new Date('2026-08-19T10:00:00.000Z'), isActive: false })
      .mockResolvedValueOnce(archivedPackaging)
      .mockResolvedValueOnce(activePackaging)
    transactionMock.packagingOverhead.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
    await startServer()

    const archiveResponse = await request('/api/settings/packaging-overhead/packaging-1', { method: 'DELETE' })
    const restoreResponse = await request('/api/settings/packaging-overhead/packaging-1/restore', { method: 'POST' })

    expect(archiveResponse.status).toBe(204)
    expect(restoreResponse.status).toBe(200)
    expect(transactionMock.packagingOverhead.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: packagingRouteId, isActive: true },
      data: { isActive: false, effectiveTo: expect.any(Date) },
    })
    expect(transactionMock.packagingOverhead.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: packagingRouteId, isActive: false },
      data: { isActive: true, effectiveTo: null },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(2)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ action: 'ARCHIVE', settingType: 'PACKAGING_OVERHEAD' }),
    }))
    expect(transactionMock.settingsAuditLog.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', settingType: 'PACKAGING_OVERHEAD' }),
    }))
  })

  it('maps missing packaging IDs to 404 and makes archive idempotent', async () => {
    prismaMock.packagingOverhead.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    transactionMock.packagingOverhead.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(archivedPackaging)
      .mockResolvedValueOnce(archivedPackaging)
    transactionMock.packagingOverhead.updateMany.mockResolvedValue({ count: 0 })
    await startServer()

    const updateResponse = await request('/api/settings/packaging-overhead/missing', {
      method: 'PUT',
      body: JSON.stringify({ name: 'New name' }),
    })
    const restoreResponse = await request('/api/settings/packaging-overhead/missing/restore', { method: 'POST' })
    const archiveResponse = await request('/api/settings/packaging-overhead/packaging-1', { method: 'DELETE' })

    expect(updateResponse.status).toBe(404)
    expect(restoreResponse.status).toBe(404)
    expect(archiveResponse.status).toBe(204)
    expect(transactionMock.packagingOverhead.updateMany).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('versions Etsy fees and audits deactivation and creation in one transaction', async () => {
    transactionMock.etsyFeeConfig.create.mockResolvedValue({ ...activeFeeConfig, id: 'fees-2' })
    await startServer()

    const response = await request('/api/settings/etsy-fees', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New fees',
        transactionFee: 0.07,
        regulatoryFee: 0.003,
        paymentFeePercent: 0.04,
        paymentFeeFixed: 0.2,
        vatRate: 0.2,
        listingFee: 0.15,
      }),
    })

    expect(response.status).toBe(201)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(transactionMock.etsyFeeConfig.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { isActive: false, effectiveTo: expect.any(Date) },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'CREATE', settingType: 'ETSY_FEE_CONFIG', settingId: 'fees-2' }),
    }))
  })

  it('retries a serializable settings transaction after P2034', async () => {
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw knownRequestError('P2034')
    })
    await startServer()

    const response = await request('/api/settings/etsy-fees', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Retried fees', transactionFee: 0.07, regulatoryFee: 0.003,
        paymentFeePercent: 0.04, paymentFeeFixed: 0.2, vatRate: 0.2, listingFee: 0.15,
      }),
    })

    expect(response.status).toBe(201)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(prismaMock.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  })

  it('returns 500 and rejects the transaction when the audit write fails', async () => {
    transactionMock.etsyFeeConfig.create.mockResolvedValue({ ...activeFeeConfig, id: 'fees-2' })
    transactionMock.settingsAuditLog.create.mockRejectedValueOnce(new Error('audit failed'))
    await startServer()

    const response = await request('/api/settings/etsy-fees', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New fees',
        transactionFee: 0.07,
        regulatoryFee: 0.003,
        paymentFeePercent: 0.04,
        paymentFeeFixed: 0.2,
        vatRate: 0.2,
        listingFee: 0.15,
      }),
    })

    expect(response.status).toBe(500)
    expect(transactionError).toEqual(new Error('audit failed'))
  })

  it('returns at most 100 audit rows ordered newest first', async () => {
    prismaMock.settingsAuditLog.findMany.mockResolvedValue([{ id: 'audit-1' }])
    await startServer()

    const response = await request('/api/settings/audit')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: 'audit-1' }])
    expect(prismaMock.settingsAuditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  })

  it('does not audit a concurrent postage archive that conditionally updates zero rows', async () => {
    transactionMock.postageTier.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.postageTier.findUnique.mockResolvedValue({ ...activeTier, isActive: false })
    await startServer()

    const response = await request('/api/settings/postage-tiers/tier-5', { method: 'DELETE' })

    expect(response.status).toBe(204)
    expect(transactionMock.postageTier.updateMany).toHaveBeenCalledWith({
      where: { id: postageTierRouteId, isActive: true },
      data: { isActive: false },
    })
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('audits a postage archive only when its conditional update changes one row', async () => {
    transactionMock.postageTier.updateMany.mockResolvedValue({ count: 1 })
    transactionMock.postageTier.findUnique.mockResolvedValue({ ...activeTier, isActive: false })
    await startServer()

    const response = await request('/api/settings/postage-tiers/tier-5', { method: 'DELETE' })

    expect(response.status).toBe(204)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
  })

  it('does not audit a concurrent postage restore that conditionally updates zero rows', async () => {
    transactionMock.postageTier.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.postageTier.findUnique.mockResolvedValue(activeTier)
    await startServer()

    const response = await request('/api/settings/postage-tiers/tier-5/restore', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 'tier-5', isActive: true })
    expect(transactionMock.postageTier.updateMany).toHaveBeenCalledWith({
      where: { id: postageTierRouteId, isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('audits a packaging restore only when its conditional update changes one row', async () => {
    transactionMock.packagingOverhead.updateMany.mockResolvedValue({ count: 1 })
    transactionMock.packagingOverhead.findUnique.mockResolvedValue(activePackaging)
    await startServer()

    const response = await request('/api/settings/packaging-overhead/packaging-1/restore', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
  })

  it('does not audit a concurrent packaging archive that conditionally updates zero rows', async () => {
    transactionMock.packagingOverhead.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.packagingOverhead.findUnique.mockResolvedValue({ ...activePackaging, isActive: false })
    await startServer()

    const response = await request('/api/settings/packaging-overhead/packaging-1', { method: 'DELETE' })

    expect(response.status).toBe(204)
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('does not audit a concurrent packaging restore that conditionally updates zero rows', async () => {
    transactionMock.packagingOverhead.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.packagingOverhead.findUnique.mockResolvedValue(activePackaging)
    await startServer()

    const response = await request('/api/settings/packaging-overhead/packaging-1/restore', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 'packaging-1', isActive: true })
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })
})
