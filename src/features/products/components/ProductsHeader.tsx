import { PlusIcon } from '@heroicons/react/24/outline'

interface ProductsHeaderProps {
  showForm: boolean
  onAdd: () => void
}

export default function ProductsHeader({ showForm, onAdd }: ProductsHeaderProps) {
  return (
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-semibold">Products</h2>
      {!showForm && (
        <button onClick={onAdd} className="btn-primary flex items-center gap-1">
          <PlusIcon className="h-5 w-5" />
          Add
        </button>
      )}
    </div>
  )
}

