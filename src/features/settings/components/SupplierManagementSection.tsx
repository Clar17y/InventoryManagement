import { useState } from 'react'
import type { Supplier } from '../../../lib/api'
import type {
  SupplierCreateBody,
  SupplierMutationResponse,
  SupplierUpdateBody,
} from '#contracts/routes/suppliers'
import SupplierProductsModal from './SupplierProductsModal'

interface Props {
  suppliersList: Supplier[]
  onCreate: (data: SupplierCreateBody) => Promise<SupplierMutationResponse>
  onUpdate: (id: string, data: SupplierUpdateBody) => Promise<Supplier>
  onArchive: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<Supplier>
}

function message(error: unknown) {
  const candidate = error as { message?: unknown; body?: { error?: unknown } } | null
  return typeof candidate?.body?.error === 'string'
    ? candidate.body.error
    : typeof candidate?.message === 'string'
      ? candidate.message
      : 'Request failed'
}

export default function SupplierManagementSection({
  suppliersList,
  onCreate,
  onUpdate,
  onArchive,
  onRestore,
}: Props) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [managingSupplier, setManagingSupplier] = useState<Supplier | null>(null)

  const active = suppliersList.filter((supplier) => supplier.isActive)
  const archived = suppliersList.filter((supplier) => !supplier.isActive)

  const add = async () => {
    if (!newName.trim()) return
    setPendingId('new')
    setError(null)
    try {
      const result = await onCreate({ name: newName.trim() })
      setNewName('')
      setConfirmation(`Supplier ${result.outcome}.`)
    } catch (err) {
      setError(message(err))
    } finally {
      setPendingId(null)
    }
  }

  const save = async (supplier: Supplier) => {
    if (!draft.trim()) {
      setError('Supplier name is required')
      return
    }
    setPendingId(supplier.id)
    setError(null)
    try {
      await onUpdate(supplier.id, { name: draft.trim() })
      setEditingId(null)
      setConfirmation('Supplier updated.')
    } catch (err) {
      setError(message(err))
    } finally {
      setPendingId(null)
    }
  }

  const archive = async (supplier: Supplier) => {
    if (!confirm('Archive this supplier?')) return
    setPendingId(supplier.id)
    setError(null)
    try {
      await onArchive(supplier.id)
      setConfirmation('Supplier archived.')
    } catch (err) {
      setError(message(err))
    } finally {
      setPendingId(null)
    }
  }

  const restore = async (supplier: Supplier) => {
    setPendingId(supplier.id)
    setError(null)
    try {
      await onRestore(supplier.id)
      setConfirmation('Supplier restored.')
    } catch (err) {
      setError(message(err))
    } finally {
      setPendingId(null)
    }
  }

  const row = (supplier: Supplier, isArchived: boolean) => {
    const name = `${supplier.name} supplier`
    const pending = pendingId === supplier.id

    if (editingId === supplier.id) {
      return (
        <div key={supplier.id} className="space-y-2 rounded-lg bg-gray-50 p-3">
          <label>
            Supplier name
            <input
              aria-label="Supplier name"
              className="input"
              value={draft}
              disabled={pending}
              onChange={(event) => {
                setDraft(event.target.value)
                setError(null)
              }}
            />
          </label>
          <button type="button" aria-label={`Save ${name}`} disabled={pending} onClick={() => void save(supplier)}>
            Save {name}
          </button>
          <button
            type="button"
            aria-label={`Cancel ${name}`}
            disabled={pending}
            onClick={() => {
              setEditingId(null)
              setError(null)
            }}
          >
            Cancel {name}
          </button>
        </div>
      )
    }

    return (
      <div key={supplier.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-2">
        <span>{supplier.name}</span>
        <div className="flex gap-2">
          {isArchived ? (
            <button type="button" aria-label={`Restore ${name}`} disabled={pending} onClick={() => void restore(supplier)}>
              Restore
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label={`Products for ${supplier.name}`}
                disabled={pending}
                onClick={() => setManagingSupplier(supplier)}
              >
                Products
              </button>
              <button
                type="button"
                aria-label={`Edit ${name}`}
                disabled={pending}
                onClick={() => {
                  setEditingId(supplier.id)
                  setDraft(supplier.name)
                  setError(null)
                }}
              >
                Edit
              </button>
              <button type="button" aria-label={`Archive ${name}`} disabled={pending} onClick={() => void archive(supplier)}>
                Archive
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Suppliers / Shops</h3>
      <p className="text-sm text-gray-500">
        Manage shops where products can be purchased. Assign suppliers to products to generate per-shop shopping lists.
      </p>
      {active.map((supplier) => row(supplier, false))}
      {archived.length > 0 && (
        <div>
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
            Archived ({archived.length})
          </button>
          {showArchived && archived.map((supplier) => row(supplier, true))}
        </div>
      )}
      {confirmation && <p role="status">{confirmation}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <input
          placeholder="Shop name (e.g., Home Bargains)"
          aria-label="New supplier name"
          value={newName}
          disabled={pendingId === 'new'}
          onChange={(event) => {
            setNewName(event.target.value)
            setError(null)
          }}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={pendingId === 'new' || !newName.trim()}
          onClick={() => void add()}
        >
          Add
        </button>
      </div>
      {managingSupplier && <SupplierProductsModal supplier={managingSupplier} onClose={() => setManagingSupplier(null)} />}
    </section>
  )
}
