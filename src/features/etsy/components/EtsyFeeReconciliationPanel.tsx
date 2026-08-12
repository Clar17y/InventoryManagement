import { useMemo, useState } from 'react'
import { ClipboardDocumentIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import type { EtsyFeeReconciliationPreview, EtsyPaymentFeePreview } from '../../../lib/api'
import { useEtsyFeeReconciliation } from '../hooks/useEtsyFeeReconciliation'

interface EtsyFeeReconciliationPanelProps {
  onImportComplete: () => void
}

function formatMoney(value: number): string {
  const absolute = Math.abs(value).toFixed(2)
  return value < 0 ? `-£${absolute}` : `£${absolute}`
}

function formatDelta(value: number): string {
  return value > 0 ? `+${formatMoney(value)}` : formatMoney(value)
}

function summaryFeeDelta(preview: EtsyFeeReconciliationPreview | EtsyPaymentFeePreview): number {
  return preview.summary.newFees - preview.summary.oldFees
}

function ReportSummary({ preview }: { preview: EtsyFeeReconciliationPreview | EtsyPaymentFeePreview }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="text-gray-500">Matched {preview.summary.matched}</div>
        <div className="text-gray-500">Changed {preview.summary.changed}</div>
        <div className="text-gray-500">Unmatched {preview.summary.unmatched}</div>
        <div className="text-gray-500">Manual review {preview.summary.manualReview}</div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1 text-gray-700 sm:grid-cols-2">
        <div>Fee delta: {formatDelta(summaryFeeDelta(preview))}</div>
        <div>Margin delta: {formatDelta(preview.summary.marginDelta)}</div>
      </div>
    </div>
  )
}

