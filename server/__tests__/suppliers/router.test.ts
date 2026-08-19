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
  id: 'supplier-1',
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
  id: 'supplier-2',
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

  transactionMock.supplier.create.mockResolvedValue({ ...activeSupplier, id: 'supplier-new' })
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
    prismaMock.supplier.findUnique.mockResolvedValue(archivedSupplier)
    const restoredSupplier = { ...archivedSupplier, isActive: true }
    transactionMock.supplier.update.mockResolvedValue(restoredSupplier)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: ' Home Bargains ' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      outcome: 'restored',
      item: { id: 'supplier-1', name: 'Home Bargains', isActive: true },
    })
    expect(transactionMock.supplier.update).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      data: { isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settingType: 'SUPPLIER',
        settingId: 'supplier-1',
        action: 'RESTORE',
      }),
    }))
    expect(prismaMock.productSupplier.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.productSupplier.createMany).not.toHaveBeenCalled()
    expect(transactionMock.productSupplier.deleteMany).not.toHaveBeenCalled()
    expect(transactionMock.productSupplier.createMany).not.toHaveBeenCalled()
  })

  it('returns the existing active supplier without duplicating or auditing it', async () => {
    prismaMock.supplier.findUnique.mockResolvedValue(activeSupplier)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      item: { id: 'supplier-1', name: 'Home Bargains', isActive: true },
      outcome: 'existing',
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
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
    expect(await activeResponse.json()).toMatchObject([{ id: 'supplier-1', name: 'Home Bargains', isActive: true }])
    expect(archivedResponse.status).toBe(200)
    expect(await archivedResponse.json()).toMatchObject([
      { id: 'supplier-1', name: 'Home Bargains', isActive: true },
      { id: 'supplier-1', name: 'Home Bargains', isActive: false },
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
    const createdSupplier = { ...activeSupplier, id: 'supplier-new', name: 'New Supplier' }
    prismaMock.supplier.findUnique.mockResolvedValue(null)
    transactionMock.supplier.create.mockResolvedValue(createdSupplier)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: '  New Supplier  ' }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      item: { id: 'supplier-new', name: 'New Supplier', isActive: true },
      outcome: 'created',
    })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(transactionMock.supplier.create).toHaveBeenCalledWith({
      data: { name: 'New Supplier' },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settingType: 'SUPPLIER',
        settingId: 'supplier-new',
        action: 'CREATE',
        before: Prisma.DbNull,
        after: { name: 'New Supplier', isActive: true },
      }),
    }))
  })

  it('recovers a create uniqueness race by returning the active winner without auditing a no-op', async () => {
    prismaMock.supplier.findUnique.mockResolvedValue(null)
    transactionMock.supplier.create.mockRejectedValueOnce(knownRequestError('P2002'))
    transactionMock.supplier.findUnique.mockResolvedValue(activeSupplier)
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      item: { id: 'supplier-1', name: 'Home Bargains', isActive: true },
      outcome: 'existing',
    })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(transactionMock.supplier.update).not.toHaveBeenCalled()
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('recovers a create uniqueness race by restoring an archived winner and auditing it', async () => {
    prismaMock.supplier.findUnique.mockResolvedValue(null)
    transactionMock.supplier.create.mockRejectedValueOnce(knownRequestError('P2002'))
    transactionMock.supplier.findUnique.mockResolvedValue(archivedSupplier)
    transactionMock.supplier.update.mockResolvedValue({ ...archivedSupplier, isActive: true })
    await startServer()

    const response = await request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Home Bargains' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ outcome: 'restored', item: { id: 'supplier-1', isActive: true } })
    expect(transactionMock.supplier.update).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      data: { isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', settingId: 'supplier-1' }),
    }))
  })

  it('rejects a rename owned by another supplier and does not start a transaction', async () => {
    prismaMock.supplier.findUnique
      .mockResolvedValueOnce(activeSupplier)
      .mockResolvedValueOnce(otherSupplier)
    await startServer()

    const response = await request('/api/suppliers/supplier-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'B&M' }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Supplier name is already in use', field: 'name' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(transactionMock.settingsAuditLog.create).not.toHaveBeenCalled()
  })

  it('renames a supplier and audits the before and after name snapshots atomically', async () => {
    prismaMock.supplier.findUnique.mockResolvedValueOnce(activeSupplier).mockResolvedValueOnce(null)
    const renamedSupplier = { ...activeSupplier, name: 'New Name' }
    transactionMock.supplier.update.mockResolvedValue(renamedSupplier)
    await startServer()

    const response = await request('/api/suppliers/supplier-1', {
      method: 'PUT',
      body: JSON.stringify({ name: '  New Name  ' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 'supplier-1', name: 'New Name', isActive: true })
    expect(transactionMock.supplier.update).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      data: { name: 'New Name' },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'UPDATE',
        settingType: 'SUPPLIER',
        settingId: 'supplier-1',
        before: { name: 'Home Bargains', isActive: true },
        after: { name: 'New Name', isActive: true },
      }),
    }))
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
    const missingResponse = await request('/api/suppliers/missing', {
      method: 'PUT',
      body: JSON.stringify({ name: 'New Name' }),
    })
    const notFoundResponse = await request('/api/suppliers/supplier-1', {
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

    const archivedResponse = await request('/api/suppliers/supplier-1', { method: 'DELETE' })
    const alreadyArchivedResponse = await request('/api/suppliers/supplier-1', { method: 'DELETE' })

    expect(archivedResponse.status).toBe(204)
    expect(alreadyArchivedResponse.status).toBe(204)
    expect(transactionMock.supplier.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'supplier-1', isActive: true },
      data: { isActive: false },
    })
    expect(transactionMock.supplier.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'supplier-1', isActive: true },
      data: { isActive: false },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ARCHIVE', settingId: 'supplier-1' }),
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

    const restoredResponse = await request('/api/suppliers/supplier-1/restore', { method: 'POST' })
    const alreadyRestoredResponse = await request('/api/suppliers/supplier-1/restore', { method: 'POST' })

    expect(restoredResponse.status).toBe(200)
    expect(await restoredResponse.json()).toMatchObject({ id: 'supplier-1', isActive: true })
    expect(alreadyRestoredResponse.status).toBe(200)
    expect(transactionMock.supplier.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'supplier-1', isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.supplier.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'supplier-1', isActive: false },
      data: { isActive: true },
    })
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledTimes(1)
    expect(transactionMock.settingsAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESTORE', settingId: 'supplier-1' }),
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

    const archiveResponse = await request('/api/suppliers/supplier-1', { method: 'DELETE' })
    const restoreResponse = await request('/api/suppliers/supplier-1/restore', { method: 'POST' })

    expect(archiveResponse.status).toBe(204)
    expect(restoreResponse.status).toBe(200)
    expect(await restoreResponse.json()).toMatchObject({ id: 'supplier-1', isActive: true })
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

    const response = await request('/api/suppliers/supplier-1', { method: 'DELETE' })

    expect(response.status).toBe(500)
    expect(transactionError).toBe(auditError)
    consoleError.mockRestore()
  })
})
