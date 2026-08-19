import { useState } from 'react'
import type { SettingsAuditEntry } from '../../../lib/api'

interface AuditHistorySectionProps {
  entries: SettingsAuditEntry[]
}

const settingTypeLabels: Record<SettingsAuditEntry['settingType'], string> = {
  POSTAGE_TIER: 'Postage tier',
  PACKAGING_OVERHEAD: 'Packaging overhead',
  SUPPLIER: 'Supplier',
  ETSY_FEE_CONFIG: 'Etsy fee configuration',
}

const actionLabels: Record<SettingsAuditEntry['action'], string> = {
  CREATE: 'created',
  UPDATE: 'updated',
  ARCHIVE: 'archived',
  RESTORE: 'restored',
}

const safeSnapshotKeys = new Set([
  'name',
  'label',
  'etsyCharge',
  'actualCost',
  'isActive',
  'costPerOrder',
  'effectiveFrom',
  'effectiveTo',
  'transactionFee',
  'regulatoryFee',
  'paymentFeePercent',
  'paymentFeeFixed',
  'vatRate',
  'listingFee',
])

function sanitizeSnapshot(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (value === null) return null

  const sanitizeValue = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(sanitizeValue)
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(
        Object.entries(candidate).filter(([key]) => safeSnapshotKeys.has(key)).map(([key, nested]) => [key, sanitizeValue(nested)]),
      )
    }
    return candidate
  }

  return sanitizeValue(value) as Record<string, unknown>
}

function displayLabel(entry: SettingsAuditEntry): string {
  for (const snapshot of [entry.after, entry.before]) {
    if (!snapshot) continue
    for (const key of ['name', 'label', 'etsyCharge'] as const) {
      const value = snapshot[key]
      if (typeof value === 'string' || typeof value === 'number') return String(value)
    }
  }
  return entry.settingId
}

function snapshotText(snapshot: Record<string, unknown> | null, emptyMessage: string): string {
  const sanitized = sanitizeSnapshot(snapshot)
  return sanitized === null ? emptyMessage : JSON.stringify(sanitized, null, 2)
}

export default function AuditHistorySection({ entries }: AuditHistorySectionProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Audit History</h3>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No setting changes recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const expanded = expandedIds.has(entry.id)
            const eventLabel = `${settingTypeLabels[entry.settingType]} ${actionLabels[entry.action]}`
            return (
              <article key={entry.id} data-testid="audit-entry" className="rounded border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-medium">{eventLabel}</p>
                    <p className="text-sm text-gray-600">{displayLabel(entry)}</p>
                    <time className="text-xs text-gray-500" dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-expanded={expanded}
                    onClick={() => toggleExpanded(entry.id)}
                  >
                    {expanded ? 'Hide change details' : 'Show change details'}
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <h4 className="text-sm font-medium">Before</h4>
                      <pre aria-label="Before snapshot" className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs">
                        {snapshotText(entry.before, 'No previous value recorded')}
                      </pre>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">After</h4>
                      <pre aria-label="After snapshot" className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs">
                        {snapshotText(entry.after, 'No resulting value recorded')}
                      </pre>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
