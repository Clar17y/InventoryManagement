export default function Sales() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Sales</h2>
        <button className="btn-primary">+ Record Sale</button>
      </div>

      <div className="card text-gray-500 text-center py-12">
        <p className="mb-4">No sales recorded yet</p>
        <p className="text-sm">Record your first sale to start tracking margins</p>
      </div>
    </div>
  )
}
