import type { PrismaClient } from '@prisma/client'
import type {
  EtsyFeeReconciliationSource,
  EtsyFeeReconciliationStatus,
} from '#contracts/domain/etsyFees'
import { calculateFeeAdjustment } from './calculations'
import { allocateOrderPence } from './calculations'
import { fingerprintReconciliationInput } from './fingerprint'
import { groupSalesByReceipt } from './grouping'
import { parseEtsyStatement } from './statementParser'
import type {
  NormalizedOrderEvidence,
  SaleFeeProposal,
  SaleFeeSnapshot,
} from './types'

export interface FeeReconciliationSummary {
  matched: number
  changed: number
  unchanged: number
  unmatched: number
  manualReview: number
  attributed: number
  notAttributed: number
  oldFeesPence: number
  newFeesPence: number
  marginDeltaPence: number
}

export interface FeeOrderAllocation {
  saleId: string
  offsiteAdsFeePence: number
  vatOnOffsiteAdsFeePence: number
}

export type FeeOrderOutcome = 'changed' | 'unchanged' | 'unmatched' | 'manual_review'

export interface FeeOrderChange {
  receiptId: string
  saleIds: string[]
  oldStatus: EtsyFeeReconciliationStatus | null
  newStatus: EtsyFeeReconciliationStatus | null
  attributed: boolean | null
  oldFeesPence: number | null
  newFeesPence: number | null
  feeDeltaPence: number
  oldNetRevenuePence: number | null
  newNetRevenuePence: number | null
  marginDeltaPence: number
  offsiteAdsFeePence: number | null
  vatOnOffsiteAdsFeePence: number | null
  source: EtsyFeeReconciliationSource | null
  outcome: FeeOrderOutcome
  message?: string
  allocations: FeeOrderAllocation[]
}

export interface FeeReconciliationPreview {
  fingerprint: string
  statementChecksum: string | null
  receiptIds: string[]
  summary: FeeReconciliationSummary
  changes: FeeOrderChange[]
}

export interface StatementReconciliationInput {
  csv: string
  statementMonth: string
  fileName: string
  allowStatementRevision?: boolean
}

export interface StatementReconciliationApplyInput extends StatementReconciliationInput {
  fingerprint: string
}

export interface StatementReconciliationResult extends FeeReconciliationPreview {
  applied: boolean
  duplicate: boolean
  statementImportId: string | null
}

export interface SavedStatementImport {
  id: string
  checksum: string
  summary: FeeReconciliationPreview['summary']
}

export interface NewStatementImport {
  statementMonth: string
  fileName: string
  checksum: string
}

export interface FeeReconciliationRepository {
  listEtsySaleSnapshots(): Promise<SaleFeeSnapshot[]>
  findStatementImportByChecksum(checksum: string): Promise<SavedStatementImport | null>
  transaction<T>(work: (tx: FeeReconciliationTransaction) => Promise<T>): Promise<T>
}

export interface FeeReconciliationTransaction {
  createStatementImport(input: NewStatementImport): Promise<{ id: string }>
  updateSale(id: string, proposal: SaleFeeProposal, statementImportId: string | null): Promise<void>
  finishStatementImport(id: string, summary: FeeReconciliationPreview['summary']): Promise<void>
}

export class StatementReconciliationConflictError extends Error {
  readonly code = 'STATEMENT_RECONCILIATION_CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'StatementReconciliationConflictError'
  }
}

interface SalePlan {
  snapshot: SaleFeeSnapshot
  proposal: SaleFeeProposal
  allocation: FeeOrderAllocation
  changed: boolean
}

interface ReconciliationPlan extends FeeReconciliationPreview {
  salePlans: SalePlan[]
}

const EMPTY_SUMMARY: FeeReconciliationSummary = {
  matched: 0,
  changed: 0,
  unchanged: 0,
  unmatched: 0,
  manualReview: 0,
  attributed: 0,
  notAttributed: 0,
  oldFeesPence: 0,
  newFeesPence: 0,
  marginDeltaPence: 0,
}

