import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    supplier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    productSupplier: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    settingsAuditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../../lib/prisma'
import suppliersRouter from '../../features/suppliers/router'

type MockFn = ReturnType<typeof vi.fn>
type SupplierModel = {
  findMany: MockFn
  findUnique: MockFn
  create: MockFn
  update: MockFn
  updateMany: MockFn
}
type ProductSupplierModel = {
  findMany: MockFn
  deleteMany: MockFn
  createMany: MockFn
}
type SettingsAuditModel = { create: MockFn }
type PrismaMocks = {
  supplier: SupplierModel
  productSupplier: ProductSupplierModel
  settingsAuditLog: SettingsAuditModel
  $transaction: MockFn
}

const supplierId = 'clx0q2p1w0000s1l1n4m9n9n9'
const otherSupplierId = 'clx0q2p1w0000s1l1n4m9n9na'
const newSupplierId = 'clx0q2p1w0000s1l1n4m9n9nb'
const missingSupplierId = 'clx0q2p1w0000s1l1n4m9n9nc'

const prismaMock = prisma as unknown as PrismaMocks
const transactionMock: Omit<PrismaMocks, '$transaction'> = {
  supplier: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  productSupplier: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  settingsAuditLog: {
    create: vi.fn(),
  },
}

const activeSupplier = {
  id: supplierId,
  name: 'Home Bargains',
  isActive: true,
  createdAt: new Date('2026-08-19T09:00:00.000Z'),
  updatedAt: new Date('2026-08-19T09:00:00.000Z'),
}

const archivedSupplier = {
  ...activeSupplier,
  isActive: false,
  updatedAt: new Date('2026-08-19T10:00:00.000Z'),
}

const otherSupplier = {
  ...activeSupplier,
  id: otherSupplierId,
  name: 'B&M',
}

let activeServer: Server | null = null
let baseUrl = ''
let transactionError: unknown

function resetMockImplementations() {
  vi.resetAllMocks()
  transactionError = undefined

  prismaMock.$transaction.mockImplementation(
    async (work: (tx: Omit<PrismaMocks, '$transaction'>) => Promise<unknown>) => {
      try {
        return await work(transactionMock)
      } catch (error) {
        transactionError = error
        throw error
      }
    },
  )

  transactionMock.supplier.create.mockResolvedValue({ ...activeSupplier, id: newSupplierId })
  transactionMock.supplier.update.mockResolvedValue(activeSupplier)
  transactionMock.supplier.updateMany.mockResolvedValue({ count: 1 })
  transactionMock.settingsAuditLog.create.mockResolvedValue({ id: 'audit-1' })
}

