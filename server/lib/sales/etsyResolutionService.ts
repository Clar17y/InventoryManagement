import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  EtsySaleResolution,
  EtsySaleResolutionApplyResult,
  EtsySaleResolutionPreview,
} from '#contracts/routes/sales'
import {
  buildEtsySaleResolution,
  receiptIdentity,
  type EtsySaleResolutionProposal,
  type EtsySaleResolutionSnapshot,
  type EtsySaleResolutionWrite,
} from './etsyResolutionCalculations'

export type { EtsySaleResolutionProposal, EtsySaleResolutionSnapshot } from './etsyResolutionCalculations'

export interface EtsySaleResolutionRepository {
  loadGroupBySaleId(saleId: string): Promise<EtsySaleResolutionSnapshot[]>
  loadGroupByBaseReceiptId(baseReceiptId: string): Promise<EtsySaleResolutionSnapshot[]>
  applyProposals(proposals: readonly EtsySaleResolutionProposal[], appliedAt: Date): Promise<void>
}

export class EtsySaleResolutionConflictError extends Error {
  constructor(message = 'The Etsy Sale changed; preview the resolution again') {
    super(message)
    this.name = 'EtsySaleResolutionConflictError'
  }
}

export class EtsySaleResolutionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EtsySaleResolutionValidationError'
  }
}

export class EtsySaleResolutionNotFoundError extends Error {
  constructor(message = 'Sale not found') {
    super(message)
    this.name = 'EtsySaleResolutionNotFoundError'
  }
}

export interface EtsySaleResolutionPreviewInput {
  saleId: string
  resolution: EtsySaleResolution
}

export interface EtsySaleResolutionApplyInput extends EtsySaleResolutionPreviewInput {
  fingerprint: string
}

export interface EtsySaleResolutionDependencies {
  db: EtsySaleResolutionRepository
  now?: () => Date
}

type EtsySaleResolutionState = EtsySaleResolutionPreview['rows'][number]['before']

function normalizeResolution(resolution: EtsySaleResolution): EtsySaleResolution {
  const normalized = { ...resolution }
  const note = typeof normalized.note === 'string' ? normalized.note.trim() : undefined
  if (note) {
    normalized.note = note
  } else {
    delete normalized.note
  }
  return normalized
}

function stateFromSnapshot(snapshot: EtsySaleResolutionSnapshot): EtsySaleResolutionState {
  return {
    saleChannel: snapshot.saleChannel,
    etsyOrderId: snapshot.etsyOrderId,
    status: snapshot.status,
    source: snapshot.source,
    offsiteAdsAttributed: snapshot.offsiteAdsAttributed,
    transactionFeePence: snapshot.transactionFeePence,
    postageTransactionFeePence: snapshot.postageTransactionFeePence,
    regulatoryFeePence: snapshot.regulatoryFeePence,
    processingFeePence: snapshot.processingFeePence,
    vatOnProcessingFeePence: snapshot.vatOnProcessingFeePence,
    listingFeePence: snapshot.listingFeePence,
    offsiteAdsFeePence: snapshot.offsiteAdsFeePence,
    vatOnOffsiteAdsFeePence: snapshot.vatOnOffsiteAdsFeePence,
    etsyFeesPence: snapshot.etsyFeesPence,
    netRevenuePence: snapshot.netRevenuePence,
    marginPence: snapshot.marginPence,
  }
}

function stateFromProposal(proposal: EtsySaleResolutionProposal): EtsySaleResolutionState {
  const data = proposal.data
  return {
    saleChannel: data.saleChannel,
    etsyOrderId: data.etsyOrderId,
    status: data.status,
    source: data.source,
    offsiteAdsAttributed: data.offsiteAdsAttributed,
    transactionFeePence: data.transactionFeePence,
    postageTransactionFeePence: data.postageTransactionFeePence,
    regulatoryFeePence: data.regulatoryFeePence,
    processingFeePence: data.processingFeePence,
    vatOnProcessingFeePence: data.vatOnProcessingFeePence,
    listingFeePence: data.listingFeePence,
    offsiteAdsFeePence: data.offsiteAdsFeePence,
    vatOnOffsiteAdsFeePence: data.vatOnOffsiteAdsFeePence,
    etsyFeesPence: data.etsyFeesPence,
    netRevenuePence: data.netRevenuePence,
    marginPence: data.marginPence,
  }
}

