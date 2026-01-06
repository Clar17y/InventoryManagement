import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '@heroicons/react/24/outline'

const settingsLinks = [
  {
    to: '/categories',
    title: 'Categories',
    description: 'Manage component categories (Hand Cream, Chocolate, etc.)',
  },
  {
    to: '/products',
    title: 'Products',
    description: 'Manage products and their barcodes',
  },
  {
    to: '/expenses',
    title: 'Business Expenses',
    description: 'Track advertising, postage, packaging, and other costs',
  },
]

export default function Settings() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Settings</h2>

      <div className="space-y-2">
        {settingsLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="card flex justify-between items-center hover:border-primary-300 transition-colors"
          >
            <div>
              <h3 className="font-medium">{link.title}</h3>
              <p className="text-sm text-gray-500">{link.description}</p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-gray-400" />
          </Link>
        ))}
      </div>

      <section className="card">
        <h3 className="font-medium mb-3">Etsy Fees</h3>
        <p className="text-sm text-gray-500 mb-3">
          Configure Etsy transaction and payment fees for margin calculations
        </p>
        <p className="text-xs text-gray-400">Coming soon</p>
      </section>

      <section className="card">
        <h3 className="font-medium mb-3">Packaging Overhead</h3>
        <p className="text-sm text-gray-500 mb-3">
          Set average costs for tape, bubble wrap, and other consumables
        </p>
        <p className="text-xs text-gray-400">Coming soon</p>
      </section>
    </div>
  )
}