async function startServer(): Promise<void> {
  const app = express()
  app.use(express.json())
  app.use('/api/suppliers', suppliersRouter)

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not start')
  activeServer = server
  baseUrl = `http://127.0.0.1:${address.port}`
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
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

describe('suppliers router', () => {
  it('restores an archived supplier and preserves its ID', async () => {
    const restoredSupplier = { ...archivedSupplier, isActive: true }
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 1 })
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(archivedSupplier)
      .mockResolvedValueOnce(restoredSupplier)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: ' Home Bargains ' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      outcome: 'restored',
      item: { id: supplierId, name: 'Home Bargains', isActive: true },
    })
    expect(transactionMock.supplier.updateMany).toHaveBeenCalledWith({
      where: { id: supplierId, isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.supplier.findUnique).toHaveBeenCalledWith({ where: { id: supplierId } })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settingType: 'SUPPLIER',
        settingId: supplierId,
        action: 'RESTORE',
      }),
    }))
    expect(prismaMock.productSupplier.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.productSupplier.createMany).not.toHaveBeenCalled()
    expect(transactionMock.productSupplier.deleteMany).not.toHaveBeenCalled()
    expect(transactionMock.productSupplier.createMany).not.toHaveBeenCalled()
  })

  it('restores from the transaction-read archived supplier snapshot', async () => {
    const transactionRead = { ...archivedSupplier, name: 'Current Supplier' }
    const restored = { ...transactionRead, isActive: true }
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(transactionRead)
      .mockResolvedValueOnce(restored)
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 1 })
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST', body: JSON.stringify({ name: 'Current Supplier' }),
    })

    expect(response.status).toBe(200)
    expect(prismaMock.supplier.findUnique).not.toHaveBeenCalled()
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', before: { name: 'Current Supplier', isActive: false }, after: { name: 'Current Supplier', isActive: true } }),
    }))
  })

  it('uses the authoritative winner after a P2002 archived restore race', async () => {
    transactionMock.supplier.create.mockRejectedValueOnce(knownRequestError('P2002'))
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(archivedSupplier)
      .mockResolvedValueOnce({ ...archivedSupplier, isActive: true })
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 0 })
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ outcome: 'existing', item: { id: supplierId, isActive: true } })
    expect(transactionMock.supplier.updateMany).toHaveBeenCalledWith({
      where: { id: supplierId, isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('retries P2002 recovery from the transaction-read archived winner snapshot', async () => {
    const transactionRead = { ...archivedSupplier, name: 'Race Winner' }
    const restored = { ...transactionRead, isActive: true }
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(transactionRead)
      .mockResolvedValueOnce(restored)
    transactionMock.supplier.create.mockRejectedValueOnce(knownRequestError('P2002'))
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 1 })
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST', body: JSON.stringify({ name: 'Race Winner' }),
    })

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(prismaMock.supplier.findUnique).not.toHaveBeenCalled()
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', before: { name: 'Race Winner', isActive: false }, after: { name: 'Race Winner', isActive: true } }),
    }))
  })

  it('does not duplicate or audit when a concurrent restore wins the archived create race', async () => {
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(archivedSupplier)
      .mockResolvedValueOnce({ ...archivedSupplier, isActive: true })
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      outcome: 'existing',
      item: { id: supplierId, isActive: true },
    })
    expect(transactionMock.supplier.updateMany).toHaveBeenCalledWith({
      where: { id: supplierId, isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('falls back to the read snapshot when the archived supplier vanishes mid-restore', async () => {
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 1 })
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(archivedSupplier)
      .mockResolvedValueOnce(null)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      outcome: 'existing',
      item: { id: supplierId, name: 'Home Bargains' },
    })
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('returns the existing active supplier without duplicating or auditing it', async () => {
    transactionMock.supplier.findUnique.mockResolvedValue(activeSupplier)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      item: { id: supplierId, name: 'Home Bargains', isActive: true },
      outcome: 'existing',
    })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.supplier.create).not.toHaveBeenCalled()
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('lists active suppliers by default and removes the filter for includeArchived=true', async () => {
    prismaMock.supplier.findMany
      .mockResolvedValueOnce([activeSupplier])
      .mockResolvedValueOnce([activeSupplier, archivedSupplier])
    await startServer()

    const activeResponse = await request('/api/suppliers')
    const archivedResponse = await request('/api/suppliers?includeArchived=true')

    expect(activeResponse.status).toBe(200)
    expect(await activeResponse.json()).toMatchObject([{ id: supplierId, name: 'Home Bargains', isActive: true }])
    expect(archivedResponse.status).toBe(200)
    expect(await archivedResponse.json()).toMatchObject([
      { id: supplierId, name: 'Home Bargains', isActive: true },
      { id: supplierId, name: 'Home Bargains', isActive: false },
    ])
    expect(prismaMock.supplier.findMany).toHaveBeenNthCalledWith(1, {
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
    expect(prismaMock.supplier.findMany).toHaveBeenNthCalledWith(2, {
      where: undefined,
      orderBy: { name: 'asc' },
    })
  })

  it('creates and audits a new supplier in one transaction', async () => {
    const createdSupplier = { ...activeSupplier, id: newSupplierId, name: 'New Supplier' }
    transactionMock.supplier.findUnique.mockResolvedValue(null)
    transactionMock.supplier.create.mockResolvedValue(createdSupplier)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: '  New Supplier  ' }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      item: { id: newSupplierId, name: 'New Supplier', isActive: true },
      outcome: 'created',
    })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(transactionMock.supplier.create).toHaveBeenCalledWith({
      data: { name: 'New Supplier' },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settingType: 'SUPPLIER',
        settingId: newSupplierId,
        action: 'CREATE',
        before: Prisma.DbNull,
        after: { name: 'New Supplier', isActive: true },
      }),
    }))
  })

  it('recovers a create uniqueness race by returning the active winner without auditing a no-op', async () => {
    transactionMock.supplier.create.mockRejectedValueOnce(knownRequestError('P2002'))
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeSupplier)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      item: { id: supplierId, name: 'Home Bargains', isActive: true },
      outcome: 'existing',
    })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(transactionMock.supplier.update).not.toHaveBeenCalled()
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('recovers a create uniqueness race by restoring an archived winner and auditing it', async () => {
    transactionMock.supplier.create.mockRejectedValueOnce(knownRequestError('P2002'))
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 1 })
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(archivedSupplier)
      .mockResolvedValueOnce({ ...archivedSupplier, isActive: true })
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ outcome: 'restored', item: { id: supplierId, isActive: true } })
    expect(transactionMock.supplier.updateMany).toHaveBeenCalledWith({
      where: { id: supplierId, isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', settingId: supplierId }),
    }))
  })

  it('rejects a rename owned by another supplier inside the transaction', async () => {
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(activeSupplier)
      .mockResolvedValueOnce(otherSupplier)
    await startServer()

    const response = await request(`/api/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'B&M' }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Supplier name is already in use', field: 'name' })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('renames a supplier and audits the before and after name snapshots atomically', async () => {
    transactionMock.supplier.findUnique.mockResolvedValueOnce(activeSupplier).mockResolvedValueOnce(null)
    const renamedSupplier = { ...activeSupplier, name: 'New Name' }
    transactionMock.supplier.update.mockResolvedValue(renamedSupplier)
    await startServer()

    const response = await request(`/api/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: '  New Name  ' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: supplierId, name: 'New Name', isActive: true })
    expect(transactionMock.supplier.update).toHaveBeenCalledWith({
      where: { id: supplierId },
      data: { name: 'New Name' },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'UPDATE',
        settingType: 'SUPPLIER',
        settingId: supplierId,
        before: { name: 'Home Bargains', isActive: true },
        after: { name: 'New Name', isActive: true },
      }),
    }))
  })

  it('reads the rename target and conflict inside the transaction before auditing', async () => {
    transactionMock.supplier.findUnique.mockResolvedValueOnce(activeSupplier).mockResolvedValueOnce(null)
    const renamedSupplier = { ...activeSupplier, name: 'New Name' }
    transactionMock.supplier.update.mockImplementation(async () => {
      transactionMock.supplier.findUnique.mockResolvedValueOnce({ ...activeSupplier, isActive: false })
      return renamedSupplier
    })
    await startServer()

    const response = await request(`/api/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'New Name' }),
    })

    expect(response.status).toBe(200)
    expect(transactionMock.supplier.findUnique).toHaveBeenNthCalledWith(1, { where: { id: supplierId } })
    expect(transactionMock.supplier.findUnique).toHaveBeenNthCalledWith(2, { where: { name: 'New Name' } })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ before: { name: 'Home Bargains', isActive: true } }),
    }))
  })

  it('retries a supplier rename and audits the fresh transaction snapshot', async () => {
    const transactionRead = { ...activeSupplier, name: 'Supplier B' }
    const updated = { ...transactionRead, name: 'Supplier C' }
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw knownRequestError('P2034')
    })
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(transactionRead)
      .mockResolvedValueOnce(null)
    transactionMock.supplier.update.mockResolvedValue(updated)
    await startServer()

    const response = await request(`/api/suppliers/${supplierId}`, {
      method: 'PUT', body: JSON.stringify({ name: 'Supplier C' }),
    })

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(prismaMock.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ before: { name: 'Supplier B', isActive: true }, after: { name: 'Supplier C', isActive: true } }),
    }))
  })

  it('rejects invalid supplier IDs before calling Prisma', async () => {
    await startServer()

    const response = await request('/api/suppliers/not-a-cuid/restore', { method: 'POST' })

    expect(response.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.supplier.findUnique).not.toHaveBeenCalled()
  })

  it('maps invalid bodies, missing IDs, update races, and database not-found errors', async () => {
    prismaMock.supplier.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeSupplier)
    transactionMock.supplier.update.mockRejectedValueOnce(knownRequestError('P2025'))
    await startServer()

    const invalidResponse = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: '   ' }),
    })
    const missingResponse = await request(`/api/suppliers/${missingSupplierId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'New Name' }),
    })
    const notFoundResponse = await request(`/api/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'New Name' }),
    })

    expect(invalidResponse.status).toBe(400)
    expect(missingResponse.status).toBe(404)
    expect(notFoundResponse.status).toBe(404)
  })

  it('archives suppliers idempotently and audits only an actual state change', async () => {
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(activeSupplier)
      .mockResolvedValueOnce({ ...activeSupplier, isActive: false })
      .mockResolvedValueOnce({ ...activeSupplier, isActive: false })
      .mockResolvedValueOnce({ ...activeSupplier, isActive: false })
    transactionMock.supplier.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    await startServer()

    const archivedResponse = await request(`/api/suppliers/${supplierId}`, { method: 'DELETE' })
    const alreadyArchivedResponse = await request(`/api/suppliers/${supplierId}`, { method: 'DELETE' })

    expect(archivedResponse.status).toBe(204)
    expect(alreadyArchivedResponse.status).toBe(204)
    expect(transactionMock.supplier.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: supplierId, isActive: true },
      data: { isActive: false },
    })
    expect(transactionMock.supplier.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: supplierId, isActive: true },
      data: { isActive: false },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ARCHIVE', settingId: supplierId }),
    }))
  })

  it('restores suppliers idempotently and audits only an actual state change', async () => {
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(archivedSupplier)
      .mockResolvedValueOnce({ ...archivedSupplier, isActive: true })
      .mockResolvedValueOnce({ ...archivedSupplier, isActive: true })
      .mockResolvedValueOnce({ ...archivedSupplier, isActive: true })
    transactionMock.supplier.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    await startServer()

    const restoredResponse = await request(`/api/suppliers/${supplierId}/restore`, { method: 'POST' })
    const alreadyRestoredResponse = await request(`/api/suppliers/${supplierId}/restore`, { method: 'POST' })

    expect(restoredResponse.status).toBe(200)
    expect(await restoredResponse.json()).toMatchObject({ id: supplierId, isActive: true })
    expect(alreadyRestoredResponse.status).toBe(200)
    expect(transactionMock.supplier.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: supplierId, isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.supplier.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: supplierId, isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', settingId: supplierId }),
    }))
  })

  it('returns existing state without auditing when a concurrent archive or restore wins first', async () => {
    transactionMock.supplier.findUnique
      .mockResolvedValueOnce(activeSupplier)
      .mockResolvedValueOnce({ ...activeSupplier, isActive: false })
      .mockResolvedValueOnce(archivedSupplier)
      .mockResolvedValueOnce({ ...archivedSupplier, isActive: true })
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 0 })
    await startServer()

    const archiveResponse = await request(`/api/suppliers/${supplierId}`, { method: 'DELETE' })
    const restoreResponse = await request(`/api/suppliers/${supplierId}/restore`, { method: 'POST' })

    expect(archiveResponse.status).toBe(204)
    expect(restoreResponse.status).toBe(200)
    expect(await restoreResponse.json()).toMatchObject({ id: supplierId, isActive: true })
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('rolls back the supplier state mutation when the audit write fails', async () => {
    transactionMock.supplier.findUnique.mockResolvedValue(activeSupplier)
    transactionMock.supplier.updateMany.mockResolvedValue({ count: 1 })
    transactionMock.supplier.findUnique.mockResolvedValueOnce(activeSupplier).mockResolvedValueOnce({ ...activeSupplier, isActive: false })
    const auditError = new Error('audit unavailable')
    transactionMock.settingsAuditLog.create.mockRejectedValueOnce(auditError)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await startServer()

    const response = await request(`/api/suppliers/${supplierId}`, { method: 'DELETE' })

    expect(response.status).toBe(500)
    expect(transactionError).toBe(auditError)
    consoleError.mockRestore()
  })
})
