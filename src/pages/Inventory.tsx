export default function Inventory() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Inventory</h2>
        <button className="btn-primary">+ Add Stock</button>
      </div>

      <div className="card text-gray-500 text-center py-12">
        <p className="mb-4">No products yet</p>
        <p className="text-sm">Add your first product to get started</p>
      </div>
    </div>
  )
}
