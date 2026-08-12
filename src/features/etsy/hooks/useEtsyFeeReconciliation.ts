import { useCallback, useEffect, useRef, useState } from 'react'
import {
  etsy,
  type EtsyFeeReconciliationPreview,
  type EtsyPaymentFeeApplyResult,
  type EtsyPaymentFeePreview,
  type EtsyFeeReconciliationApplyResult,
  type EtsyFeeReconciliationStatusCounts,
} from '../../../lib/api'
import { ApiError } from '../../../lib/api/request'

type Action = 'preview' | 'apply' | null

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
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [paymentPreview, setPaymentPreview] = useState<EtsyPaymentFeePreview | null>(null)
  const [paymentResult, setPaymentResult] = useState<EtsyPaymentFeeApplyResult | null>(null)
  const [paymentLoadingAction, setPaymentLoadingAction] = useState<Action>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const [statementPreview, setStatementPreview] = useState<EtsyFeeReconciliationPreview | null>(null)
  const [statementResult, setStatementResult] = useState<EtsyFeeReconciliationApplyResult | null>(null)
  const [statementFile, setStatementFile] = useState<File | null>(null)
  const [statementMonth, setStatementMonth] = useState('')
  const [statementRevisionConfirmed, setStatementRevisionConfirmed] = useState(false)
  const [statementRevisionRequired, setStatementRevisionRequired] = useState(false)
  const [statementLoadingAction, setStatementLoadingAction] = useState<Action>(null)
  const [statementError, setStatementError] = useState<string | null>(null)
  const statementSelectionVersion = useRef(0)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const result = await etsy.getFeeReconciliationSummary()
      setSummary(result)
      return result
    } catch (loadError) {
      setSummaryError(errorMessage(loadError, 'Failed to load fee reconciliation status'))
      return null
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const previewPaymentFees = useCallback(async () => {
    setPaymentLoadingAction('preview')
    setPaymentError(null)
    setPaymentPreview(null)
    setPaymentResult(null)
    try {
      const result = await etsy.previewPaymentFees({ limit: 25 })
      setPaymentPreview(result)
      return result
    } catch (previewError) {
      setPaymentError(errorMessage(previewError, 'Failed to preview Etsy Payment fees'))
      return null
    } finally {
      setPaymentLoadingAction((current) => (current === 'preview' ? null : current))
    }
  }, [])

  const applyPaymentFees = useCallback(async () => {
    if (!paymentPreview?.fingerprint) return null

    setPaymentLoadingAction('apply')
    setPaymentError(null)
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
      setPaymentError(errorMessage(applyError, 'Failed to apply Etsy Payment fees'))
      return null
    } finally {
      setPaymentLoadingAction((current) => (current === 'apply' ? null : current))
    }
  }, [loadSummary, onImportComplete, paymentPreview])

  const clearStatementPreview = useCallback((resetRevision = true) => {
    setStatementPreview(null)
    setStatementResult(null)
    if (resetRevision) {
      setStatementRevisionConfirmed(false)
      setStatementRevisionRequired(false)
    }
  }, [])

  const setSelectedStatementFile = useCallback((file: File | null) => {
    statementSelectionVersion.current += 1
    setStatementFile(file)
    clearStatementPreview()
    setStatementError(null)
  }, [clearStatementPreview])

  const setSelectedStatementMonth = useCallback((month: string) => {
    statementSelectionVersion.current += 1
    setStatementMonth(month)
    clearStatementPreview()
    setStatementError(null)
  }, [clearStatementPreview])

  const previewStatementFees = useCallback(async () => {
    if (!statementFile) {
      setStatementError('Choose an Etsy statement CSV file before previewing')
      return null
    }
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(statementMonth)) {
      setStatementError('Choose a valid statement month')
      return null
    }

    const requestVersion = ++statementSelectionVersion.current
    const requestedFile = statementFile
    const requestedMonth = statementMonth
    const requestedRevisionConfirmation = statementRevisionConfirmed
    setStatementLoadingAction('preview')
    setStatementError(null)
    clearStatementPreview(false)
    try {
      const csv = await readFileText(requestedFile)
      if (requestVersion !== statementSelectionVersion.current) return null
      const result = await etsy.previewStatementFees({
        statementMonth: requestedMonth,
        fileName: requestedFile.name,
        csv,
        ...(requestedRevisionConfirmation ? { allowStatementRevision: true } : {}),
      })
      if (requestVersion !== statementSelectionVersion.current) return null

      setStatementPreview(result)
      const hasRevision = result.changes.some(
        (change) => change.oldStatus === 'STATEMENT_VERIFIED' && change.outcome !== 'unchanged',
      )
      setStatementRevisionRequired(hasRevision)
      return result
    } catch (previewError) {
      if (requestVersion !== statementSelectionVersion.current) return null
      if (isConflict(previewError)) {
        setStatementRevisionRequired(true)
      }
      setStatementError(errorMessage(previewError, 'Failed to preview Etsy statement fees'))
      return null
    } finally {
      setStatementLoadingAction((current) => (current === 'preview' ? null : current))
    }
  }, [clearStatementPreview, statementFile, statementMonth, statementRevisionConfirmed])

  const applyStatementFees = useCallback(async () => {
    if (!statementPreview?.fingerprint || !statementFile || !statementMonth) return null
    if (statementRevisionRequired && !statementRevisionConfirmed) {
      setStatementError('Confirm the statement revision before applying these changes')
      return null
    }

    const requestVersion = ++statementSelectionVersion.current
    const requestedFile = statementFile
    const requestedMonth = statementMonth
    const requestedRevisionConfirmation = statementRevisionConfirmed
    setStatementLoadingAction('apply')
    setStatementError(null)
    try {
      const csv = await readFileText(requestedFile)
      if (requestVersion !== statementSelectionVersion.current) return null
      const result = await etsy.applyStatementFees({
        statementMonth: requestedMonth,
        fileName: requestedFile.name,
        csv,
        fingerprint: statementPreview.fingerprint,
        ...(requestedRevisionConfirmation ? { allowStatementRevision: true } : {}),
      })
      if (requestVersion !== statementSelectionVersion.current) {
        onImportComplete()
        return result
      }

      setStatementResult(result)
      setStatementPreview(null)
      setStatementRevisionConfirmed(false)
      setStatementRevisionRequired(false)
      await loadSummary()
      onImportComplete()
      return result
    } catch (applyError) {
      if (requestVersion !== statementSelectionVersion.current) return null
      if (isConflict(applyError)) {
        clearStatementPreview()
      }
      setStatementError(errorMessage(applyError, 'Failed to apply Etsy statement fees'))
      return null
    } finally {
      setStatementLoadingAction((current) => (current === 'apply' ? null : current))
    }
  }, [clearStatementPreview, loadSummary, onImportComplete, statementFile, statementMonth, statementPreview, statementRevisionConfirmed, statementRevisionRequired])

  const statusCounts: EtsyFeeReconciliationStatusCounts | null = summary?.counts ?? null

  return {
    summary: statusCounts,
    summaryLoading,
    summaryError,
    paymentPreview,
    paymentResult,
    paymentLoadingAction,
    paymentError,
    statementPreview,
    statementResult,
    statementFile,
    statementMonth,
    statementRevisionConfirmed,
    setStatementRevisionConfirmed,
    statementRevisionRequired,
    statementLoadingAction,
    statementError,
    loadSummary,
    previewPaymentFees,
    applyPaymentFees,
    setStatementFile: setSelectedStatementFile,
    setStatementMonth: setSelectedStatementMonth,
    previewStatementFees,
    applyStatementFees,
  }
}
