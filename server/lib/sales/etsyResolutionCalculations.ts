import type { SaleChannel } from '#contracts/domain/sale'
import type {
  EtsyFeeReconciliationSource,
  EtsyFeeReconciliationStatus,
} from '#contracts/domain/etsyFees'
import type { EtsySaleResolution } from '#contracts/routes/sales'
import { allocateOrderPence, calculateFeeAdjustment, compareIds } from '../etsy/fees/calculations'

export class EtsySaleResolutionCalculationConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EtsySaleResolutionCalculationConflictError'
  }
}

export interface EtsySaleResolutionSnapshot {
  id: string
  saleChannel: SaleChannel
  etsyOrderId: string | null
  grossRevenuePence: number
  postageChargedPence: number
  postageCostPence: number
  transactionFeePence: number
  postageTransactionFeePence: number
  regulatoryFeePence: number
  processingFeePence: number
  vatOnProcessingFeePence: number
  listingFeePence: number
  offsiteAdsAttributed: boolean | null
  offsiteAdsFeePence: number | null
  vatOnOffsiteAdsFeePence: number | null
  etsyFeesPence: number
  packagingOverheadPence: number
  netRevenuePence: number
  totalCostPence: number
  marginPence: number
  etsyPaymentGrossPence: number | null
  etsyPaymentFeesPence: number | null
  etsyPaymentNetPence: number | null
  status: EtsyFeeReconciliationStatus
  source: EtsyFeeReconciliationSource | null
  reconciledAt: string | null
  statementImportId: string | null
  manualResolutionNote: string | null
  updatedAt: string
}

export interface EtsySaleResolutionWrite {
  saleChannel: SaleChannel
  etsyOrderId: string | null
  transactionFeePence: number
  postageTransactionFeePence: number
  regulatoryFeePence: number
  processingFeePence: number
  vatOnProcessingFeePence: number
  listingFeePence: number
  offsiteAdsAttributed: boolean | null
  offsiteAdsFeePence: number | null
  vatOnOffsiteAdsFeePence: number | null
  etsyFeesPence: number
  netRevenuePence: number
  marginPence: number
  etsyPaymentGrossPence: number | null
  etsyPaymentFeesPence: number | null
  etsyPaymentNetPence: number | null
  status: EtsyFeeReconciliationStatus
  source: EtsyFeeReconciliationSource | null
  reconciledAt: 'now' | null
  statementImportId: string | null
  manualResolutionNote: string | null
}

export interface EtsySaleResolutionProposal {
  saleId: string
  expectedUpdatedAt: string
  data: EtsySaleResolutionWrite
}

export interface EtsySaleResolutionCalculation {
  baseReceiptId: string
  resolution: EtsySaleResolution
  proposals: EtsySaleResolutionProposal[]
  warnings: string[]
}

const RECEIPT_ID_PATTERN = /^(\d+)(-\d+)?$/
const PLAUSIBLE_RECEIPT_ID_PATTERN = /^\d{6,}$/
const MAX_SAFE_PENCE = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE_PENCE = BigInt(Number.MIN_SAFE_INTEGER)
const MAX_DATABASE_PENCE = 9_999_999_999n
const MIN_DATABASE_PENCE = -MAX_DATABASE_PENCE

interface GroupContext {
  current: EtsySaleResolutionSnapshot[]
  baseReceiptId: string
  identities: Map<string, { baseId: string; suffix: string }>
}