function sumPence(values: readonly number[], name: string): number {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n)
  if (total < BigInt(Number.MIN_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new EtsySaleResolutionValidationError(`${name} exceeds the safe integer pence range`)
  }
  return Number(total)
}

function differencePence(left: number, right: number, name: string): number {
  const difference = BigInt(left) - BigInt(right)
  if (difference < BigInt(Number.MIN_SAFE_INTEGER) || difference > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new EtsySaleResolutionValidationError(`${name} exceeds the safe integer pence range`)
  }
  return Number(difference)
}

function normalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForFingerprint)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForFingerprint(item)]),
    )
  }
  return value
}

function fingerprintFor(
  resolution: EtsySaleResolution,
  baseReceiptId: string,
  snapshots: readonly EtsySaleResolutionSnapshot[],
): string {
  const canonical = normalizeForFingerprint({
    resolution,
    baseReceiptId,
    saleIds: snapshots.map((snapshot) => snapshot.id),
    sales: snapshots.map((snapshot) => ({
      id: snapshot.id,
      updatedAt: snapshot.updatedAt,
      saleChannel: snapshot.saleChannel,
      etsyOrderId: snapshot.etsyOrderId,
      status: snapshot.status,
      source: snapshot.source,
      reconciledAt: snapshot.reconciledAt,
      manualResolutionNote: snapshot.manualResolutionNote,
      statementImportId: snapshot.statementImportId,
      grossRevenuePence: snapshot.grossRevenuePence,
      postageChargedPence: snapshot.postageChargedPence,
      postageCostPence: snapshot.postageCostPence,
      packagingOverheadPence: snapshot.packagingOverheadPence,
      totalCostPence: snapshot.totalCostPence,
      transactionFeePence: snapshot.transactionFeePence,
      postageTransactionFeePence: snapshot.postageTransactionFeePence,
      regulatoryFeePence: snapshot.regulatoryFeePence,
      processingFeePence: snapshot.processingFeePence,
      vatOnProcessingFeePence: snapshot.vatOnProcessingFeePence,
      listingFeePence: snapshot.listingFeePence,
      offsiteAdsAttributed: snapshot.offsiteAdsAttributed,
      offsiteAdsFeePence: snapshot.offsiteAdsFeePence,
      vatOnOffsiteAdsFeePence: snapshot.vatOnOffsiteAdsFeePence,
      etsyFeesPence: snapshot.etsyFeesPence,
      netRevenuePence: snapshot.netRevenuePence,
      marginPence: snapshot.marginPence,
      etsyPaymentGrossPence: snapshot.etsyPaymentGrossPence,
      etsyPaymentFeesPence: snapshot.etsyPaymentFeesPence,
      etsyPaymentNetPence: snapshot.etsyPaymentNetPence,
    })),
  })
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')
}

function isConflictMessage(message: string): boolean {
  return /collision|immutable|statement[- ]verified|manually verified|requires Etsy Sales/i.test(message)
}

function wrapCalculationError(error: unknown): Error {
  if (error instanceof EtsySaleResolutionConflictError
    || error instanceof EtsySaleResolutionValidationError
    || error instanceof EtsySaleResolutionNotFoundError) {
    return error
  }
  const message = error instanceof Error ? error.message : 'Invalid Etsy Sale resolution'
  if (isConflictMessage(message)) return new EtsySaleResolutionConflictError(message)
  return new EtsySaleResolutionValidationError(message)
}

function correctedBaseId(resolution: EtsySaleResolution): string | null {
  if (resolution.type !== 'correct_receipt_id' && resolution.type !== 'manual_verify') return null
  return resolution.etsyOrderId ?? null
}

