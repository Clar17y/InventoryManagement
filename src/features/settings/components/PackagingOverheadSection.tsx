import { useState } from 'react'
import type { PackagingOverhead } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
import { getApiErrorDetails } from '../../../lib/apiError'
import type { PackagingOverheadCreateBody, PackagingOverheadUpdateBody } from '#contracts/routes/settings'

interface Props {
  packagingOverheads: PackagingOverhead[]
  packagingTotal: number
  onCreate: (data: PackagingOverheadCreateBody) => Promise<PackagingOverhead>
  onUpdate: (id: string, data: PackagingOverheadUpdateBody) => Promise<PackagingOverhead>
  onArchive: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<PackagingOverhead>
}

type Draft = { name: string; costPerOrder: string }
type FieldName = keyof Draft
type FieldErrors = Partial<Record<FieldName, string>>

const errorFields: readonly FieldName[] = ['name', 'costPerOrder']

function getErrorDetails(error: unknown) {
  return getApiErrorDetails(error, errorFields)
}

function parseCost(value: string): { value?: number; error?: string } {
  const parsed = Number(value)
  if (!value.trim() || !Number.isFinite(parsed) || parsed < 0) {
    return { error: 'Cost must be a finite, non-negative number' }
  }
  return { value: parsed }
}

function fieldErrorId(field: FieldName, id?: string): string {
  const label = field === 'costPerOrder' ? 'cost' : field
  return id ? `packaging-${label}-error-${id}` : `packaging-new-${label}-error`
}

