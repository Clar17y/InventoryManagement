import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

interface SettingsLinkItem {
  to: string
  title: string
  description: string
}

interface SettingsLinksListProps {
  links: SettingsLinkItem[]
}

export default function SettingsLinksList({ links }: SettingsLinksListProps) {
  return (
    <div className="space-y-2">
      {links.map((link) => (
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
  )
}

