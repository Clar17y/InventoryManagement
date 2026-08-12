import { useCallback, useEffect, useState } from 'react'
import {
  etsy,
  type EtsyFeeReconciliationPreview,
  type EtsyPaymentFeeApplyResult,
  type EtsyPaymentFeePreview,
  type EtsyFeeReconciliationApplyResult,
  type EtsyFeeReconciliationStatusCounts,
} from '../../../lib/api'
import { ApiError } from '../../../lib/api/request'

type LoadingAction =
  | 'summary'
  | 'payment-preview'
  | 'payment-apply'
  | 'statement-preview'
  | 'statement-apply'
  | null

type SummaryResponse = Awaited<ReturnType<typeof etsy.getFeeReconciliationSummary>>

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function isConflict(error: unknown): error is ApiError {
  return (
    (error instanceof ApiError || (typeof error === 'object' && error !== null && 'status' in error))
    && (error as { status?: unknown }).status === 409
  )
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read statement file'))
    reader.readAsText(file)
  })
}

export interface UseEtsyFeeReconciliationOptions {
  onImportComplete: () => void
}

export function useEtsyFeeReconciliation({ onImportComplete }: UseEtsyFeeReconciliationOptions) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [paymentPreview, setPaymentPreview] = useState<EtsyPaymentFeePreview | null>(null)
  const [paymentResult, setPaymentResult] = useState<EtsyPaymentFeeApplyResult | null>(null)
  const [statementPreview, setStatementPreview] = useState<EtsyFeeReconciliationPreview | null>(null)
  const [statementResult, setStatementResult] = useState<EtsyFeeReconciliationApplyResult | null>(null)
  const [statementFile, setStatementFile] = useState<File | null>(null)
  const [statementMonth, setStatementMonth] = useState('')
  const [statementRevisionConfirmed, setStatementRevisionConfirmed] = useState(false)
  const [statementRevisionRequired, setStatementRevisionRequired] = useState(false)
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setLoadingAction('summary')
    try {
      const result = await etsy.getFeeReconciliationSummary()
      setSummary(result)
      return result
    } catch (loadError) {
      setError(errorMessage(loadError, 'Failed to load fee reconciliation status'))
      return null
    } finally {
      setLoadingAction((current) => (current === 'summary' ? null : current))
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const previewPaymentFees = useCallback(async () => {
    setLoadingAction('payment-preview')
    setError(null)
    setPaymentPreview(null)
    setPaymentResult(null)
    try {
      const result = await etsy.previewPaymentFees({ limit: 25 })
      setPaymentPreview(result)
      return result
    } catch (previewError) {
      setError(errorMessage(previewError, 'Failed to preview Etsy Payment fees'))
      return null
    } finally {
      setLoadingAction((current) => (current === 'payment-preview' ? null : current))
    }
  }, [])

  const applyPaymentFees = useCallback(async () => {
    if (!paymentPreview?.fingerprint) return null

    setLoadingAction('payment-apply')
    setError(null)
    try {
      const result = await etsy.applyPaymentFees({
        receiptIds: paymentPreview.receiptIds,
        fingerprint: paymentPreview.fingerprint,
      })
      setPaymentResult(result)
      setPaymentPreview(null)
      await loadSummary()
      onImportComplete()
      return result
    } catch (applyError) {
      if (isConflict(applyError)) {
        setPaymentPreview(null)
        setPaymentResult(null)
      }
      setError(errorMessage(applyError, 'Failed to apply Etsy Payment fees'))
      return null
    } finally {
      setLoadingAction((current) => (current === 'payment-apply' ? null : current))
    }
  }, [loadSummary, onImportComplete, paymentPreview])

  const setSelectedStatementFile = useCallback((file: File | null) => {
    setStatementFile(file)
    setStatementPreview(null)
    setStatementResult(null)
    setStatementRevisionConfirmed(false)
    setStatementRevisionRequired(false)
    setError(null)
  }, [])

  const setSelectedStatementMonth = useCallback((month: string) => {
    setStatementMonth(month)
    setStatementPreview(null)
    setStatementResult(null)
    setStatementRevisionConfirmed(false)
    setStatementRevisionRequired(false)
    setError(null)
  }, [])

  const previewStatementFees = useCallback(async () => {
    if (!statementFile) {
      setError('Choose an Etsy statement CSV file before previewing')
      return null
    }
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(statementMonth)) {
      setError('Choose a valid statement month')
      return null
    }

    setLoadingAction('statement-preview')
    setError(null)
    setStatementPreview(null)
    setStatementResult(null)
    try {
      const csv = await readFileText(statementFile)
      const result = await etsy.previewStatementFees({
        statementMonth,
        fileName: statementFile.name,
        csv,
        ...(statementRevisionConfirmed ? { allowStatementRevision: true } : {}),
      })
      setStatementPreview(result)
      const hasRevision = result.changes.some(
        (change) => change.oldStatus === 'STATEMENT_VERIFIED' && change.outcome !== 'unchanged',
      )
      setStatementRevisionRequired(hasRevision)
      return result
    } catch (previewError) {
      if (isConflict(previewError)) {
        setStatementRevisionRequired(true)
      }
      setError(errorMessage(previewError, 'Failed to preview Etsy statement fees'))
      return null
    } finally {
      setLoadingAction((current) => (current === 'statement-preview' ? null : current))
    }
  }, [statementFile, statementMonth, statementRevisionConfirmed])

  const applyStatementFees = useCallback(async () => {
    if (!statementPreview?.fingerprint || !statementFile || !statementMonth) return null
    if (statementRevisionRequired && !statementRevisionConfirmed) {
      setError('Confirm the statement revision before applying these changes')
      return null
    }

    setLoadingAction('statement-apply')
    setError(null)
    try {
      const csv = await readFileText(statementFile)
      const result = await etsy.applyStatementFees({
        statementMonth,
        fileName: statementFile.name,
        csv,
        fingerprint: statementPreview.fingerprint,
        ...(statementRevisionConfirmed ? { allowStatementRevision: true } : {}),
      })
      setStatementResult(result)
      setStatementPreview(null)
      await loadSummary()
      onImportComplete()
      return result
    } catch (applyError) {
      if (isConflict(applyError)) {
        setStatementPreview(null)
        setStatementResult(null)
      }
      setError(errorMessage(applyError, 'Failed to apply Etsy statement fees'))
      return null
    } finally {
      setLoadingAction((current) => (current === 'statement-apply' ? null : current))
    }
  }, [loadSummary, onImportComplete, statementFile, statementMonth, statementPreview, statementRevisionConfirmed, statementRevisionRequired])

  const statusCounts: EtsyFeeReconciliationStatusCounts | null = summary?.counts ?? null

  return {
    summary: statusCounts,
    paymentPreview,
    paymentResult,
    statementPreview,
    statementResult,
    statementFile,
    statementMonth,
    statementRevisionConfirmed,
    setStatementRevisionConfirmed,
    statementRevisionRequired,
    loadingAction,
    error,
    setError,
    loadSummary,
    previewPaymentFees,
    applyPaymentFees,
    setStatementFile: setSelectedStatementFile,
    setStatementMonth: setSelectedStatementMonth,
    previewStatementFees,
    applyStatementFees,
  }
}
