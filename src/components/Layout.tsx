import { Outlet, NavLink } from 'react-router-dom'
import {
  HomeIcon,
  CubeIcon,
  GiftIcon,
  CurrencyPoundIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../lib/auth'

const navItems = [
  { to: '/', icon: HomeIcon, label: 'Home' },
  { to: '/inventory', icon: CubeIcon, label: 'Stock' },
  { to: '/hampers', icon: GiftIcon, label: 'Hampers' },
  { to: '/sales', icon: CurrencyPoundIcon, label: 'Sales' },
  { to: '/settings', icon: Cog6ToothIcon, label: 'Settings' },
]

export default function Layout() {
  const { signOut, user } = useAuth()

  return (
    <div className="min-h-screen pb-16">
      <header className="bg-primary-600 text-white px-4 py-3 sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-lg font-semibold">Savvy Hampers</h1>
        <button
          onClick={signOut}
          className="flex items-center gap-1 text-sm opacity-80 hover:opacity-100"
          title={user?.email || 'Sign out'}
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
        </button>
      </header>

      <main className="p-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
        <div className="flex justify-around">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 px-3 text-xs ${
                  isActive
                    ? 'text-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`
              }
            >
              <Icon className="h-6 w-6" />
              <span className="mt-1">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