interface BuiltPreview {
  preview: EtsySaleResolutionPreview
  proposals: EtsySaleResolutionProposal[]
}

async function buildPreview(
  input: EtsySaleResolutionPreviewInput,
  deps: EtsySaleResolutionDependencies,
): Promise<BuiltPreview> {
  const resolution = normalizeResolution(input.resolution)
  const currentGroup = await deps.db.loadGroupBySaleId(input.saleId)
  if (currentGroup.length === 0 || !currentGroup.some((snapshot) => snapshot.id === input.saleId)) {
    throw new EtsySaleResolutionNotFoundError(`Sale ${input.saleId} not found`)
  }

  const currentTarget = currentGroup.find((snapshot) => snapshot.id === input.saleId)
  const currentIdentity = currentTarget?.etsyOrderId === null || currentTarget?.etsyOrderId === undefined
    ? null
    : receiptIdentity(currentTarget.etsyOrderId)
  const correctedId = correctedBaseId(resolution)
  const conflictingGroup = correctedId !== null && correctedId !== currentIdentity?.baseId
    ? await deps.db.loadGroupByBaseReceiptId(correctedId)
    : []

  let calculation
  try {
    calculation = buildEtsySaleResolution(input.saleId, resolution, currentGroup, conflictingGroup)
  } catch (error) {
    throw wrapCalculationError(error)
  }

  const byId = new Map(currentGroup.map((snapshot) => [snapshot.id, snapshot]))
  const rows = calculation.proposals.map((proposal) => {
    const before = byId.get(proposal.saleId)
    if (!before) throw new EtsySaleResolutionValidationError(`Sale ${proposal.saleId} disappeared from the group`)
    return {
      saleId: proposal.saleId,
      before: stateFromSnapshot(before),
      after: stateFromProposal(proposal),
    }
  })
  const oldFeesPence = sumPence(currentGroup.map((snapshot) => snapshot.etsyFeesPence), 'old fees')
  const newFeesPence = sumPence(calculation.proposals.map((proposal) => proposal.data.etsyFeesPence), 'new fees')
  const oldNetRevenuePence = sumPence(currentGroup.map((snapshot) => snapshot.netRevenuePence), 'old net revenue')
  const newNetRevenuePence = sumPence(calculation.proposals.map((proposal) => proposal.data.netRevenuePence), 'new net revenue')
  const oldMarginPence = sumPence(currentGroup.map((snapshot) => snapshot.marginPence), 'old margin')
  const newMarginPence = sumPence(calculation.proposals.map((proposal) => proposal.data.marginPence), 'new margin')
  const orderedSnapshots = calculation.proposals
    .map((proposal) => byId.get(proposal.saleId))
    .filter((snapshot): snapshot is EtsySaleResolutionSnapshot => snapshot !== undefined)

  const preview: EtsySaleResolutionPreview = {
    resolution,
    baseReceiptId: calculation.baseReceiptId,
    saleIds: calculation.proposals.map((proposal) => proposal.saleId),
    fingerprint: fingerprintFor(resolution, calculation.baseReceiptId, orderedSnapshots),
    summary: {
      oldFeesPence,
      newFeesPence,
      feeDeltaPence: differencePence(newFeesPence, oldFeesPence, 'fee delta'),
      oldNetRevenuePence,
      newNetRevenuePence,
      netRevenueDeltaPence: differencePence(newNetRevenuePence, oldNetRevenuePence, 'net revenue delta'),
      oldMarginPence,
      newMarginPence,
      marginDeltaPence: differencePence(newMarginPence, oldMarginPence, 'margin delta'),
    },
    rows,
    warnings: calculation.warnings,
  }
  return { preview, proposals: calculation.proposals }
}

export async function previewEtsySaleResolution(
  input: EtsySaleResolutionPreviewInput,
  deps: EtsySaleResolutionDependencies,
): Promise<EtsySaleResolutionPreview> {
  const { preview } = await buildPreview(input, deps)
  return preview
}