export default function PackagingOverheadSection({
  packagingOverheads,
  packagingTotal,
  onCreate,
  onUpdate,
  onArchive,
  onRestore,
}: Props) {
  const [newName, setNewName] = useState('')
  const [newCost, setNewCost] = useState('')
  const [newFieldErrors, setNewFieldErrors] = useState<FieldErrors>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const active = packagingOverheads.filter((item) => item.isActive)
  const archived = packagingOverheads.filter((item) => !item.isActive)

  const save = async (item: PackagingOverhead) => {
    if (!draft) return
    const cost = parseCost(draft.costPerOrder)
    const errors: FieldErrors = {}
    if (!draft.name.trim()) errors.name = 'Name is required'
    if (cost.error) errors.costPerOrder = cost.error
    if (Object.keys(errors).length > 0 || cost.value === undefined) {
      setFieldErrors(errors)
      setError(null)
      return
    }

    setPendingId(item.id)
    setError(null)
    setFieldErrors({})
    try {
      await onUpdate(item.id, { name: draft.name.trim(), costPerOrder: cost.value })
      setEditingId(null)
      setDraft(null)
    } catch (err) {
      const details = getErrorDetails(err)
      if (details.field) setFieldErrors({ [details.field]: details.message })
      else setError(details.message)
    } finally {
      setPendingId(null)
    }
  }

  const add = async () => {
    const cost = parseCost(newCost)
    const errors: FieldErrors = {}
    if (!newName.trim()) errors.name = 'Name is required'
    if (cost.error) errors.costPerOrder = cost.error
    if (Object.keys(errors).length > 0 || cost.value === undefined) {
      setNewFieldErrors(errors)
      setError(null)
      return
    }

    setPendingId('new')
    setError(null)
    setNewFieldErrors({})
    try {
      await onCreate({ name: newName.trim(), costPerOrder: cost.value })
      setNewName('')
      setNewCost('')
    } catch (err) {
      const details = getErrorDetails(err)
      if (details.field) setNewFieldErrors({ [details.field]: details.message })
      else setError(details.message)
    } finally {
      setPendingId(null)
    }
  }

  const archive = async (item: PackagingOverhead) => {
    if (!confirm('Archive this packaging overhead?')) return
    setPendingId(item.id)
    setError(null)
    try {
      await onArchive(item.id)
    } catch (err) {
      setError(getErrorDetails(err).message)
    } finally {
      setPendingId(null)
    }
  }

  const restore = async (item: PackagingOverhead) => {
    setPendingId(item.id)
    setError(null)
    try {
      await onRestore(item.id)
    } catch (err) {
      setError(getErrorDetails(err).message)
    } finally {
      setPendingId(null)
    }
  }

  const updateEditField = (field: FieldName, value: string) => {
    setDraft((current) => current ? { ...current, [field]: value } : current)
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setError(null)
  }

  const updateNewField = (field: FieldName, value: string) => {
    if (field === 'name') setNewName(value)
    else setNewCost(value)
    setNewFieldErrors((current) => ({ ...current, [field]: undefined }))
    setError(null)
  }

  const row = (item: PackagingOverhead, isArchived: boolean) => {
    const name = `${item.name} overhead`
    const pending = pendingId === item.id
    if (editingId === item.id && draft) {
      const nameErrorId = fieldErrorId('name', item.id)
      const costErrorId = fieldErrorId('costPerOrder', item.id)
      return (
        <div key={item.id} className="space-y-2 rounded-lg bg-gray-50 p-3" aria-busy={pending}>
          <label className="block text-sm" htmlFor={`packaging-name-${item.id}`}>
            Name
            <input
              id={`packaging-name-${item.id}`}
              aria-label="Name"
              aria-describedby={fieldErrors.name ? nameErrorId : undefined}
              aria-invalid={Boolean(fieldErrors.name)}
              className="input mt-1 w-full"
              value={draft.name}
              disabled={pending}
              onChange={(event) => updateEditField('name', event.target.value)}
            />
            {fieldErrors.name && <p id={nameErrorId} role="alert" className="text-xs text-red-600">{fieldErrors.name}</p>}
          </label>
          <label className="block text-sm" htmlFor={`packaging-cost-${item.id}`}>
            Cost per order
            <input
              id={`packaging-cost-${item.id}`}
              aria-label="Cost per order"
              aria-describedby={fieldErrors.costPerOrder ? costErrorId : undefined}
              aria-invalid={Boolean(fieldErrors.costPerOrder)}
              type="number"
              step="0.01"
              className="input mt-1 w-full"
              value={draft.costPerOrder}
              disabled={pending}
              onChange={(event) => updateEditField('costPerOrder', event.target.value)}
            />
            {fieldErrors.costPerOrder && <p id={costErrorId} role="alert" className="text-xs text-red-600">{fieldErrors.costPerOrder}</p>}
          </label>
          <button type="button" className="btn-primary" disabled={pending} aria-label={`Save ${name}`} onClick={() => void save(item)}>Save {name}</button>
          <button type="button" className="btn-secondary" disabled={pending} aria-label={`Cancel ${name}`} onClick={() => { setEditingId(null); setDraft(null); setFieldErrors({}); setError(null) }}>Cancel {name}</button>
        </div>
      )
    }

    return (
      <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-2" aria-busy={pending}>
        <span>
          <span>{item.name}</span> — {formatCurrency(Number(item.costPerOrder))}
          {isArchived && item.effectiveTo && <span className="ml-2 text-gray-500">Effective to: {item.effectiveTo.slice(0, 10)}</span>}
        </span>
        <div className="flex gap-2">
          {isArchived ? (
            <button type="button" aria-label={`Restore ${name}`} disabled={pending} onClick={() => void restore(item)}>Restore</button>
          ) : (
            <>
              <button type="button" aria-label={`Edit ${name}`} disabled={pending} onClick={() => { setEditingId(item.id); setDraft({ name: item.name, costPerOrder: String(item.costPerOrder) }); setFieldErrors({}); setError(null) }}>Edit</button>
              <button type="button" aria-label={`Archive ${name}`} disabled={pending} onClick={() => void archive(item)}>Archive</button>
            </>
          )}
        </div>
      </div>
    )
  }

  const newNameErrorId = fieldErrorId('name')
  const newCostErrorId = fieldErrorId('costPerOrder')
  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Packaging Overhead</h3>
      <p>Total per order</p>
      <p>{formatCurrency(packagingTotal)}</p>
      {active.map((item) => row(item, false))}
      {archived.length > 0 && (
        <div>
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>Archived ({archived.length})</button>
          {showArchived && archived.map((item) => row(item, true))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <div>
          <input
            id="packaging-new-name"
            placeholder="Item name (e.g., Tape)"
            aria-label="New overhead name"
            aria-describedby={newFieldErrors.name ? newNameErrorId : undefined}
            aria-invalid={Boolean(newFieldErrors.name)}
            value={newName}
            disabled={pendingId === 'new'}
            onChange={(event) => updateNewField('name', event.target.value)}
          />
          {newFieldErrors.name && <p id={newNameErrorId} role="alert" className="text-xs text-red-600">{newFieldErrors.name}</p>}
        </div>
        <div>
          <input
            id="packaging-new-cost"
            placeholder="Cost"
            aria-label="New overhead cost"
            aria-describedby={newFieldErrors.costPerOrder ? newCostErrorId : undefined}
            aria-invalid={Boolean(newFieldErrors.costPerOrder)}
            type="number"
            value={newCost}
            disabled={pendingId === 'new'}
            onChange={(event) => updateNewField('costPerOrder', event.target.value)}
          />
          {newFieldErrors.costPerOrder && <p id={newCostErrorId} role="alert" className="text-xs text-red-600">{newFieldErrors.costPerOrder}</p>}
        </div>
        <button type="button" className="btn-primary" disabled={pendingId === 'new' || !newName.trim() || !newCost.trim()} onClick={() => void add()}>Add</button>
      </div>
    </section>
  )
}