function cloneSummary(summary: FeeReconciliationSummary): FeeReconciliationSummary {
  return { ...summary }
}

function safePence(value: number, name: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be an integer number of pence`)
  }
  return value
}

function addPence(values: readonly number[], name: string): number {
  const total = values.reduce((sum, value) => BigInt(sum) + BigInt(safePence(value, name)), 0n)
  if (total < BigInt(Number.MIN_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} exceeds the safe integer pence range`)
  }
  return Number(total)
}

function nonNullPence(value: number | null): number {
  return value ?? 0
}

function absoluteDifference(left: number, right: number): number {
  return Math.abs(safePence(left, 'left') - safePence(right, 'right'))
}

function statementItemizationMatches(
  snapshots: readonly SaleFeeSnapshot[],
  allocations: readonly FeeOrderAllocation[],
  attributed: boolean | null,
): boolean {
  const allocationBySaleId = new Map(allocations.map((allocation) => [allocation.saleId, allocation]))
  return snapshots.every((snapshot) => {
    if (snapshot.status !== 'STATEMENT_VERIFIED') return true
    const allocation = allocationBySaleId.get(snapshot.id)
    if (!allocation) return false
    if (snapshot.offsiteAdsAttributed !== undefined
      && snapshot.offsiteAdsAttributed !== attributed) return false
    return snapshot.previousOffsiteAdsFeePence === allocation.offsiteAdsFeePence
      && snapshot.previousVatOnOffsiteAdsFeePence === allocation.vatOnOffsiteAdsFeePence
  })
}

function proposalChanged(snapshot: SaleFeeSnapshot, proposal: SaleFeeProposal): boolean {
  return snapshot.etsyFeesPence !== proposal.etsyFeesPence
    || snapshot.netRevenuePence !== proposal.netRevenuePence
    || snapshot.marginPence !== proposal.marginPence
    || snapshot.previousOffsiteAdsFeePence !== proposal.offsiteAdsFeePence
    || snapshot.previousVatOnOffsiteAdsFeePence !== proposal.vatOnOffsiteAdsFeePence
    || snapshot.status !== proposal.status
}

function createUnmatchedChange(receiptId: string, evidence: NormalizedOrderEvidence): FeeOrderChange {
  return {
    receiptId,
    saleIds: [],
    oldStatus: null,
    newStatus: null,
    attributed: evidence.attributed,
    oldFeesPence: null,
    newFeesPence: null,
    feeDeltaPence: 0,
    oldNetRevenuePence: null,
    newNetRevenuePence: null,
    marginDeltaPence: 0,
    offsiteAdsFeePence: evidence.attributed === null ? null : evidence.offsiteAdsFeePence,
    vatOnOffsiteAdsFeePence: evidence.attributed === null ? null : evidence.vatOnOffsiteAdsFeePence,
    source: evidence.source,
    outcome: 'unmatched',
    message: 'No local Etsy sale matched this statement receipt ID',
    allocations: [],
  }
}

function paymentAggregateIsValidated(snapshot: SaleFeeSnapshot): boolean {
  return snapshot.status === 'PAYMENT_SYNCED'
    && snapshot.etsyPaymentGrossPence != null
    && snapshot.etsyPaymentFeesPence != null
    && snapshot.etsyPaymentNetPence != null
}

