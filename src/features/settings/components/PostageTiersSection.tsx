import { useState } from 'react'
import type { PostageTier } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
import type {
  PostageTierCreateBody,
  PostageTierMutationResponse,
  PostageTierUpdateBody,
} from '#contracts/routes/settings'

interface PostageTiersSectionProps {
  tiers: PostageTier[]
  onCreate: (data: PostageTierCreateBody) => Promise<PostageTierMutationResponse>
  onUpdate: (id: string, data: PostageTierUpdateBody) => Promise<PostageTier>
  onArchive: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<PostageTier>
}

type Draft = {
  etsyCharge: string
  actualCost: string
  label: string
}

type FieldName = keyof Draft
type FieldErrors = Partial<Record<FieldName, string>>

function numberError(label: string): string {
  return `${label} must be a finite, non-negative number`
}

function parseNonNegative(value: string, label: string): { value?: number; error?: string } {
  const parsed = Number(value)
  if (!value.trim() || !Number.isFinite(parsed) || parsed < 0) {
    return { error: numberError(label) }
  }
  return { value: parsed }
}

function getErrorDetails(error: unknown): { message: string; field?: FieldName } {
  const candidate = error as { message?: unknown; body?: unknown } | null
  const body = candidate && typeof candidate.body === 'object' && candidate.body !== null
    ? candidate.body as { error?: unknown; field?: unknown }
    : null
  const message = typeof body?.error === 'string'
    ? body.error
    : typeof candidate?.message === 'string'
      ? candidate.message
      : 'Request failed'
  const field = body?.field === 'etsyCharge' || body?.field === 'actualCost' || body?.field === 'label'
    ? body.field
    : undefined
  return { message, field }
}

function draftForTier(tier: PostageTier): Draft {
  return {
    etsyCharge: String(tier.etsyCharge),
    actualCost: String(tier.actualCost),
    label: tier.label ?? '',
  }
}

function tierName(tier: PostageTier): string {
  return `${formatCurrency(Number(tier.etsyCharge))} tier`
}

