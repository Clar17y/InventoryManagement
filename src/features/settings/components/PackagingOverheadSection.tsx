import { useState } from 'react'
import type { PackagingOverhead } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
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

function errorMessage(error: unknown) {
  const candidate = error as { message?: unknown; body?: { error?: unknown } } | null
  return typeof candidate?.body?.error === 'string' ? candidate.body.error : typeof candidate?.message === 'string' ? candidate.message : 'Request failed'
}

function parseCost(value: string) {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export default function PackagingOverheadSection({ packagingOverheads, packagingTotal, onCreate, onUpdate, onArchive, onRestore }: Props) {
  const [newName, setNewName] = useState('')
  const [newCost, setNewCost] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const active = packagingOverheads.filter((item) => item.isActive)
  const archived = packagingOverheads.filter((item) => !item.isActive)

  const save = async (item: PackagingOverhead) => {
    if (!draft) return
    const costPerOrder = parseCost(draft.costPerOrder)
    if (!draft.name.trim()) return setError('Name is required')
    if (costPerOrder === undefined) return setError('Cost must be a finite, non-negative number')
    setPendingId(item.id); setError(null)
    try { await onUpdate(item.id, { name: draft.name.trim(), costPerOrder }); setEditingId(null); setDraft(null) }
    catch (err) { setError(errorMessage(err)) }
    finally { setPendingId(null) }
  }
  const add = async () => {
    const costPerOrder = parseCost(newCost)
    if (!newName.trim()) return setError('Name is required')
    if (costPerOrder === undefined) return setError('Cost must be a finite, non-negative number')
    setPendingId('new'); setError(null)
    try { await onCreate({ name: newName.trim(), costPerOrder }); setNewName(''); setNewCost('') }
    catch (err) { setError(errorMessage(err)) }
    finally { setPendingId(null) }
  }
  const archive = async (item: PackagingOverhead) => {
    if (!confirm('Archive this packaging overhead?')) return
    setPendingId(item.id); setError(null)
    try { await onArchive(item.id) } catch (err) { setError(errorMessage(err)) } finally { setPendingId(null) }
  }
  const restore = async (item: PackagingOverhead) => {
    setPendingId(item.id); setError(null)
    try { await onRestore(item.id) } catch (err) { setError(errorMessage(err)) } finally { setPendingId(null) }
  }
  const row = (item: PackagingOverhead, isArchived: boolean) => {
    const name = `${item.name} overhead`; const pending = pendingId === item.id
    if (editingId === item.id && draft) return <div key={item.id} className="space-y-2 rounded-lg bg-gray-50 p-3" aria-busy={pending}>
      <label className="block text-sm">Name<input aria-label="Name" className="input mt-1 w-full" value={draft.name} disabled={pending} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setError(null) }} /></label>
      <label className="block text-sm">Cost per order<input aria-label="Cost per order" type="number" step="0.01" className="input mt-1 w-full" value={draft.costPerOrder} disabled={pending} onChange={(e) => { setDraft({ ...draft, costPerOrder: e.target.value }); setError(null) }} /></label>
      <button type="button" className="btn-primary" disabled={pending} aria-label={`Save ${name}`} onClick={() => void save(item)}>Save {name}</button>
      <button type="button" className="btn-secondary" disabled={pending} aria-label={`Cancel ${name}`} onClick={() => { setEditingId(null); setDraft(null); setError(null) }}>Cancel {name}</button>
    </div>
    return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-2" aria-busy={pending}>
      <span><span>{item.name}</span> — {formatCurrency(Number(item.costPerOrder))}{isArchived && item.effectiveTo && <span className="ml-2 text-gray-500">Effective to: {item.effectiveTo.slice(0, 10)}</span>}</span>
      <div className="flex gap-2">{isArchived ? <button type="button" aria-label={`Restore ${name}`} disabled={pending} onClick={() => void restore(item)}>Restore</button> : <><button type="button" aria-label={`Edit ${name}`} disabled={pending} onClick={() => { setEditingId(item.id); setDraft({ name: item.name, costPerOrder: String(item.costPerOrder) }); setError(null) }}>Edit</button><button type="button" aria-label={`Archive ${name}`} disabled={pending} onClick={() => void archive(item)}>Remove</button></>}</div>
    </div>
  }
  return <section className="card space-y-4"><h3 className="font-medium">Packaging Overhead</h3><p>Total per order</p><p>{formatCurrency(packagingTotal)}</p>{active.map((item) => row(item, false))}{archived.length > 0 && <div><button type="button" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>Archived ({archived.length})</button>{showArchived && archived.map((item) => row(item, true))}</div>}{error && <p role="alert">{error}</p>}<div className="flex gap-2"><input placeholder="Item name (e.g., Tape)" aria-label="New overhead name" value={newName} disabled={pendingId === 'new'} onChange={(e) => { setNewName(e.target.value); setError(null) }} /><input placeholder="Cost" aria-label="New overhead cost" type="number" value={newCost} disabled={pendingId === 'new'} onChange={(e) => { setNewCost(e.target.value); setError(null) }} /><button type="button" className="btn-primary" disabled={pendingId === 'new' || !newName.trim() || !newCost.trim()} onClick={() => void add()}>Add</button></div></section>
}