function buildStatementGroupPlan(
  receiptId: string,
  evidence: NormalizedOrderEvidence,
  snapshots: readonly SaleFeeSnapshot[],
  allowStatementRevision: boolean,
): { plans: SalePlan[]; change: FeeOrderChange } {
  const weightedSales = snapshots.map((snapshot) => ({
    id: snapshot.id,
    grossRevenuePence: snapshot.grossRevenuePence,
  }))
  const offsiteAdsFeeBySaleId = allocateOrderPence(
    evidence.attributed ? nonNullPence(evidence.offsiteAdsFeePence) : 0,
    weightedSales,
  )
  const vatBySaleId = allocateOrderPence(
    evidence.attributed ? nonNullPence(evidence.vatOnOffsiteAdsFeePence) : 0,
    weightedSales,
  )
  const allocations = snapshots.map((snapshot) => ({
    saleId: snapshot.id,
    offsiteAdsFeePence: offsiteAdsFeeBySaleId.get(snapshot.id) ?? 0,
    vatOnOffsiteAdsFeePence: vatBySaleId.get(snapshot.id) ?? 0,
  }))

  if (!allowStatementRevision && !statementItemizationMatches(snapshots, allocations, evidence.attributed)) {
    throw new StatementReconciliationConflictError(
      `Statement evidence for verified order ${receiptId} differs from the saved evidence`,
    )
  }

  const hasPaymentAggregate = snapshots.some(paymentAggregateIsValidated)
  const hasKnownPreviousItemization = snapshots.some((snapshot) => (
    snapshot.previousOffsiteAdsFeePence !== null || snapshot.previousVatOnOffsiteAdsFeePence !== null
  ))
  const paymentContradiction = hasPaymentAggregate && hasKnownPreviousItemization && snapshots.some((snapshot, index) => {
    if (!paymentAggregateIsValidated(snapshot)) return false
    const paymentFeesPence = snapshot.etsyPaymentFeesPence ?? null
    if (paymentFeesPence === null) return false
    const allocation = allocations[index]!
    const baseFees = snapshot.etsyFeesPence
      - nonNullPence(snapshot.previousOffsiteAdsFeePence)
      - nonNullPence(snapshot.previousVatOnOffsiteAdsFeePence)
    const statementTotal = baseFees + allocation.offsiteAdsFeePence + allocation.vatOnOffsiteAdsFeePence
    return absoluteDifference(statementTotal, paymentFeesPence) > 1
  })

  const plans: SalePlan[] = snapshots.map((snapshot, index) => {
    const allocation = allocations[index]!
    if (paymentContradiction) {
      const proposal: SaleFeeProposal = {
        saleId: snapshot.id,
        feeDeltaPence: 0,
        etsyFeesPence: snapshot.etsyFeesPence,
        netRevenuePence: snapshot.netRevenuePence,
        marginPence: snapshot.marginPence,
        offsiteAdsAttributed: null,
        offsiteAdsFeePence: snapshot.previousOffsiteAdsFeePence,
        vatOnOffsiteAdsFeePence: snapshot.previousVatOnOffsiteAdsFeePence,
        etsyPaymentGrossPence: snapshot.etsyPaymentGrossPence ?? null,
        etsyPaymentFeesPence: snapshot.etsyPaymentFeesPence ?? null,
        etsyPaymentNetPence: snapshot.etsyPaymentNetPence ?? null,
        status: 'MANUAL_REVIEW',
        source: 'ETSY_STATEMENT',
      }
      return {
        snapshot,
        proposal,
        allocation,
        changed: proposalChanged(snapshot, proposal),
      }
    }

    const hasPaymentForSale = paymentAggregateIsValidated(snapshot)
    let nextFees: number
    if (hasPaymentForSale) {
      nextFees = snapshot.etsyPaymentFeesPence ?? snapshot.etsyFeesPence
    } else {
      const baseFees = snapshot.etsyFeesPence
        - nonNullPence(snapshot.previousOffsiteAdsFeePence)
        - nonNullPence(snapshot.previousVatOnOffsiteAdsFeePence)
      nextFees = addPence([
        baseFees,
        allocation.offsiteAdsFeePence,
        allocation.vatOnOffsiteAdsFeePence,
      ], `statement fee for ${snapshot.id}`)
    }
    const adjustment = calculateFeeAdjustment({
      etsyFees: snapshot.etsyFeesPence,
      netRevenue: snapshot.netRevenuePence,
      margin: snapshot.marginPence,
    }, nextFees)
    const proposal: SaleFeeProposal = {
      saleId: snapshot.id,
      feeDeltaPence: adjustment.feeDeltaPence,
      etsyFeesPence: adjustment.etsyFeesPence,
      netRevenuePence: adjustment.netRevenuePence,
      marginPence: adjustment.marginPence,
        offsiteAdsAttributed: evidence.attributed,
      offsiteAdsFeePence: allocation.offsiteAdsFeePence,
      vatOnOffsiteAdsFeePence: allocation.vatOnOffsiteAdsFeePence,
      etsyPaymentGrossPence: snapshot.etsyPaymentGrossPence ?? null,
      etsyPaymentFeesPence: snapshot.etsyPaymentFeesPence ?? null,
      etsyPaymentNetPence: snapshot.etsyPaymentNetPence ?? null,
      status: 'STATEMENT_VERIFIED',
      source: 'ETSY_STATEMENT',
    }
    return {
      snapshot,
      proposal,
      allocation,
      changed: proposalChanged(snapshot, proposal),
    }
  })

  const oldFeesPence = addPence(snapshots.map((snapshot) => snapshot.etsyFeesPence), 'old fees')
  const newFeesPence = addPence(plans.map((plan) => plan.proposal.etsyFeesPence), 'new fees')
  const oldNetRevenuePence = addPence(snapshots.map((snapshot) => snapshot.netRevenuePence), 'old net revenue')
  const newNetRevenuePence = addPence(plans.map((plan) => plan.proposal.netRevenuePence), 'new net revenue')
  const marginDeltaPence = addPence(
    plans.map((plan, index) => plan.proposal.marginPence - snapshots[index]!.marginPence),
    'margin delta',
  )
  const feeDeltaPence = newFeesPence - oldFeesPence
  const hasManualReview = plans.some((plan) => plan.proposal.status === 'MANUAL_REVIEW')
  const changed = plans.some((plan) => plan.changed)
  const change: FeeOrderChange = {
    receiptId,
    saleIds: snapshots.map((snapshot) => snapshot.id),
    oldStatus: snapshots[0]?.status ?? null,
    newStatus: hasManualReview ? 'MANUAL_REVIEW' : plans[0]?.proposal.status ?? null,
    attributed: evidence.attributed,
    oldFeesPence,
    newFeesPence,
    feeDeltaPence,
    oldNetRevenuePence,
    newNetRevenuePence,
    marginDeltaPence,
    offsiteAdsFeePence: evidence.attributed === null
      ? null
      : addPence(plans.map((plan) => plan.allocation.offsiteAdsFeePence), 'Offsite Ads fee'),
    vatOnOffsiteAdsFeePence: evidence.attributed === null
      ? null
      : addPence(plans.map((plan) => plan.allocation.vatOnOffsiteAdsFeePence), 'VAT on Offsite Ads fee'),
    source: 'ETSY_STATEMENT',
    outcome: hasManualReview ? 'manual_review' : changed ? 'changed' : 'unchanged',
    ...(hasManualReview
      ? { message: 'Payment aggregate differs from statement evidence by more than one penny' }
      : {}),
    allocations,
  }

  return { plans, change }
}

