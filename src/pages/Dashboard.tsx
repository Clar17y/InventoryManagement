import { Link } from 'react-router-dom'

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/inventory"
            className="card flex flex-col items-center justify-center py-6 hover:border-primary-300 transition-colors"
          >
            <span className="text-3xl mb-2">📦</span>
            <span className="font-medium">Add Stock</span>
          </Link>
          <Link
            to="/sales"
            className="card flex flex-col items-center justify-center py-6 hover:border-primary-300 transition-colors"
          >
            <span className="text-3xl mb-2">💰</span>
            <span className="font-medium">Record Sale</span>
          </Link>
          <Link
            to="/hampers"
            className="card flex flex-col items-center justify-center py-6 hover:border-primary-300 transition-colors"
          >
            <span className="text-3xl mb-2">🎁</span>
            <span className="font-medium">View Hampers</span>
          </Link>
          <Link
            to="/inventory"
            className="card flex flex-col items-center justify-center py-6 hover:border-primary-300 transition-colors"
          >
            <span className="text-3xl mb-2">📊</span>
            <span className="font-medium">Stock Levels</span>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Overview</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <div className="text-sm text-gray-500">Products</div>
            <div className="text-2xl font-bold">--</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Low Stock</div>
            <div className="text-2xl font-bold text-amber-600">--</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Today's Sales</div>
            <div className="text-2xl font-bold">£--</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">This Week</div>
            <div className="text-2xl font-bold">£--</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Alerts</h2>
        <div className="card text-gray-500 text-center py-8">
          No alerts at this time
        </div>
      </section>
    </div>
  )
}