export async function applyEtsySaleResolution(
  input: EtsySaleResolutionApplyInput,
  deps: EtsySaleResolutionDependencies,
): Promise<EtsySaleResolutionApplyResult> {
  const { preview, proposals } = await buildPreview(input, deps)
  if (preview.fingerprint !== input.fingerprint) {
    throw new EtsySaleResolutionConflictError('The Etsy Sale changed; preview the resolution again')
  }

  const appliedAt = deps.now?.() ?? new Date()
  await deps.db.applyProposals(proposals, appliedAt)
  return { ...preview, applied: true }
}

const saleSnapshotSelect = {
  id: true,
  saleChannel: true,
  etsyOrderId: true,
  grossRevenue: true,
  postageCharged: true,
  postageCost: true,
  transactionFee: true,
  postageTransactionFee: true,
  regulatoryFee: true,
  processingFee: true,
  vatOnProcessingFee: true,
  listingFee: true,
  offsiteAdsAttributed: true,
  offsiteAdsFee: true,
  vatOnOffsiteAdsFee: true,
  etsyFees: true,
  packagingOverhead: true,
  netRevenue: true,
  totalCost: true,
  margin: true,
  etsyPaymentGross: true,
  etsyPaymentFees: true,
  etsyPaymentNet: true,
  etsyFeeReconciliationStatus: true,
  etsyFeeReconciliationSource: true,
  etsyFeeReconciledAt: true,
  etsyStatementImportId: true,
  etsyManualResolutionNote: true,
  updatedAt: true,
} as const

const saleMembershipSelect = {
  id: true,
  etsyOrderId: true,
  updatedAt: true,
} as const

function receiptGroupPredicates(baseReceiptIds: Iterable<string>) {
  return [...baseReceiptIds].flatMap((baseReceiptId) => [
    { etsyOrderId: baseReceiptId },
    { etsyOrderId: { startsWith: `${baseReceiptId}-` } },
  ])
}

type SaleSnapshotRow = {
  [key in keyof typeof saleSnapshotSelect]: unknown
}