async function buildStatementPlan(
  input: StatementReconciliationInput,
  db: FeeReconciliationRepository,
): Promise<ReconciliationPlan> {
  const parsed = parseEtsyStatement({ csv: input.csv, statementMonth: input.statementMonth })
  const snapshots = await db.listEtsySaleSnapshots()
  const evidence = [...parsed.evidenceByReceipt.values()]
  const summary = cloneSummary(EMPTY_SUMMARY)
  const changes: FeeOrderChange[] = []
  const salePlans: SalePlan[] = []

  for (const evidenceItem of evidence) {
    if (evidenceItem.attributed === true) summary.attributed += 1
    if (evidenceItem.attributed === false) summary.notAttributed += 1
    const grouped = groupSalesByReceipt(evidenceItem.receiptId, snapshots)
    if (grouped.length === 0) {
      summary.unmatched += 1
      changes.push(createUnmatchedChange(evidenceItem.receiptId, evidenceItem))
      continue
    }

    summary.matched += 1
    const groupPlan = buildStatementGroupPlan(
      evidenceItem.receiptId,
      evidenceItem,
      grouped,
      input.allowStatementRevision === true,
    )
    changes.push(groupPlan.change)
    salePlans.push(...groupPlan.plans)
    summary.oldFeesPence = addPence([summary.oldFeesPence, groupPlan.change.oldFeesPence!], 'summary old fees')
    summary.newFeesPence = addPence([summary.newFeesPence, groupPlan.change.newFeesPence!], 'summary new fees')
    summary.marginDeltaPence = addPence([summary.marginDeltaPence, groupPlan.change.marginDeltaPence], 'summary margin delta')
    for (const plan of groupPlan.plans) {
      if (plan.proposal.status === 'MANUAL_REVIEW') summary.manualReview += 1
      if (plan.changed) summary.changed += 1
      else summary.unchanged += 1
    }
  }

  const fingerprint = fingerprintReconciliationInput(parsed.evidenceByReceipt, snapshots)
  return {
    fingerprint,
    statementChecksum: parsed.statementChecksum,
    receiptIds: [...parsed.coveredReceiptIds],
    summary,
    changes,
    salePlans,
  }
}