function ReceiptReviewList({ preview }: { preview: EtsyFeeReconciliationPreview | EtsyPaymentFeePreview }) {
  const reviewChanges = useMemo(
    () => preview.changes.filter(
      (change) => change.outcome === 'unmatched' || change.outcome === 'manual_review',
    ),
    [preview.changes],
  )
  const receiptIds = useMemo(() => {
    const ids = new Set<string>()
    for (const change of reviewChanges) {
      ids.add(change.receiptId)
    }
    if ('failures' in preview) {
      for (const failure of preview.failures) ids.add(failure.receiptId)
    }
    return [...ids]
  }, [preview, reviewChanges])
  const [copied, setCopied] = useState(false)

  if (receiptIds.length === 0) return null

  const copyReceiptIds = async () => {
    if (navigator.clipboard) await navigator.clipboard.writeText(receiptIds.join('\n'))
    setCopied(true)
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="font-medium">Receipt IDs needing review</div>
      <div className="mt-1 break-words text-xs">{receiptIds.join(', ')}</div>
      {reviewChanges.length > 0 && (
        <div className="mt-2 space-y-1 text-xs">
          {reviewChanges.map((change) => (
            <div key={`${change.receiptId}-${change.outcome}`}>
              #{change.receiptId}: {change.message ?? change.outcome.replace('_', ' ')}
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn-secondary mt-2 inline-flex items-center gap-1 text-xs" onClick={() => void copyReceiptIds()}>
        <ClipboardDocumentIcon className="h-4 w-4" />
        {copied ? 'Copied' : 'Copy receipt IDs'}
      </button>
    </div>
  )
}

function PaymentReport({ preview }: { preview: EtsyPaymentFeePreview }) {
  return (
    <div className="mt-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <div className="font-medium">Aggregate Payment result (not itemized)</div>
        {preview.canApplyCanonicalFees ? (
          <div className="mt-1">Validated Payment totals are ready to apply to canonical fees.</div>
        ) : (
          <div className="mt-1">Observe-only: Payment totals were checked, but profit was not changed.</div>
        )}
      </div>
      <ReportSummary preview={preview} />
      {preview.failures.length > 0 && (
        <div className="mt-3 space-y-1 text-sm text-red-700">
          {preview.failures.map((failure) => (
            <div key={`${failure.receiptId}-${failure.status}`}>#{failure.receiptId}: {failure.message}</div>
          ))}
        </div>
      )}
      <ReceiptReviewList preview={preview} />
    </div>
  )
}

export default function EtsyFeeReconciliationPanel({ onImportComplete }: EtsyFeeReconciliationPanelProps) {
  const reconciliation = useEtsyFeeReconciliation({ onImportComplete })
  const paymentBusy = reconciliation.paymentLoadingAction !== null
  const statementBusy = reconciliation.statementLoadingAction !== null
  const pendingCount = reconciliation.summary
    ? reconciliation.summary.PENDING + reconciliation.summary.PAYMENT_SYNCED + reconciliation.summary.MANUAL_REVIEW
    : 0

  return (
    <section aria-labelledby="etsy-fee-reconciliation-title" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="etsy-fee-reconciliation-title" className="text-base font-semibold text-gray-900">Etsy fee reconciliation</h3>
          <p className="mt-1 text-sm text-gray-600">Review Etsy Payment aggregates and statements before changing sale fees.</p>
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={() => void reconciliation.loadSummary()} disabled={reconciliation.summaryLoading}>
          Refresh status
        </button>
      </div>

      {reconciliation.summaryError && (
        <div role="alert" className="alert-danger mt-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
          <span>{reconciliation.summaryError}</span>
        </div>
      )}

      {reconciliation.summary && (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            {pendingCount.toLocaleString()} Etsy sales need statement verification
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div className="rounded border border-gray-200 p-2"><div className="text-gray-500">Pending</div><div className="font-semibold">{reconciliation.summary.PENDING}</div></div>
            <div className="rounded border border-gray-200 p-2"><div className="text-gray-500">Payment synced</div><div className="font-semibold">{reconciliation.summary.PAYMENT_SYNCED}</div></div>
            <div className="rounded border border-gray-200 p-2"><div className="text-gray-500">Statement verified</div><div className="font-semibold">{reconciliation.summary.STATEMENT_VERIFIED}</div></div>
            <div className="rounded border border-gray-200 p-2"><div className="text-gray-500">Manual review</div><div className="font-semibold">{reconciliation.summary.MANUAL_REVIEW}</div></div>
            <div className="rounded border border-gray-200 p-2"><div className="text-gray-500">Not applicable</div><div className="font-semibold">{reconciliation.summary.NOT_APPLICABLE}</div></div>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-gray-200 pt-4">
        <h4 className="font-medium text-gray-900">Payment fee check</h4>
        <p className="mt-1 text-xs text-gray-500">Checks up to 25 pending receipts. Payment data is aggregate and not itemized.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => void reconciliation.previewPaymentFees()} disabled={paymentBusy}>
            {reconciliation.paymentLoadingAction === 'preview' ? 'Checking…' : 'Check payment fees'}
          </button>
          <button type="button" className="btn-primary text-sm" onClick={() => void reconciliation.applyPaymentFees()} disabled={!reconciliation.paymentPreview?.fingerprint || paymentBusy}>
            {reconciliation.paymentLoadingAction === 'apply' ? 'Applying…' : 'Apply payment fee changes'}
          </button>
        </div>
        {reconciliation.paymentError && (
          <div role="alert" className="alert-danger mt-3 flex items-start gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
            <span>{reconciliation.paymentError}</span>
          </div>
        )}
        {reconciliation.paymentPreview && <PaymentReport preview={reconciliation.paymentPreview} />}
        {reconciliation.paymentResult && (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {reconciliation.paymentResult.duplicate
              ? 'This Payment result was already applied; no writes were made.'
              : reconciliation.paymentResult.applied
                ? 'Payment fee changes applied.'
                : 'Payment result recorded as observe-only; profit was not changed.'}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-gray-200 pt-4">
        <h4 className="font-medium text-gray-900">Monthly statement</h4>
        <p className="mt-1 text-xs text-gray-500">Upload a sanitized Etsy CSV. Raw CSV contents are only sent for the requested preview/apply and are never displayed.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-gray-700">
            Statement month
            <input
              type="month"
              aria-label="Statement month"
              className="input mt-1"
              value={reconciliation.statementMonth}
              onChange={(event) => reconciliation.setStatementMonth(event.target.value)}
            />
          </label>
          <label className="text-sm text-gray-700">
            Statement CSV file
            <input
              type="file"
              aria-label="Statement CSV file"
              accept=".csv,text/csv"
              className="mt-1 block w-full text-sm"
              onChange={(event) => reconciliation.setStatementFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {reconciliation.statementRevisionRequired && (
          <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input
              type="checkbox"
              aria-label="Confirm statement revision"
              className="mt-0.5 h-4 w-4"
              checked={reconciliation.statementRevisionConfirmed}
              onChange={(event) => reconciliation.setStatementRevisionConfirmed(event.target.checked)}
            />
            <span>I understand this statement revises already verified evidence.</span>
          </label>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => void reconciliation.previewStatementFees()} disabled={!reconciliation.statementFile || !reconciliation.statementMonth || statementBusy}>
            {reconciliation.statementLoadingAction === 'preview' ? 'Previewing…' : 'Preview statement'}
          </button>
          <button type="button" className="btn-primary text-sm" onClick={() => void reconciliation.applyStatementFees()} disabled={!reconciliation.statementPreview?.fingerprint || statementBusy || (reconciliation.statementRevisionRequired && !reconciliation.statementRevisionConfirmed)}>
            {reconciliation.statementLoadingAction === 'apply' ? 'Applying…' : 'Apply statement changes'}
          </button>
        </div>
        {reconciliation.statementError && (
          <div role="alert" className="alert-danger mt-3 flex items-start gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
            <span>{reconciliation.statementError}</span>
          </div>
        )}
        {reconciliation.statementPreview && <ReportSummary preview={reconciliation.statementPreview} />}
        {reconciliation.statementResult && (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {reconciliation.statementResult.duplicate ? 'This statement was already applied; no writes were made.' : 'Statement fee changes applied.'}
          </div>
        )}
        {reconciliation.statementPreview && <ReceiptReviewList preview={reconciliation.statementPreview} />}
      </div>
    </section>
  )
}
