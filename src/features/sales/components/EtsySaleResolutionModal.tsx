import { useEffect, useRef, useState } from 'react'
import type { EtsySaleResolutionPreview, EtsySaleResolutionPreviewBody, Sale } from '../../../lib/api'
import { sales } from '../../../lib/api'
import { ApiError } from '../../../lib/api/request'
import { formatCurrency } from '../../../lib/formatting'

export interface EtsySaleResolutionModalProps {
  sale: Sale
  onClose(): void
  onResolved(): Promise<void> | void
}

type ResolutionType = 'reclassify' | 'correct_receipt_id' | 'manual_verify'
type Resolution = EtsySaleResolutionPreviewBody['resolution']

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Convert an exact pounds-and-pence input to safe integer pence. */
function poundsInputToPence(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const pence = BigInt(whole ?? '0') * 100n + BigInt(fraction.padEnd(2, '0'))
  return pence <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(pence) : null
}

function isPlausibleReceiptId(value: string): boolean {
  return /^\d{6,}$/.test(value) && Number.isSafeInteger(Number(value))
}

function formatPence(value: number): string {
  const amount = formatCurrency(Math.abs(value) / 100)
  return value < 0 ? `-${amount}` : amount
}

function formatDeltaPence(value: number): string {
  return value > 0 ? `+${formatPence(value)}` : formatPence(value)
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    return error.status
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The resolution request failed'
}

function addOptionalNote(note: string): string | undefined {
  const trimmed = note.trim()
  return trimmed ? trimmed : undefined
}

function statusLabel(status: EtsySaleResolutionPreview['rows'][number]['before']['status']): string {
  return status.replace(/_/g, ' ')
}