function assertSafeIntegerPence(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be an integer number of pence`)
  }
}

function assertDatabasePence(value: number, name: string): void {
  assertSafeIntegerPence(value, name)
  const pence = BigInt(value)
  if (pence < MIN_DATABASE_PENCE || pence > MAX_DATABASE_PENCE) {
    throw new RangeError(`${name} exceeds the Decimal(10,2) pence range`)
  }
}

function toSafePence(value: bigint, name: string): number {
  if (value < MIN_SAFE_PENCE || value > MAX_SAFE_PENCE) {
    throw new RangeError(`${name} exceeds the safe integer pence range`)
  }
  if (value < MIN_DATABASE_PENCE || value > MAX_DATABASE_PENCE) {
    throw new RangeError(`${name} exceeds the Decimal(10,2) pence range`)
  }
  return Number(value)
}

function addPence(values: readonly number[], name: string): number {
  let total = 0n
  for (const value of values) {
    assertSafeIntegerPence(value, name)
    total += BigInt(value)
  }
  return toSafePence(total, name)
}

function subtractPence(value: number, subtrahends: readonly number[], name: string): number {
  assertSafeIntegerPence(value, name)
  let result = BigInt(value)
  for (const subtrahend of subtrahends) {
    assertSafeIntegerPence(subtrahend, name)
    result -= BigInt(subtrahend)
  }
  return toSafePence(result, name)
}

function assertNullablePence(value: number | null, name: string): void {
  if (value !== null) assertDatabasePence(value, name)
}

function normalizeNote(note: string | undefined): string | null {
  const normalized = note?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function isPlausibleReceiptId(value: string): boolean {
  return PLAUSIBLE_RECEIPT_ID_PATTERN.test(value) && Number.isSafeInteger(Number(value))
}

function assertPlausibleReceiptId(value: string, name: string): void {
  if (!isPlausibleReceiptId(value)) {
    throw new RangeError(`${name} must be a plausible safe Etsy receipt ID`)
  }
}

function validateSnapshot(snapshot: EtsySaleResolutionSnapshot): void {
  const penceFields: Array<[string, number]> = [
    ['grossRevenuePence', snapshot.grossRevenuePence],
    ['postageChargedPence', snapshot.postageChargedPence],
    ['postageCostPence', snapshot.postageCostPence],
    ['transactionFeePence', snapshot.transactionFeePence],
    ['postageTransactionFeePence', snapshot.postageTransactionFeePence],
    ['regulatoryFeePence', snapshot.regulatoryFeePence],
    ['processingFeePence', snapshot.processingFeePence],
    ['vatOnProcessingFeePence', snapshot.vatOnProcessingFeePence],
    ['listingFeePence', snapshot.listingFeePence],
    ['etsyFeesPence', snapshot.etsyFeesPence],
    ['packagingOverheadPence', snapshot.packagingOverheadPence],
    ['netRevenuePence', snapshot.netRevenuePence],
    ['totalCostPence', snapshot.totalCostPence],
    ['marginPence', snapshot.marginPence],
  ]
  for (const [name, value] of penceFields) assertDatabasePence(value, `${snapshot.id}.${name}`)
  assertNullablePence(snapshot.offsiteAdsFeePence, `${snapshot.id}.offsiteAdsFeePence`)
  assertNullablePence(snapshot.vatOnOffsiteAdsFeePence, `${snapshot.id}.vatOnOffsiteAdsFeePence`)
  assertNullablePence(snapshot.etsyPaymentGrossPence, `${snapshot.id}.etsyPaymentGrossPence`)
  assertNullablePence(snapshot.etsyPaymentFeesPence, `${snapshot.id}.etsyPaymentFeesPence`)
  assertNullablePence(snapshot.etsyPaymentNetPence, `${snapshot.id}.etsyPaymentNetPence`)
  if (snapshot.id.length === 0) throw new TypeError('sale IDs must not be empty')
}

function validateResolution(resolution: EtsySaleResolution): void {
  if (resolution.type === 'reclassify') {
    if (resolution.channel !== 'direct' && resolution.channel !== 'fair') {
      throw new TypeError('reclassification channel must be direct or fair')
    }
    return
  }
  if (resolution.type === 'correct_receipt_id') {
    assertPlausibleReceiptId(resolution.etsyOrderId, 'corrected Etsy receipt ID')
    return
  }
  assertDatabasePence(resolution.offsiteAdsFeePence, 'offsiteAdsFeePence')
  assertDatabasePence(resolution.vatOnOffsiteAdsFeePence, 'vatOnOffsiteAdsFeePence')
  if (resolution.offsiteAdsFeePence < 0 || resolution.vatOnOffsiteAdsFeePence < 0) {
    throw new RangeError('manual Offsite balances must be non-negative pence')
  }
  if (!resolution.attributed
    && (resolution.offsiteAdsFeePence !== 0 || resolution.vatOnOffsiteAdsFeePence !== 0)) {
    throw new RangeError('not-attributed receipts must have zero Offsite fee and VAT')
  }
  if (resolution.etsyOrderId !== undefined) {
    assertPlausibleReceiptId(resolution.etsyOrderId, 'manual Etsy receipt ID')
  }
}

function assertMutableGroup(current: readonly EtsySaleResolutionSnapshot[]): void {
  if (current.some((snapshot) => snapshot.status === 'STATEMENT_VERIFIED'
    || snapshot.status === 'MANUALLY_VERIFIED')) {
    throw new EtsySaleResolutionCalculationConflictError('statement-verified and manually verified Sales are immutable through manual resolution')
  }
}

function buildGroupContext(
  targetSaleId: string,
  resolution: EtsySaleResolution,
  currentGroup: readonly EtsySaleResolutionSnapshot[],
): GroupContext {
  if (!targetSaleId || !currentGroup.some((snapshot) => snapshot.id === targetSaleId)) {
    throw new Error(`target Sale ${targetSaleId} is absent from the receipt group`)
  }
  if (currentGroup.length === 0) throw new Error('receipt group must not be empty')

  const current = [...currentGroup].sort(compareIds)
  const ids = new Set<string>()
  for (const snapshot of current) {
    validateSnapshot(snapshot)
    if (ids.has(snapshot.id)) throw new RangeError('receipt group contains duplicate Sale IDs')
    ids.add(snapshot.id)
    if (snapshot.saleChannel !== 'etsy') {
      throw new EtsySaleResolutionCalculationConflictError('manual Etsy resolution requires Etsy Sales')
    }
  }
  assertMutableGroup(current)

  const identities = new Map<string, { baseId: string; suffix: string }>()
  const validBases = new Set<string>()
  let malformedCount = 0
  for (const snapshot of current) {
    if (snapshot.etsyOrderId === null) {
      malformedCount += 1
      continue
    }
    const identity = receiptIdentity(snapshot.etsyOrderId)
    if (!identity) {
      malformedCount += 1
      continue
    }
    identities.set(snapshot.id, identity)
    validBases.add(identity.baseId)
  }
  if (validBases.size > 1) throw new Error('receipt group mixes base receipts')
  if (validBases.size > 0 && malformedCount > 0) {
    throw new Error('receipt group contains a malformed or missing receipt ID')
  }
  if (resolution.type !== 'reclassify' && malformedCount > 0 && current.length > 1) {
    throw new Error('receipt group contains a malformed receipt ID whose suffix cannot be preserved')
  }

  let baseReceiptId = [...validBases][0]
  if (baseReceiptId === undefined) {
    const firstCurrentOrderId = current.find((snapshot) => snapshot.etsyOrderId !== null)?.etsyOrderId
    if (firstCurrentOrderId !== undefined && firstCurrentOrderId !== null) {
      baseReceiptId = firstCurrentOrderId
    } else if (resolution.type === 'manual_verify' && resolution.etsyOrderId !== undefined) {
      baseReceiptId = resolution.etsyOrderId
    } else {
      baseReceiptId = targetSaleId
    }
  }
  return { current, baseReceiptId, identities }
}

function assertNoCorrectedIdCollision(
  correctedBaseId: string,
  conflictingGroup: readonly EtsySaleResolutionSnapshot[],
): void {
  for (const snapshot of conflictingGroup) {
    if (snapshot.etsyOrderId === null) continue
    const identity = receiptIdentity(snapshot.etsyOrderId)
    if (identity?.baseId === correctedBaseId) {
      throw new EtsySaleResolutionCalculationConflictError(`corrected Etsy receipt ID ${correctedBaseId} collision with an existing receipt group`)
    }
  }
}

function correctedOrderIds(
  current: readonly EtsySaleResolutionSnapshot[],
  identities: ReadonlyMap<string, { baseId: string; suffix: string }>,
  correctedBaseId: string,
): Map<string, string> {
  const orderIds = new Map<string, string>()
  for (const snapshot of current) {
    const identity = identities.get(snapshot.id)
    if (!identity) {
      if (current.length !== 1) {
        throw new Error('receipt suffix cannot be preserved for a malformed or missing current ID')
      }
      orderIds.set(snapshot.id, correctedBaseId)
      continue
    }
    orderIds.set(snapshot.id, `${correctedBaseId}${identity.suffix}`)
  }
  return orderIds
}

function baseWrite(snapshot: EtsySaleResolutionSnapshot): EtsySaleResolutionWrite {
  return {
    saleChannel: snapshot.saleChannel,
    etsyOrderId: snapshot.etsyOrderId,
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
    status: snapshot.status,
    source: snapshot.source,
    reconciledAt: null,
    statementImportId: snapshot.statementImportId,
    manualResolutionNote: snapshot.manualResolutionNote,
  }
}

function assertWritePence(data: EtsySaleResolutionWrite): void {
  const penceFields: Array<[string, number]> = [
    ['transactionFeePence', data.transactionFeePence],
    ['postageTransactionFeePence', data.postageTransactionFeePence],
    ['regulatoryFeePence', data.regulatoryFeePence],
    ['processingFeePence', data.processingFeePence],
    ['vatOnProcessingFeePence', data.vatOnProcessingFeePence],
    ['listingFeePence', data.listingFeePence],
    ['etsyFeesPence', data.etsyFeesPence],
    ['netRevenuePence', data.netRevenuePence],
    ['marginPence', data.marginPence],
  ]
  for (const [name, value] of penceFields) assertDatabasePence(value, name)
  assertNullablePence(data.offsiteAdsFeePence, 'offsiteAdsFeePence')
  assertNullablePence(data.vatOnOffsiteAdsFeePence, 'vatOnOffsiteAdsFeePence')
  assertNullablePence(data.etsyPaymentGrossPence, 'etsyPaymentGrossPence')
  assertNullablePence(data.etsyPaymentFeesPence, 'etsyPaymentFeesPence')
  assertNullablePence(data.etsyPaymentNetPence, 'etsyPaymentNetPence')
}

function buildReclassificationProposals(
  resolution: Extract<EtsySaleResolution, { type: 'reclassify' }>,
  current: readonly EtsySaleResolutionSnapshot[],
): EtsySaleResolutionProposal[] {
  const note = normalizeNote(resolution.note)
  return current.map((snapshot) => {
    const netRevenuePence = subtractPence(
      addPence([snapshot.grossRevenuePence, snapshot.postageChargedPence], `net revenue for ${snapshot.id}`),
      [snapshot.packagingOverheadPence],
      `net revenue for ${snapshot.id}`,
    )
    const marginPence = subtractPence(
      netRevenuePence,
      [snapshot.totalCostPence, snapshot.postageCostPence],
      `margin for ${snapshot.id}`,
    )
    const data: EtsySaleResolutionWrite = {
      saleChannel: resolution.channel,
      etsyOrderId: null,
      transactionFeePence: 0,
      postageTransactionFeePence: 0,
      regulatoryFeePence: 0,
      processingFeePence: 0,
      vatOnProcessingFeePence: 0,
      listingFeePence: 0,
      offsiteAdsAttributed: null,
      offsiteAdsFeePence: null,
      vatOnOffsiteAdsFeePence: null,
      etsyFeesPence: 0,
      netRevenuePence,
      marginPence,
      etsyPaymentGrossPence: null,
      etsyPaymentFeesPence: null,
      etsyPaymentNetPence: null,
      status: 'NOT_APPLICABLE',
      source: 'MANUAL',
      reconciledAt: 'now',
      statementImportId: null,
      manualResolutionNote: note,
    }
    assertWritePence(data)
    return {
      saleId: snapshot.id,
      expectedUpdatedAt: snapshot.updatedAt,
      data,
    }
  })
}

function buildCorrectReceiptIdProposals(
  resolution: Extract<EtsySaleResolution, { type: 'correct_receipt_id' }>,
  context: GroupContext,
): EtsySaleResolutionProposal[] {
  const orderIds = correctedOrderIds(context.current, context.identities, resolution.etsyOrderId)
  const note = normalizeNote(resolution.note)
  return context.current.map((snapshot) => {
    const data = baseWrite(snapshot)
    data.etsyOrderId = orderIds.get(snapshot.id)!
    data.offsiteAdsAttributed = null
    data.offsiteAdsFeePence = null
    data.vatOnOffsiteAdsFeePence = null
    data.etsyPaymentGrossPence = null
    data.etsyPaymentFeesPence = null
    data.etsyPaymentNetPence = null
    data.status = 'PENDING'
    data.source = null
    data.reconciledAt = null
    data.statementImportId = null
    data.manualResolutionNote = note
    assertWritePence(data)
    return { saleId: snapshot.id, expectedUpdatedAt: snapshot.updatedAt, data }
  })
}

function assertIdOnlyCorrectionSafe(current: readonly EtsySaleResolutionSnapshot[]): void {
  for (const snapshot of current) {
    if (snapshot.offsiteAdsFeePence !== null
      || snapshot.vatOnOffsiteAdsFeePence !== null
      || snapshot.offsiteAdsAttributed !== null
      || snapshot.etsyPaymentGrossPence !== null
      || snapshot.etsyPaymentFeesPence !== null
      || snapshot.etsyPaymentNetPence !== null
      || snapshot.statementImportId !== null
      || snapshot.source !== null
      || snapshot.status === 'PAYMENT_SYNCED') {
      throw new EtsySaleResolutionCalculationConflictError('ID-only correction is unsafe when authoritative Offsite or Payment evidence exists')
    }
  }
}

function buildManualVerificationProposals(
  resolution: Extract<EtsySaleResolution, { type: 'manual_verify' }>,
  context: GroupContext,
  conflictingGroup: readonly EtsySaleResolutionSnapshot[],
): EtsySaleResolutionProposal[] {
  const currentBase = context.baseReceiptId
  const correctedBaseId = resolution.etsyOrderId ?? currentBase
  assertPlausibleReceiptId(correctedBaseId, 'manual Etsy receipt ID')
  const orderIds = resolution.etsyOrderId === undefined
    ? new Map(context.current.map((snapshot) => [snapshot.id, snapshot.etsyOrderId!]))
    : correctedOrderIds(context.current, context.identities, resolution.etsyOrderId)
  assertNoCorrectedIdCollision(correctedBaseId, conflictingGroup)

  const weightedSales = context.current.map((snapshot) => ({
    id: snapshot.id,
    grossRevenuePence: snapshot.grossRevenuePence,
  }))
  const offsiteFeeAllocations = allocateOrderPence(resolution.offsiteAdsFeePence, weightedSales)
  const vatAllocations = allocateOrderPence(resolution.vatOnOffsiteAdsFeePence, weightedSales)
  const note = normalizeNote(resolution.note)
  return context.current.map((snapshot) => {
    const nextOffsiteFee = offsiteFeeAllocations.get(snapshot.id) ?? 0
    const nextVat = vatAllocations.get(snapshot.id) ?? 0
    const previousOffsiteFee = snapshot.offsiteAdsFeePence ?? 0
    const previousVat = snapshot.vatOnOffsiteAdsFeePence ?? 0
    const nextFees = addPence([
      snapshot.etsyFeesPence,
      -previousOffsiteFee,
      -previousVat,
      nextOffsiteFee,
      nextVat,
    ], `Etsy fees for ${snapshot.id}`)
    const adjustment = calculateFeeAdjustment({
      etsyFees: snapshot.etsyFeesPence,
      netRevenue: snapshot.netRevenuePence,
      margin: snapshot.marginPence,
    }, nextFees)
    const data: EtsySaleResolutionWrite = {
      saleChannel: 'etsy',
      etsyOrderId: orderIds.get(snapshot.id) ?? null,
      transactionFeePence: snapshot.transactionFeePence,
      postageTransactionFeePence: snapshot.postageTransactionFeePence,
      regulatoryFeePence: snapshot.regulatoryFeePence,
      processingFeePence: snapshot.processingFeePence,
      vatOnProcessingFeePence: snapshot.vatOnProcessingFeePence,
      listingFeePence: snapshot.listingFeePence,
      offsiteAdsAttributed: resolution.attributed,
      offsiteAdsFeePence: nextOffsiteFee,
      vatOnOffsiteAdsFeePence: nextVat,
      etsyFeesPence: adjustment.etsyFeesPence,
      netRevenuePence: adjustment.netRevenuePence,
      marginPence: adjustment.marginPence,
      etsyPaymentGrossPence: null,
      etsyPaymentFeesPence: null,
      etsyPaymentNetPence: null,
      status: 'MANUALLY_VERIFIED',
      source: 'MANUAL',
      reconciledAt: 'now',
      statementImportId: null,
      manualResolutionNote: note,
    }
    assertWritePence(data)
    return {
      saleId: snapshot.id,
      expectedUpdatedAt: snapshot.updatedAt,
      data,
    }
  })
}

export function receiptIdentity(orderId: string): { baseId: string; suffix: string } | null {
  const match = RECEIPT_ID_PATTERN.exec(orderId)
  if (!match) return null
  return { baseId: match[1]!, suffix: match[2] ?? '' }
}

export function buildEtsySaleResolution(
  targetSaleId: string,
  resolution: EtsySaleResolution,
  currentGroup: readonly EtsySaleResolutionSnapshot[],
  conflictingGroup: readonly EtsySaleResolutionSnapshot[],
): EtsySaleResolutionCalculation {
  validateResolution(resolution)
  const context = buildGroupContext(targetSaleId, resolution, currentGroup)
  let proposals: EtsySaleResolutionProposal[]
  let warnings: string[]
  switch (resolution.type) {
    case 'reclassify':
      proposals = buildReclassificationProposals(resolution, context.current)
      warnings = [
        `Reclassification clears Etsy fees and evidence for all ${context.current.length} Sales in the receipt group.`,
      ]
      break
    case 'correct_receipt_id':
      assertNoCorrectedIdCollision(resolution.etsyOrderId, conflictingGroup)
      assertIdOnlyCorrectionSafe(context.current)
      proposals = buildCorrectReceiptIdProposals(resolution, context)
      warnings = [
        'Correcting the receipt ID clears stored attribution, Payment aggregates, statement provenance, and reconciliation timestamp.',
      ]
      break
    case 'manual_verify':
      proposals = buildManualVerificationProposals(resolution, context, conflictingGroup)
      warnings = [
        `Final Offsite fee and VAT balances are allocated across all ${context.current.length} Sales by gross revenue.`,
      ]
      if (!resolution.attributed) warnings.push('Not-attributed verification writes zero Offsite fee and VAT components.')
      if (resolution.etsyOrderId !== undefined) warnings.push('The supplied receipt ID replaces the current receipt base while preserving numeric suffixes.')
      break
  }

  return {
    baseReceiptId: context.baseReceiptId,
    resolution,
    proposals,
    warnings,
  }
}