export async function previewStatementReconciliation(
  input: StatementReconciliationInput,
  db: FeeReconciliationRepository,
): Promise<FeeReconciliationPreview> {
  const plan = await buildStatementPlan(input, db)
  return {
    fingerprint: plan.fingerprint,
    statementChecksum: plan.statementChecksum,
    receiptIds: plan.receiptIds,
    summary: plan.summary,
    changes: plan.changes,
  }
}

export async function applyStatementReconciliation(
  input: StatementReconciliationApplyInput,
  db: FeeReconciliationRepository,
): Promise<StatementReconciliationResult> {
  const parsed = parseEtsyStatement({ csv: input.csv, statementMonth: input.statementMonth })
  const existing = await db.findStatementImportByChecksum(parsed.statementChecksum)
  if (existing) {
    return {
      fingerprint: input.fingerprint,
      statementChecksum: parsed.statementChecksum,
      receiptIds: [...parsed.coveredReceiptIds],
      summary: cloneSummary(existing.summary),
      changes: [],
      applied: false,
      duplicate: true,
      statementImportId: existing.id,
    }
  }

  const plan = await buildStatementPlan(input, db)
  if (plan.fingerprint !== input.fingerprint) {
    throw new StatementReconciliationConflictError(
      'Statement preview is stale; reload sale state and preview again before applying',
    )
  }

  const created = await db.transaction(async (tx) => {
    const statementImport = await tx.createStatementImport({
      statementMonth: input.statementMonth,
      fileName: input.fileName,
      checksum: parsed.statementChecksum,
    })
    for (const salePlan of plan.salePlans) {
      await tx.updateSale(salePlan.snapshot.id, salePlan.proposal, statementImport.id)
    }
    await tx.finishStatementImport(statementImport.id, plan.summary)
    return statementImport
  })

  return {
    fingerprint: plan.fingerprint,
    statementChecksum: plan.statementChecksum,
    receiptIds: plan.receiptIds,
    summary: plan.summary,
    changes: plan.changes,
    applied: true,
    duplicate: false,
    statementImportId: created.id,
  }
}

export interface PaymentReconciliationResult extends FeeReconciliationPreview {
  applied: boolean
}