function ResolutionPreview({ preview }: { preview: EtsySaleResolutionPreview }) {
  return (
    <section className="card space-y-3 border-blue-200 bg-blue-50" aria-label="Resolution preview">
      <div className="font-medium text-blue-900">Preview ready</div>
      <div className="text-sm text-blue-900">{preview.saleIds.length} affected local Sales</div>

      {preview.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">Warnings</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-1 text-sm text-gray-700 sm:grid-cols-3">
        <div>Fee delta: {formatDeltaPence(preview.summary.feeDeltaPence)}</div>
        <div>Net revenue delta: {formatDeltaPence(preview.summary.netRevenueDeltaPence)}</div>
        <div>Margin delta: {formatDeltaPence(preview.summary.marginDeltaPence)}</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white">
        <table className="min-w-full text-left text-xs text-gray-700">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-2 py-2 font-medium">Sale</th>
              <th className="px-2 py-2 font-medium">Receipt</th>
              <th className="px-2 py-2 font-medium">Fees</th>
              <th className="px-2 py-2 font-medium">Net revenue</th>
              <th className="px-2 py-2 font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.saleId} className="border-b border-gray-100 last:border-b-0">
                <td className="px-2 py-2">{row.saleId}</td>
                <td className="px-2 py-2">
                  <div>{row.before.etsyOrderId || '(none)'} → {row.after.etsyOrderId || '(none)'}</div>
                  <div className="text-gray-500">{statusLabel(row.before.status)} → {statusLabel(row.after.status)}</div>
                </td>
                <td className="px-2 py-2">{formatPence(row.before.etsyFeesPence)} → {formatPence(row.after.etsyFeesPence)}</td>
                <td className="px-2 py-2">{formatPence(row.before.netRevenuePence)} → {formatPence(row.after.netRevenuePence)}</td>
                <td className="px-2 py-2">{formatPence(row.before.marginPence)} → {formatPence(row.after.marginPence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function EtsySaleResolutionModal({ sale, onClose, onResolved }: EtsySaleResolutionModalProps) {
  const [resolutionType, setResolutionType] = useState<ResolutionType>('manual_verify')
  const [reclassifyChannel, setReclassifyChannel] = useState<'direct' | 'fair'>('direct')
  const [etsyOrderId, setEtsyOrderId] = useState(sale.etsyOrderId ?? '')
  const [attributed, setAttributed] = useState(false)
  const [offsiteAdsFee, setOffsiteAdsFee] = useState('0.00')
  const [vatOnOffsiteAdsFee, setVatOnOffsiteAdsFee] = useState('0.00')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<EtsySaleResolutionPreview | null>(null)
  const [previewResolution, setPreviewResolution] = useState<Resolution | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [applyLoading, setApplyLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formGeneration = useRef(0)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const modal = modalRef.current
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    modal?.querySelector<HTMLElement>('[data-modal-initial-focus]')?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modal) return

      const focusableElements = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusableElements.length === 0) {
        event.preventDefault()
        modal.focus()
        return
      }

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      if (!first || !last) return

      if (!modal.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousActiveElement?.isConnected) previousActiveElement.focus()
    }
  }, [])

  const invalidatePreview = () => {
    formGeneration.current += 1
    setPreview(null)
    setPreviewResolution(null)
    setError(null)
  }

  const updateResolutionType = (value: ResolutionType) => {
    invalidatePreview()
    setResolutionType(value)
    if (value === 'reclassify') setEtsyOrderId('')
  }

  const updateAttributed = (value: boolean) => {
    invalidatePreview()
    setAttributed(value)
    if (!value) {
      setOffsiteAdsFee('0.00')
      setVatOnOffsiteAdsFee('0.00')
    }
  }

  const buildResolution = (): Resolution | null => {
    const optionalNote = addOptionalNote(note)
    if (note.length > 500) {
      setError('Manual note must be 500 characters or fewer')
      return null
    }

    if (resolutionType === 'reclassify') {
      return {
        type: 'reclassify',
        channel: reclassifyChannel,
        ...(optionalNote ? { note: optionalNote } : {}),
      }
    }

    if (resolutionType === 'correct_receipt_id') {
      if (!isPlausibleReceiptId(etsyOrderId)) {
        setError('Enter a valid Etsy receipt ID (at least 6 digits)')
        return null
      }
      return {
        type: 'correct_receipt_id',
        etsyOrderId,
        ...(optionalNote ? { note: optionalNote } : {}),
      }
    }

    const correctedReceiptId = etsyOrderId.trim()
    if (correctedReceiptId && !isPlausibleReceiptId(correctedReceiptId)) {
      setError('Enter a valid Etsy receipt ID (at least 6 digits) or leave it blank')
      return null
    }
    const feePence = attributed ? poundsInputToPence(offsiteAdsFee) : 0
    const vatPence = attributed ? poundsInputToPence(vatOnOffsiteAdsFee) : 0
    if (feePence === null || vatPence === null) {
      setError('Enter whole pennies using pounds and pence (for example, 4.80)')
      return null
    }
    return {
      type: 'manual_verify',
      ...(correctedReceiptId ? { etsyOrderId: correctedReceiptId } : {}),
      attributed,
      offsiteAdsFeePence: feePence,
      vatOnOffsiteAdsFeePence: vatPence,
      ...(optionalNote ? { note: optionalNote } : {}),
    }
  }

  const handlePreview = async () => {
    if (previewLoading || applyLoading) return
    const resolution = buildResolution()
    if (!resolution) return
    const generation = formGeneration.current
    setPreviewLoading(true)
    setError(null)
    try {
      const result = await sales.previewEtsyResolution(sale.id, { resolution })
      if (generation !== formGeneration.current) return
      setPreview(result)
      setPreviewResolution(resolution)
    } catch (requestError) {
      if (generation === formGeneration.current) {
        setError(errorMessage(requestError))
        setPreview(null)
        setPreviewResolution(null)
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleApply = async () => {
    if (!preview || !previewResolution || previewLoading || applyLoading) return
    setApplyLoading(true)
    setError(null)
    try {
      await sales.applyEtsyResolution(sale.id, {
        resolution: previewResolution,
        fingerprint: preview.fingerprint,
      })
      await onResolved()
      onClose()
    } catch (requestError) {
      if (errorStatus(requestError) === 409) {
        setPreview(null)
        setPreviewResolution(null)
      }
      setError(errorMessage(requestError))
    } finally {
      setApplyLoading(false)
    }
  }

  return (
    <div ref={modalRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="etsy-sale-resolution-title" tabIndex={-1}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="etsy-sale-resolution-title" className="text-lg font-semibold text-gray-900">Resolve Etsy sale</h2>
            <p className="mt-1 text-sm text-gray-600">Preview the complete receipt group before saving any changes.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={previewLoading || applyLoading} data-modal-initial-focus>Close</button>
        </div>

        {error && <div role="alert" className="alert-danger mt-4">{error}</div>}

        <div className="mt-4 space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-800">Resolution</legend>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="etsy-resolution-type"
                checked={resolutionType === 'reclassify'}
                onChange={() => updateResolutionType('reclassify')}
              />
              <span>This was not an Etsy sale</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="etsy-resolution-type"
                checked={resolutionType === 'correct_receipt_id'}
                onChange={() => updateResolutionType('correct_receipt_id')}
              />
              <span>Correct the Etsy receipt ID</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="etsy-resolution-type"
                checked={resolutionType === 'manual_verify'}
                onChange={() => updateResolutionType('manual_verify')}
              />
              <span>Manually verify this Etsy sale</span>
            </label>
          </fieldset>

          {resolutionType === 'reclassify' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div>Etsy fees will be removed on save and the Sale will be reclassified.</div>
              <fieldset className="mt-2 flex gap-4">
                <legend className="sr-only">New sale channel</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="reclassify-channel" checked={reclassifyChannel === 'direct'} onChange={() => { invalidatePreview(); setReclassifyChannel('direct') }} />
                  Direct
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="reclassify-channel" checked={reclassifyChannel === 'fair'} onChange={() => { invalidatePreview(); setReclassifyChannel('fair') }} />
                  Fair/Market
                </label>
              </fieldset>
            </div>
          )}

          {resolutionType !== 'reclassify' && (
            <label className="block text-sm text-gray-700">
              Etsy receipt ID
              <input
                className="input mt-1"
                id="etsy-receipt-id"
                aria-label="Etsy receipt ID"
                value={etsyOrderId}
                onChange={(event) => { invalidatePreview(); setEtsyOrderId(event.target.value) }}
                inputMode="numeric"
                aria-describedby="etsy-receipt-id-help"
              />
              <span id="etsy-receipt-id-help" className="mt-1 block text-xs text-gray-500">
                {resolutionType === 'manual_verify' ? 'Optional corrected ID; leave blank to keep the current receipt group.' : 'Use the numeric Etsy receipt ID from the order.'}
              </span>
            </label>
          )}

          {resolutionType === 'manual_verify' && (
            <div className="space-y-3 rounded-lg border border-gray-200 p-3">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-800">Offsite Ads attribution</legend>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="offsite-attribution" checked={attributed} onChange={() => updateAttributed(true)} />
                  Attributed to Offsite Ads
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="offsite-attribution" checked={!attributed} onChange={() => updateAttributed(false)} />
                  Not attributed to Offsite Ads
                </label>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-gray-700">
                  Offsite Ads fee
                  <input
                    className="input mt-1"
                    id="offsite-ads-fee"
                    aria-label="Offsite Ads fee"
                    value={offsiteAdsFee}
                    onChange={(event) => { invalidatePreview(); setOffsiteAdsFee(event.target.value) }}
                    disabled={!attributed}
                    inputMode="decimal"
                  />
                </label>
                <label className="block text-sm text-gray-700">
                  VAT on Offsite Ads fee
                  <input
                    className="input mt-1"
                    id="vat-on-offsite-ads-fee"
                    aria-label="VAT on Offsite Ads fee"
                    value={vatOnOffsiteAdsFee}
                    onChange={(event) => { invalidatePreview(); setVatOnOffsiteAdsFee(event.target.value) }}
                    disabled={!attributed}
                    inputMode="decimal"
                  />
                </label>
              </div>
            </div>
          )}

          <label className="block text-sm text-gray-700">
            Manual note (optional)
            <textarea
              className="input mt-1"
              aria-label="Manual note"
              value={note}
              maxLength={500}
              onChange={(event) => { invalidatePreview(); setNote(event.target.value) }}
              rows={2}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => void handlePreview()} disabled={previewLoading || applyLoading}>
            {previewLoading ? 'Previewing…' : 'Preview resolution'}
          </button>
          <button type="button" className="btn-primary" onClick={() => void handleApply()} disabled={!preview || !previewResolution || previewLoading || applyLoading}>
            {applyLoading ? 'Applying…' : 'Confirm resolution'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={previewLoading || applyLoading}>Cancel</button>
        </div>

        {preview && <div className="mt-4"><ResolutionPreview preview={preview} /></div>}
      </div>
    </div>
  )
}
