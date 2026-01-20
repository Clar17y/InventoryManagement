import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Hampers = lazy(() => import('./pages/Hampers'))
const Sales = lazy(() => import('./pages/Sales'))
const Settings = lazy(() => import('./pages/Settings'))
const Categories = lazy(() => import('./pages/Categories'))
const Products = lazy(() => import('./pages/Products'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Analytics = lazy(() => import('./pages/Analytics'))

// Dev bypass for testing without Supabase magic link
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading && !DEV_BYPASS_AUTH) {
    return <LoadingScreen />
  }

  if (!user && !DEV_BYPASS_AUTH) {
    return <Login />
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="hampers" element={<Hampers />} />
          <Route path="sales" element={<Sales />} />
          <Route path="settings" element={<Settings />} />
          <Route path="categories" element={<Categories />} />
          <Route path="products" element={<Products />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