function paymentChange(
  receiptId: string,
  snapshots: readonly SaleFeeSnapshot[],
  plans: readonly SalePlan[],
): FeeOrderChange {
  const oldFeesPence = addPence(snapshots.map((snapshot) => snapshot.etsyFeesPence), 'old fees')
  const newFeesPence = addPence(plans.map((plan) => plan.proposal.etsyFeesPence), 'new fees')
  const oldNetRevenuePence = addPence(snapshots.map((snapshot) => snapshot.netRevenuePence), 'old net revenue')
  const newNetRevenuePence = addPence(plans.map((plan) => plan.proposal.netRevenuePence), 'new net revenue')
  const marginDeltaPence = addPence(
    plans.map((plan, index) => plan.proposal.marginPence - snapshots[index]!.marginPence),
    'margin delta',
  )
  const changed = plans.some((plan) => plan.changed)
  const status = plans[0]?.proposal.status ?? null
  return {
    receiptId,
    saleIds: snapshots.map((snapshot) => snapshot.id),
    oldStatus: snapshots[0]?.status ?? null,
    newStatus: status,
    attributed: null,
    oldFeesPence,
    newFeesPence,
    feeDeltaPence: newFeesPence - oldFeesPence,
    oldNetRevenuePence,
    newNetRevenuePence,
    marginDeltaPence,
    offsiteAdsFeePence: null,
    vatOnOffsiteAdsFeePence: null,
    source: 'ETSY_PAYMENT_API',
    outcome: changed ? 'changed' : 'unchanged',
    allocations: [],
  }
}

export async function reconcileImportedPaymentEvidence(
  evidenceInput: NormalizedOrderEvidence | readonly NormalizedOrderEvidence[],
  db: FeeReconciliationRepository,
): Promise<PaymentReconciliationResult> {
  const evidence = Array.isArray(evidenceInput) ? evidenceInput : [evidenceInput]
  const snapshots = await db.listEtsySaleSnapshots()
  const changes: FeeOrderChange[] = []
  const salePlans: SalePlan[] = []
  const summary = cloneSummary(EMPTY_SUMMARY)

  for (const evidenceItem of evidence) {
    const grouped = groupSalesByReceipt(evidenceItem.receiptId, snapshots)
    if (grouped.length === 0) {
      summary.unmatched += 1
      changes.push(createUnmatchedChange(evidenceItem.receiptId, evidenceItem))
      continue
    }
    summary.matched += 1
    const plans: SalePlan[] = []
    for (const snapshot of grouped) {
      if (snapshot.status === 'STATEMENT_VERIFIED') {
        const proposal: SaleFeeProposal = {
          saleId: snapshot.id,
          feeDeltaPence: 0,
          etsyFeesPence: snapshot.etsyFeesPence,
          netRevenuePence: snapshot.netRevenuePence,
          marginPence: snapshot.marginPence,
          offsiteAdsAttributed: null,
          offsiteAdsFeePence: snapshot.previousOffsiteAdsFeePence,
          vatOnOffsiteAdsFeePence: snapshot.previousVatOnOffsiteAdsFeePence,
          etsyPaymentGrossPence: snapshot.etsyPaymentGrossPence ?? null,
          etsyPaymentFeesPence: snapshot.etsyPaymentFeesPence ?? null,
          etsyPaymentNetPence: snapshot.etsyPaymentNetPence ?? null,
          status: snapshot.status,
          source: 'ETSY_PAYMENT_API',
        }
        plans.push({
          snapshot,
          proposal,
          allocation: { saleId: snapshot.id, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0 },
          changed: false,
        })
        continue
      }
      if (evidenceItem.paymentFeesPence === null
        || evidenceItem.paymentGrossPence === null
        || evidenceItem.paymentNetPence === null) {
        const proposal: SaleFeeProposal = {
          saleId: snapshot.id,
          feeDeltaPence: 0,
          etsyFeesPence: snapshot.etsyFeesPence,
          netRevenuePence: snapshot.netRevenuePence,
          marginPence: snapshot.marginPence,
          offsiteAdsAttributed: null,
          offsiteAdsFeePence: snapshot.previousOffsiteAdsFeePence,
          vatOnOffsiteAdsFeePence: snapshot.previousVatOnOffsiteAdsFeePence,
          etsyPaymentGrossPence: snapshot.etsyPaymentGrossPence ?? null,
          etsyPaymentFeesPence: snapshot.etsyPaymentFeesPence ?? null,
          etsyPaymentNetPence: snapshot.etsyPaymentNetPence ?? null,
          status: 'PENDING',
          source: 'ETSY_PAYMENT_API',
        }
        plans.push({
          snapshot,
          proposal,
          allocation: { saleId: snapshot.id, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0 },
          changed: false,
        })
        continue
      }
      const adjustment = calculateFeeAdjustment({
        etsyFees: snapshot.etsyFeesPence,
        netRevenue: snapshot.netRevenuePence,
        margin: snapshot.marginPence,
      }, evidenceItem.paymentFeesPence)
      const proposal: SaleFeeProposal = {
        saleId: snapshot.id,
        feeDeltaPence: adjustment.feeDeltaPence,
        etsyFeesPence: adjustment.etsyFeesPence,
        netRevenuePence: adjustment.netRevenuePence,
        marginPence: adjustment.marginPence,
        offsiteAdsAttributed: null,
        offsiteAdsFeePence: snapshot.previousOffsiteAdsFeePence,
        vatOnOffsiteAdsFeePence: snapshot.previousVatOnOffsiteAdsFeePence,
        etsyPaymentGrossPence: evidenceItem.paymentGrossPence,
        etsyPaymentFeesPence: evidenceItem.paymentFeesPence,
        etsyPaymentNetPence: evidenceItem.paymentNetPence,
        status: 'PAYMENT_SYNCED',
        source: 'ETSY_PAYMENT_API',
      }
      plans.push({
        snapshot,
        proposal,
        allocation: { saleId: snapshot.id, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0 },
        changed: proposalChanged(snapshot, proposal),
      })
    }
    salePlans.push(...plans)
    const change = paymentChange(evidenceItem.receiptId, grouped, plans)
    changes.push(change)
    summary.oldFeesPence = addPence([summary.oldFeesPence, change.oldFeesPence!], 'summary old fees')
    summary.newFeesPence = addPence([summary.newFeesPence, change.newFeesPence!], 'summary new fees')
    summary.marginDeltaPence = addPence([summary.marginDeltaPence, change.marginDeltaPence], 'summary margin delta')
    for (const plan of plans) {
      if (plan.changed) summary.changed += 1
      else summary.unchanged += 1
    }
  }

  const fingerprint = fingerprintReconciliationInput(evidence, snapshots)
  if (salePlans.length === 0) {
    return {
      fingerprint,
      statementChecksum: null,
      receiptIds: evidence.map((item) => item.receiptId).sort(),
      summary,
      changes,
      applied: false,
    }
  }
  await db.transaction(async (tx) => {
    for (const salePlan of salePlans) {
      if (salePlan.changed) {
        await tx.updateSale(salePlan.snapshot.id, salePlan.proposal, null)
      }
    }
  })
  return {
    fingerprint,
    statementChecksum: null,
    receiptIds: evidence.map((item) => item.receiptId).sort(),
    summary,
    changes,
    applied: salePlans.some((plan) => plan.changed),
  }
}

