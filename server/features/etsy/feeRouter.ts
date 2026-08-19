import { Router, type Response } from 'express'
import { ZodError } from 'zod'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getEtsyClient } from '../../lib/etsy/factory'
import type { IEtsyClient } from '../../lib/etsy/types'
import {
  applyPaymentReconciliation,
  PaymentReconciliationConflictError,
  previewPaymentReconciliation,
  type PaymentReconciliationPreview,
} from '../../lib/etsy/fees/paymentReconciliation'
import {
  applyStatementReconciliation,
  previewStatementReconciliation,
  StatementReconciliationConflictError,
  createPrismaFeeReconciliationRepository,
  type FeeReconciliationRepository,
  type FeeReconciliationStatusCount,
  type FeeOrderChange,
  type StatementReconciliationResult,
  type FeeReconciliationPreview,
} from '../../lib/etsy/fees/reconciliationService'
import { parseEtsyStatement } from '../../lib/etsy/fees/statementParser'
import {
  etsyPaymentFeeApplyBodySchema,
  etsyPaymentFeePreviewBodySchema,
  etsyStatementFeeApplyBodySchema,
  etsyStatementFeePreviewBodySchema,
} from '#contracts/routes/etsyFees'
import type { EtsyFeeReconciliationStatusCounts } from '#contracts/domain/etsyFees'

export interface EtsyFeeRouterDependencies {
  db?: FeeReconciliationRepository
  paymentClient?: Pick<IEtsyClient, 'getPaymentsForReceipt'>
  summary?: () => Promise<EtsyFeeReconciliationStatusCounts>
  countEtsyFeeReconciliationStatuses?: () => Promise<FeeReconciliationStatusCount[]>
}

const RECONCILIATION_STATUSES = [
  'NOT_APPLICABLE',
  'PENDING',
  'PAYMENT_SYNCED',
  'STATEMENT_VERIFIED',
  'MANUALLY_VERIFIED',
  'MANUAL_REVIEW',
] as const

class StatementInputValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StatementInputValidationError'
  }
}

function pounds(value: number | null): number | null {
  return value === null ? null : value / 100
}

function serializeChange(change: FeeOrderChange) {
  return {
    receiptId: change.receiptId,
    saleIds: change.saleIds,
    oldStatus: change.oldStatus,
    newStatus: change.newStatus,
    attributed: change.attributed,
    oldFees: pounds(change.oldFeesPence),
    newFees: pounds(change.newFeesPence),
    feeDelta: pounds(change.feeDeltaPence)!,
    oldNetRevenue: pounds(change.oldNetRevenuePence),
    newNetRevenue: pounds(change.newNetRevenuePence),
    marginDelta: pounds(change.marginDeltaPence)!,
    offsiteAdsFee: pounds(change.offsiteAdsFeePence),
    vatOnOffsiteAdsFee: pounds(change.vatOnOffsiteAdsFeePence),
    source: change.source,
    outcome: change.outcome,
    ...(change.message ? { message: change.message } : {}),
    allocations: change.allocations.map((allocation) => ({
      saleId: allocation.saleId,
      offsiteAdsFee: allocation.offsiteAdsFeePence / 100,
      vatOnOffsiteAdsFee: allocation.vatOnOffsiteAdsFeePence / 100,
    })),
  }
}

function serializePreview(result: FeeReconciliationPreview) {
  return {
    fingerprint: result.fingerprint,
    statementChecksum: result.statementChecksum,
    receiptIds: result.receiptIds,
    summary: {
      matched: result.summary.matched,
      changed: result.summary.changed,
      unchanged: result.summary.unchanged,
      unmatched: result.summary.unmatched,
      manualReview: result.summary.manualReview,
      attributed: result.summary.attributed,
      notAttributed: result.summary.notAttributed,
      oldFees: result.summary.oldFeesPence / 100,
      newFees: result.summary.newFeesPence / 100,
      marginDelta: result.summary.marginDeltaPence / 100,
    },
    changes: result.changes.map(serializeChange),
  }
}

function serializePaymentPreview(result: PaymentReconciliationPreview) {
  return {
    ...serializePreview(result),
    canApplyCanonicalFees: result.canApplyCanonicalFees,
    failures: result.failures,
  }
}

function serializeApply(
  result: StatementReconciliationResult,
) {
  return {
    ...serializePreview(result),
    applied: result.applied,
    duplicate: result.duplicate,
    statementImportId: result.statementImportId,
  }
}

function serializePaymentApply(result: PaymentReconciliationPreview & { applied: boolean }) {
  return {
    ...serializePaymentPreview(result),
    applied: result.applied,
    duplicate: false,
    statementImportId: null,
  }
}

function validationError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: error.issues })
  }
  return res.status(400).json({ error: error instanceof Error ? error.message : 'Validation failed' })
}