export default function PostageTiersSection({
  tiers,
  onCreate,
  onUpdate,
  onArchive,
  onRestore,
}: PostageTiersSectionProps) {
  const [newEtsyCharge, setNewEtsyCharge] = useState('')
  const [newActualCost, setNewActualCost] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newFieldErrors, setNewFieldErrors] = useState<FieldErrors>({})
  const [newError, setNewError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<FieldErrors>({})
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const activeTiers = tiers.filter((tier) => tier.isActive)
  const archivedTiers = tiers.filter((tier) => !tier.isActive)

  const startEdit = (tier: PostageTier) => {
    setEditingId(tier.id)
    setDraft(draftForTier(tier))
    setRowError(null)
    setFieldError({})
    setConfirmation(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
    setRowError(null)
    setFieldError({})
  }

  const validateDraft = (value: Draft): { errors: FieldErrors; etsyCharge?: number; actualCost?: number } => {
    const charge = parseNonNegative(value.etsyCharge, 'Etsy charge')
    const actualCost = parseNonNegative(value.actualCost, 'Actual cost')
    const errors: FieldErrors = {}
    if (charge.error) errors.etsyCharge = charge.error
    if (actualCost.error) errors.actualCost = actualCost.error
    return { errors, etsyCharge: charge.value, actualCost: actualCost.value }
  }

  const handleSave = async (tier: PostageTier) => {
    if (!draft) return
    const validation = validateDraft(draft)
    if (Object.keys(validation.errors).length > 0 || validation.etsyCharge === undefined || validation.actualCost === undefined) {
      setFieldError(validation.errors)
      return
    }

    setPendingId(tier.id)
    setRowError(null)
    setFieldError({})
    setConfirmation(null)
    try {
      await onUpdate(tier.id, {
        etsyCharge: validation.etsyCharge,
        actualCost: validation.actualCost,
        label: draft.label.trim() || null,
      })
      setEditingId(null)
      setDraft(null)
      setConfirmation('Postage tier updated.')
    } catch (error) {
      const details = getErrorDetails(error)
      if (details.field) {
        setFieldError({ [details.field]: details.message })
      } else {
        setRowError(details.message)
      }
    } finally {
      setPendingId(null)
    }
  }

  const handleAdd = async () => {
    const validation = validateDraft({
      etsyCharge: newEtsyCharge,
      actualCost: newActualCost,
      label: newLabel,
    })
    if (Object.keys(validation.errors).length > 0 || validation.etsyCharge === undefined || validation.actualCost === undefined) {
      setNewFieldErrors(validation.errors)
      return
    }

    setPendingId('new')
    setNewError(null)
    setNewFieldErrors({})
    setConfirmation(null)
    try {
      const result = await onCreate({
        etsyCharge: validation.etsyCharge,
        actualCost: validation.actualCost,
        label: newLabel.trim() || undefined,
      })
      setNewEtsyCharge('')
      setNewActualCost('')
      setNewLabel('')
      setConfirmation(`Postage tier ${result.outcome}.`)
    } catch (error) {
      setNewError(getErrorDetails(error).message)
    } finally {
      setPendingId(null)
    }
  }

  const handleArchive = async (tier: PostageTier) => {
    if (!confirm('Archive this postage tier?')) return
    setPendingId(tier.id)
    setRowError(null)
    setConfirmation(null)
    try {
      await onArchive(tier.id)
      setConfirmation('Postage tier archived.')
    } catch (error) {
      setRowError(getErrorDetails(error).message)
    } finally {
      setPendingId(null)
    }
  }

  const handleRestore = async (tier: PostageTier) => {
    setPendingId(tier.id)
    setRowError(null)
    setConfirmation(null)
    try {
      await onRestore(tier.id)
      setConfirmation('Postage tier restored.')
    } catch (error) {
      setRowError(getErrorDetails(error).message)
    } finally {
      setPendingId(null)
    }
  }

  const updateDraft = (field: FieldName, value: string) => {
    setDraft((current) => current ? { ...current, [field]: value } : current)
    setFieldError((current) => ({ ...current, [field]: undefined }))
    setRowError(null)
  }

  const renderTier = (tier: PostageTier, archived: boolean) => {
    const isEditing = editingId === tier.id && !archived
    const isPending = pendingId === tier.id
    const name = tierName(tier)

    if (isEditing && draft) {
      return (
        <div key={tier.id} className="space-y-3 rounded-lg bg-gray-50 p-3" aria-busy={isPending}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`postage-charge-${tier.id}`} className="block text-sm font-medium text-gray-700">Etsy charge</label>
              <input
                id={`postage-charge-${tier.id}`}
                aria-label="Etsy charge"
                type="number"
                step="0.01"
                value={draft.etsyCharge}
                onChange={(event) => updateDraft('etsyCharge', event.target.value)}
                disabled={isPending}
                aria-invalid={Boolean(fieldError.etsyCharge)}
                className="input mt-1 w-full"
              />
              {fieldError.etsyCharge && <p className="text-xs text-red-600">{fieldError.etsyCharge}</p>}
            </div>
            <div>
              <label htmlFor={`postage-cost-${tier.id}`} className="block text-sm font-medium text-gray-700">Actual cost</label>
              <input
                id={`postage-cost-${tier.id}`}
                aria-label="Actual cost"
                type="number"
                step="0.01"
                value={draft.actualCost}
                onChange={(event) => updateDraft('actualCost', event.target.value)}
                disabled={isPending}
                aria-invalid={Boolean(fieldError.actualCost)}
                className="input mt-1 w-full"
              />
              {fieldError.actualCost && <p className="text-xs text-red-600">{fieldError.actualCost}</p>}
            </div>
            <div>
              <label htmlFor={`postage-label-${tier.id}`} className="block text-sm font-medium text-gray-700">Label</label>
              <input
                id={`postage-label-${tier.id}`}
                aria-label="Label"
                type="text"
                value={draft.label}
                onChange={(event) => updateDraft('label', event.target.value)}
                disabled={isPending}
                aria-invalid={Boolean(fieldError.label)}
                className="input mt-1 w-full"
              />
              {fieldError.label && <p className="text-xs text-red-600">{fieldError.label}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave(tier)}
              disabled={isPending}
              aria-label={`Save ${name}`}
              className="btn-primary"
            >
              {isPending ? 'Saving...' : `Save ${name}`}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isPending}
              className="btn-secondary"
            >
              Cancel {name}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div key={tier.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-2" aria-busy={isPending}>
        <span>
          Etsy charges {formatCurrency(Number(tier.etsyCharge))} &rarr; Actual cost {formatCurrency(Number(tier.actualCost))}
          {tier.label && <span className="ml-2 text-gray-500">({tier.label})</span>}
        </span>
        <div className="flex items-center gap-2">
          {!archived && (
            <>
              <button
                type="button"
                onClick={() => startEdit(tier)}
                disabled={isPending}
                aria-label={`Edit ${name}`}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void handleArchive(tier)}
                disabled={isPending}
                aria-label={`Archive ${name}`}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Archive
              </button>
            </>
          )}
          {archived && (
            <button
              type="button"
              onClick={() => void handleRestore(tier)}
              disabled={isPending}
              aria-label={`Restore ${name}`}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              Restore
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Postage Tiers</h3>
      <p className="text-sm text-gray-500">
        Map Etsy shipping charges to actual postage costs for margin calculations
      </p>

      {activeTiers.length > 0 && <div className="space-y-2">{activeTiers.map((tier) => renderTier(tier, false))}</div>}

      {archivedTiers.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            aria-expanded={showArchived}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Archived ({archivedTiers.length})
          </button>
          {showArchived && <div className="space-y-2">{archivedTiers.map((tier) => renderTier(tier, true))}</div>}
        </div>
      )}

      {confirmation && <p role="status" className="text-sm text-green-700">{confirmation}</p>}
      {rowError && <p role="alert" className="text-sm text-red-600">{rowError}</p>}
      {newError && <p role="alert" className="text-sm text-red-600">{newError}</p>}

      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            type="number"
            step="0.01"
            value={newEtsyCharge}
            aria-label="New Etsy charge"
            disabled={pendingId === 'new'}
            onChange={(event) => {
              setNewEtsyCharge(event.target.value)
              setNewFieldErrors((current) => ({ ...current, etsyCharge: undefined }))
              setNewError(null)
            }}
            className="input"
            placeholder="Etsy charge"
            aria-invalid={Boolean(newFieldErrors.etsyCharge)}
          />
          <input
            type="number"
            step="0.01"
            value={newActualCost}
            aria-label="New actual cost"
            disabled={pendingId === 'new'}
            onChange={(event) => {
              setNewActualCost(event.target.value)
              setNewFieldErrors((current) => ({ ...current, actualCost: undefined }))
              setNewError(null)
            }}
            className="input"
            placeholder="Actual cost"
            aria-invalid={Boolean(newFieldErrors.actualCost)}
          />
          <input
            type="text"
            value={newLabel}
            aria-label="New label"
            disabled={pendingId === 'new'}
            onChange={(event) => {
              setNewLabel(event.target.value)
              setNewFieldErrors((current) => ({ ...current, label: undefined }))
              setNewError(null)
            }}
            className="input"
            placeholder="Label (optional)"
            aria-invalid={Boolean(newFieldErrors.label)}
          />
        </div>
        {(newFieldErrors.etsyCharge || newFieldErrors.actualCost || newFieldErrors.label) && (
          <div className="space-y-1 text-xs text-red-600">
            {newFieldErrors.etsyCharge && <p>{newFieldErrors.etsyCharge}</p>}
            {newFieldErrors.actualCost && <p>{newFieldErrors.actualCost}</p>}
            {newFieldErrors.label && <p>{newFieldErrors.label}</p>}
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={pendingId === 'new' || !newEtsyCharge.trim() || !newActualCost.trim()}
          className="btn-primary"
        >
          {pendingId === 'new' ? 'Adding...' : 'Add'}
        </button>
      </div>
    </section>
  )
}