function pounds(value: number | null): number | null {
  return value === null ? null : value / 100
}

function snapshotFromPrisma(row: {
  id: string
  etsyOrderId: string | null
  grossRevenue: { toNumber(): number }
  etsyFees: { toNumber(): number }
  netRevenue: { toNumber(): number }
  margin: { toNumber(): number }
  offsiteAdsFee: { toNumber(): number } | null
  vatOnOffsiteAdsFee: { toNumber(): number } | null
  etsyPaymentGross: { toNumber(): number } | null
  etsyPaymentFees: { toNumber(): number } | null
  etsyPaymentNet: { toNumber(): number } | null
  offsiteAdsAttributed: boolean | null
  etsyFeeReconciliationStatus: EtsyFeeReconciliationStatus
  updatedAt: Date
}): SaleFeeSnapshot {
  const toPence = (value: { toNumber(): number }): number => Math.round(value.toNumber() * 100)
  return {
    id: row.id,
    etsyOrderId: row.etsyOrderId,
    grossRevenuePence: toPence(row.grossRevenue),
    etsyFeesPence: toPence(row.etsyFees),
    netRevenuePence: toPence(row.netRevenue),
    marginPence: toPence(row.margin),
    previousOffsiteAdsFeePence: row.offsiteAdsFee === null ? null : toPence(row.offsiteAdsFee),
    previousVatOnOffsiteAdsFeePence: row.vatOnOffsiteAdsFee === null ? null : toPence(row.vatOnOffsiteAdsFee),
    etsyPaymentGrossPence: row.etsyPaymentGross === null ? null : toPence(row.etsyPaymentGross),
    etsyPaymentFeesPence: row.etsyPaymentFees === null ? null : toPence(row.etsyPaymentFees),
    etsyPaymentNetPence: row.etsyPaymentNet === null ? null : toPence(row.etsyPaymentNet),
    offsiteAdsAttributed: row.offsiteAdsAttributed,
    status: row.etsyFeeReconciliationStatus,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function createPrismaFeeReconciliationRepository(prisma: PrismaClient): FeeReconciliationRepository {
  return {
    async listEtsySaleSnapshots() {
      const rows = await prisma.sale.findMany({
        where: { saleChannel: 'etsy' },
        select: {
          id: true,
          etsyOrderId: true,
          grossRevenue: true,
          etsyFees: true,
          netRevenue: true,
          margin: true,
          offsiteAdsFee: true,
          vatOnOffsiteAdsFee: true,
          etsyPaymentGross: true,
          etsyPaymentFees: true,
          etsyPaymentNet: true,
          offsiteAdsAttributed: true,
          etsyFeeReconciliationStatus: true,
          updatedAt: true,
        },
      })
      return rows.map(snapshotFromPrisma)
    },
    async findStatementImportByChecksum(checksum) {
      const row = await prisma.etsyStatementImport.findUnique({
        where: { checksum },
        select: {
          id: true,
          checksum: true,
          matched: true,
          changed: true,
          unchanged: true,
          unmatched: true,
          manualReview: true,
        },
      })
      if (!row) return null
      return {
        id: row.id,
        checksum: row.checksum,
        summary: {
          matched: row.matched,
          changed: row.changed,
          unchanged: row.unchanged,
          unmatched: row.unmatched,
          manualReview: row.manualReview,
          attributed: 0,
          notAttributed: 0,
          oldFeesPence: 0,
          newFeesPence: 0,
          marginDeltaPence: 0,
        },
      }
    },
    async transaction<T>(work: (tx: FeeReconciliationTransaction) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (transaction) => work({
        async createStatementImport(input) {
          const row = await transaction.etsyStatementImport.create({
            data: {
              statementMonth: new Date(`${input.statementMonth}-01T00:00:00.000Z`),
              filename: input.fileName,
              checksum: input.checksum,
              matched: 0,
              changed: 0,
              unchanged: 0,
              unmatched: 0,
              manualReview: 0,
            },
            select: { id: true },
          })
          return row
        },
        async updateSale(id, proposal, statementImportId) {
          await transaction.sale.update({
            where: { id },
            data: {
              etsyFees: proposal.etsyFeesPence / 100,
              netRevenue: proposal.netRevenuePence / 100,
              margin: proposal.marginPence / 100,
              offsiteAdsAttributed: proposal.offsiteAdsAttributed,
              offsiteAdsFee: pounds(proposal.offsiteAdsFeePence),
              vatOnOffsiteAdsFee: pounds(proposal.vatOnOffsiteAdsFeePence),
              etsyPaymentGross: pounds(proposal.etsyPaymentGrossPence),
              etsyPaymentFees: pounds(proposal.etsyPaymentFeesPence),
              etsyPaymentNet: pounds(proposal.etsyPaymentNetPence),
              etsyFeeReconciliationStatus: proposal.status,
              etsyFeeReconciliationSource: proposal.source,
              etsyFeeReconciledAt: new Date(),
              etsyStatementImportId: statementImportId,
            },
          })
        },
        async finishStatementImport(id, summary) {
          await transaction.etsyStatementImport.update({
            where: { id },
            data: {
              matched: summary.matched,
              changed: summary.changed,
              unchanged: summary.unchanged,
              unmatched: summary.unmatched,
              manualReview: summary.manualReview,
            },
          })
        },
      }))
    },
  }
}