function conflictError(res: Response, error: Error) {
  return res.status(409).json({ error: error.message, code: 'RECONCILIATION_CONFLICT' })
}

function createDefaultSummaryProvider(
  aggregate?: () => Promise<FeeReconciliationStatusCount[]>,
): () => Promise<EtsyFeeReconciliationStatusCounts> {
  return async () => {
    const counts: EtsyFeeReconciliationStatusCounts = {
      NOT_APPLICABLE: 0,
      PENDING: 0,
      PAYMENT_SYNCED: 0,
      STATEMENT_VERIFIED: 0,
      MANUALLY_VERIFIED: 0,
      MANUAL_REVIEW: 0,
    }
    const rows = await (aggregate ?? (async () => {
      const grouped = await prisma.sale.groupBy({
        by: ['etsyFeeReconciliationStatus'],
        _count: { _all: true },
      })
      return grouped.map((row) => ({
        status: row.etsyFeeReconciliationStatus,
        count: row._count._all,
      }))
    }))()
    for (const row of rows) {
      if (RECONCILIATION_STATUSES.includes(row.status)) {
        counts[row.status] += row.count
      }
    }
    return counts
  }
}

function validateStatementBody<TSchema extends typeof etsyStatementFeePreviewBodySchema | typeof etsyStatementFeeApplyBodySchema>(
  body: unknown,
  schema: TSchema,
): z.infer<TSchema> {
  const parsed = schema.parse(body)
  try {
    parseEtsyStatement({ csv: parsed.csv, statementMonth: parsed.statementMonth })
  } catch (error) {
    throw new StatementInputValidationError(error instanceof Error ? error.message : 'Invalid Etsy statement')
  }
  return parsed
}

export function createEtsyFeeRouter(overrides: EtsyFeeRouterDependencies = {}) {
  const router = Router()
  const db = overrides.db ?? createPrismaFeeReconciliationRepository(prisma)
  const paymentClient = overrides.paymentClient ?? getEtsyClient()
  const summary = overrides.summary ?? createDefaultSummaryProvider(
    overrides.countEtsyFeeReconciliationStatuses
      ?? db.countEtsyFeeReconciliationStatuses?.bind(db),
  )

  router.get('/reconciliation-summary', async (_req, res) => {
    try {
      res.json({ counts: await summary() })
    } catch (error) {
      console.error('Failed to fetch Etsy fee reconciliation summary', error)
      res.status(500).json({ error: 'Failed to fetch Etsy fee reconciliation summary' })
    }
  })

  router.post('/reconcile/payments/preview', async (req, res) => {
    try {
      const input = etsyPaymentFeePreviewBodySchema.parse(req.body)
      const result = await previewPaymentReconciliation(input, { client: paymentClient, db })
      res.json(serializePaymentPreview(result))
    } catch (error) {
      if (error instanceof ZodError) return validationError(res, error)
      console.error('Failed to preview Etsy Payment fees', error)
      res.status(500).json({ error: 'Failed to preview Etsy Payment fees' })
    }
  })

  router.post('/reconcile/payments/apply', async (req, res) => {
    try {
      const input = etsyPaymentFeeApplyBodySchema.parse(req.body)
      const result = await applyPaymentReconciliation(input, { client: paymentClient, db })
      res.json(serializePaymentApply(result))
    } catch (error) {
      if (error instanceof ZodError) return validationError(res, error)
      if (error instanceof PaymentReconciliationConflictError) return conflictError(res, error)
      console.error('Failed to apply Etsy Payment fees', error)
      res.status(500).json({ error: 'Failed to apply Etsy Payment fees' })
    }
  })

  router.post('/statements/preview', async (req, res) => {
    try {
      const input = validateStatementBody(req.body, etsyStatementFeePreviewBodySchema)
      const result = await previewStatementReconciliation(input, db)
      res.json(serializePreview(result))
    } catch (error) {
      if (error instanceof ZodError) return validationError(res, error)
      if (error instanceof StatementReconciliationConflictError) return conflictError(res, error)
      if (error instanceof StatementInputValidationError) return validationError(res, error)
      console.error('Failed to preview Etsy statement fees', error)
      res.status(500).json({ error: 'Failed to preview Etsy statement fees' })
    }
  })

  router.post('/statements/apply', async (req, res) => {
    try {
      const input = validateStatementBody(req.body, etsyStatementFeeApplyBodySchema)
      const result = await applyStatementReconciliation(input, db)
      res.json(serializeApply(result))
    } catch (error) {
      if (error instanceof ZodError) return validationError(res, error)
      if (error instanceof StatementReconciliationConflictError) return conflictError(res, error)
      if (error instanceof StatementInputValidationError) return validationError(res, error)
      console.error('Failed to apply Etsy statement fees', error)
      res.status(500).json({ error: 'Failed to apply Etsy statement fees' })
    }
  })

  return router
}

const router = createEtsyFeeRouter()
export default router
