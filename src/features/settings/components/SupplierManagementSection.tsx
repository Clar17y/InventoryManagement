import type { Supplier } from '../../../lib/api'

interface SupplierManagementSectionProps {
  suppliersList: Supplier[]
  newSupplierName: string
  onNewSupplierNameChange: (value: string) => void
  saving: boolean
  onAddSupplier: () => void
  onDeleteSupplier: (id: string) => void
}

export default function SupplierManagementSection({
  suppliersList,
  newSupplierName,
  onNewSupplierNameChange,
  saving,
  onAddSupplier,
  onDeleteSupplier,
}: SupplierManagementSectionProps) {
  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Suppliers / Shops</h3>
      <p className="text-sm text-gray-500">
        Manage shops where products can be purchased. Assign suppliers to products to generate per-shop shopping lists.
      </p>

      {suppliersList.length > 0 && (
        <div className="space-y-2">
          {suppliersList.map((supplier) => (
            <div key={supplier.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
              <span>{supplier.name}</span>
              <button
                onClick={() => onDeleteSupplier(supplier.id)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newSupplierName}
          onChange={(e) => onNewSupplierNameChange(e.target.value)}
          className="input flex-1"
          placeholder="Shop name (e.g., Home Bargains)"
        />
        <button
          onClick={onAddSupplier}
          disabled={saving || !newSupplierName.trim()}
          className="btn-primary"
        >
          Add
        </button>
      </div>
    </section>
  )
}