function decimalToPence(value: unknown, field: string): number {
  const fixed = typeof value === 'object' && value !== null && 'toFixed' in value
    && typeof value.toFixed === 'function'
    ? value.toFixed(2)
    : new Prisma.Decimal(String(value)).toFixed(2)
  const match = /^(-?)(\d+)\.(\d{2})$/u.exec(fixed)
  if (!match) throw new Error(`${field} is not a two-decimal Decimal`)
  const pence = BigInt(`${match[1] === '-' ? '-' : ''}${match[2]}${match[3]}`)
  if (pence < BigInt(Number.MIN_SAFE_INTEGER) || pence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${field} exceeds the safe integer pence range`)
  }
  return Number(pence)
}

function toSnapshot(row: SaleSnapshotRow): EtsySaleResolutionSnapshot {
  const dateString = (value: unknown): string | null => value instanceof Date ? value.toISOString() : value as string | null
  return {
    id: row.id as string,
    saleChannel: row.saleChannel as EtsySaleResolutionSnapshot['saleChannel'],
    etsyOrderId: row.etsyOrderId as string | null,
    grossRevenuePence: decimalToPence(row.grossRevenue, 'grossRevenue'),
    postageChargedPence: decimalToPence(row.postageCharged, 'postageCharged'),
    postageCostPence: decimalToPence(row.postageCost, 'postageCost'),
    transactionFeePence: decimalToPence(row.transactionFee, 'transactionFee'),
    postageTransactionFeePence: decimalToPence(row.postageTransactionFee, 'postageTransactionFee'),
    regulatoryFeePence: decimalToPence(row.regulatoryFee, 'regulatoryFee'),
    processingFeePence: decimalToPence(row.processingFee, 'processingFee'),
    vatOnProcessingFeePence: decimalToPence(row.vatOnProcessingFee, 'vatOnProcessingFee'),
    listingFeePence: decimalToPence(row.listingFee, 'listingFee'),
    offsiteAdsAttributed: row.offsiteAdsAttributed as boolean | null,
    offsiteAdsFeePence: row.offsiteAdsFee === null ? null : decimalToPence(row.offsiteAdsFee, 'offsiteAdsFee'),
    vatOnOffsiteAdsFeePence: row.vatOnOffsiteAdsFee === null ? null : decimalToPence(row.vatOnOffsiteAdsFee, 'vatOnOffsiteAdsFee'),
    etsyFeesPence: decimalToPence(row.etsyFees, 'etsyFees'),
    packagingOverheadPence: decimalToPence(row.packagingOverhead, 'packagingOverhead'),
    netRevenuePence: decimalToPence(row.netRevenue, 'netRevenue'),
    totalCostPence: decimalToPence(row.totalCost, 'totalCost'),
    marginPence: decimalToPence(row.margin, 'margin'),
    etsyPaymentGrossPence: row.etsyPaymentGross === null ? null : decimalToPence(row.etsyPaymentGross, 'etsyPaymentGross'),
    etsyPaymentFeesPence: row.etsyPaymentFees === null ? null : decimalToPence(row.etsyPaymentFees, 'etsyPaymentFees'),
    etsyPaymentNetPence: row.etsyPaymentNet === null ? null : decimalToPence(row.etsyPaymentNet, 'etsyPaymentNet'),
    status: row.etsyFeeReconciliationStatus as EtsySaleResolutionSnapshot['status'],
    source: row.etsyFeeReconciliationSource as EtsySaleResolutionSnapshot['source'],
    reconciledAt: dateString(row.etsyFeeReconciledAt),
    statementImportId: row.etsyStatementImportId as string | null,
    manualResolutionNote: row.etsyManualResolutionNote as string | null,
    updatedAt: dateString(row.updatedAt)!,
  }
}

function penceToDecimal(pence: number): Prisma.Decimal {
  const sign = pence < 0 ? '-' : ''
  const digits = Math.abs(pence).toString().padStart(3, '0')
  return new Prisma.Decimal(`${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`)
}

function writeData(data: EtsySaleResolutionWrite, appliedAt: Date): Prisma.SaleUncheckedUpdateManyInput {
  const decimal = (value: number | null): Prisma.Decimal | null => value === null ? null : penceToDecimal(value)
  return {
    saleChannel: data.saleChannel,
    etsyOrderId: data.etsyOrderId,
    transactionFee: penceToDecimal(data.transactionFeePence),
    postageTransactionFee: penceToDecimal(data.postageTransactionFeePence),
    regulatoryFee: penceToDecimal(data.regulatoryFeePence),
    processingFee: penceToDecimal(data.processingFeePence),
    vatOnProcessingFee: penceToDecimal(data.vatOnProcessingFeePence),
    listingFee: penceToDecimal(data.listingFeePence),
    offsiteAdsAttributed: data.offsiteAdsAttributed,
    offsiteAdsFee: decimal(data.offsiteAdsFeePence),
    vatOnOffsiteAdsFee: decimal(data.vatOnOffsiteAdsFeePence),
    etsyFees: penceToDecimal(data.etsyFeesPence),
    netRevenue: penceToDecimal(data.netRevenuePence),
    margin: penceToDecimal(data.marginPence),
    etsyPaymentGross: decimal(data.etsyPaymentGrossPence),
    etsyPaymentFees: decimal(data.etsyPaymentFeesPence),
    etsyPaymentNet: decimal(data.etsyPaymentNetPence),
    etsyFeeReconciliationStatus: data.status,
    etsyFeeReconciliationSource: data.source,
    etsyFeeReconciledAt: data.reconciledAt === 'now' ? appliedAt : null,
    etsyStatementImportId: data.statementImportId,
    etsyManualResolutionNote: data.manualResolutionNote,
  }
}

async function assertGroupMembership(
  tx: Prisma.TransactionClient,
  proposals: readonly EtsySaleResolutionProposal[],
): Promise<void> {
  if (proposals.length === 0) return

  const saleIds = proposals.map((proposal) => proposal.saleId)
  const expectedRows = await tx.sale.findMany({
    where: { id: { in: saleIds } },
    select: saleMembershipSelect,
  })
  const expectedById = new Map(expectedRows.map((row) => [row.id, row]))
  if (expectedById.size !== saleIds.length || saleIds.some((saleId) => !expectedById.has(saleId))) {
    throw new EtsySaleResolutionConflictError('The Etsy receipt group changed; preview the resolution again')
  }
  for (const proposal of proposals) {
    const row = expectedById.get(proposal.saleId)
    if (!row || row.updatedAt.getTime() !== new Date(proposal.expectedUpdatedAt).getTime()) {
      throw new EtsySaleResolutionConflictError('The Etsy Sale changed; preview the resolution again')
    }
  }

  const baseReceiptIds = new Set<string>()
  for (const row of expectedRows) {
    if (row.etsyOrderId === null) continue
    const identity = receiptIdentity(row.etsyOrderId)
    if (identity) baseReceiptIds.add(identity.baseId)
  }
  for (const proposal of proposals) {
    if (proposal.data.etsyOrderId === null) continue
    const identity = receiptIdentity(proposal.data.etsyOrderId)
    if (identity) baseReceiptIds.add(identity.baseId)
  }
  if (baseReceiptIds.size === 0) return

  const candidateRows = await tx.sale.findMany({
    where: { OR: receiptGroupPredicates(baseReceiptIds) },
    select: saleMembershipSelect,
  })
  const candidateIds = new Set(
    candidateRows
      .filter((row) => row.etsyOrderId !== null
        && baseReceiptIds.has(receiptIdentity(row.etsyOrderId)?.baseId ?? ''))
      .map((row) => row.id),
  )
  const expectedIds = new Set(saleIds)
  if (candidateIds.size !== expectedIds.size || [...expectedIds].some((saleId) => !candidateIds.has(saleId))) {
    throw new EtsySaleResolutionConflictError('The Etsy receipt group changed; preview the resolution again')
  }
}

export function createPrismaEtsySaleResolutionRepository(prisma: PrismaClient): EtsySaleResolutionRepository {
  async function loadGroupByBaseReceiptId(baseReceiptId: string): Promise<EtsySaleResolutionSnapshot[]> {
    const rows = await prisma.sale.findMany({
      where: {
        OR: receiptGroupPredicates([baseReceiptId]),
      },
      select: saleSnapshotSelect,
    })
    return (rows as unknown as SaleSnapshotRow[])
      .filter((row) => typeof row.etsyOrderId === 'string'
        && receiptIdentity(row.etsyOrderId)?.baseId === baseReceiptId)
      .map(toSnapshot)
  }

  return {
    async loadGroupBySaleId(saleId: string): Promise<EtsySaleResolutionSnapshot[]> {
      const target = await prisma.sale.findUnique({ where: { id: saleId }, select: saleSnapshotSelect })
      if (!target) return []
      const targetSnapshot = toSnapshot(target as unknown as SaleSnapshotRow)
      const identity = targetSnapshot.etsyOrderId === null ? null : receiptIdentity(targetSnapshot.etsyOrderId)
      if (!identity) return [targetSnapshot]
      return loadGroupByBaseReceiptId(identity.baseId)
    },
    loadGroupByBaseReceiptId,
    async applyProposals(proposals: readonly EtsySaleResolutionProposal[], appliedAt: Date): Promise<void> {
      await prisma.$transaction(async (tx) => {
        await assertGroupMembership(tx, proposals)
        for (const proposal of proposals) {
          const result = await tx.sale.updateMany({
            where: { id: proposal.saleId, updatedAt: new Date(proposal.expectedUpdatedAt) },
            data: writeData(proposal.data, appliedAt),
          })
          if (result.count !== 1) throw new EtsySaleResolutionConflictError()
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    },
  }
}
