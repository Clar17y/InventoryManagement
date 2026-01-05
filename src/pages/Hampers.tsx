export default function Hampers() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Hampers</h2>
        <button className="btn-primary">+ New Hamper</button>
      </div>

      <div className="card text-gray-500 text-center py-12">
        <p className="mb-4">No hampers defined yet</p>
        <p className="text-sm">Create your first hamper to start tracking availability</p>
      </div>
    </div>
  )
}
