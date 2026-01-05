import { Link } from 'react-router-dom'

interface AlertItem {
    id: string
    title: string
    subtitle?: string
    value?: string | number
    link?: string
}

interface AlertCardProps {
    type: 'warning' | 'danger' | 'info'
    title: string
    icon?: React.ReactNode
    items: AlertItem[]
    emptyMessage?: string
}

export default function AlertCard({ type, title, icon, items, emptyMessage = 'No alerts' }: AlertCardProps) {
    const getBorderColor = () => {
        switch (type) {
            case 'danger': return 'border-l-red-500'
            case 'warning': return 'border-l-amber-500'
            case 'info': return 'border-l-blue-500'
        }
    }

    const getHeaderBg = () => {
        switch (type) {
            case 'danger': return 'bg-red-50'
            case 'warning': return 'bg-amber-50'
            case 'info': return 'bg-blue-50'
        }
    }

    const getHeaderText = () => {
        switch (type) {
            case 'danger': return 'text-red-700'
            case 'warning': return 'text-amber-700'
            case 'info': return 'text-blue-700'
        }
    }

    return (
        <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${getBorderColor()} overflow-hidden`}>
            <div className={`px-4 py-3 ${getHeaderBg()} flex items-center gap-2`}>
                {icon}
                <h3 className={`font-semibold ${getHeaderText()}`}>{title}</h3>
                <span className={`ml-auto text-sm ${getHeaderText()} opacity-70`}>
                    {items.length}
                </span>
            </div>

            {items.length === 0 ? (
                <div className="px-4 py-6 text-center text-gray-500 text-sm">
                    {emptyMessage}
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {items.slice(0, 5).map((item) => (
                        <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                            {item.link ? (
                                <Link to={item.link} className="flex-1">
                                    <p className="font-medium text-gray-900 hover:text-indigo-600">{item.title}</p>
                                    {item.subtitle && (
                                        <p className="text-sm text-gray-500">{item.subtitle}</p>
                                    )}
                                </Link>
                            ) : (
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900">{item.title}</p>
                                    {item.subtitle && (
                                        <p className="text-sm text-gray-500">{item.subtitle}</p>
                                    )}
                                </div>
                            )}
                            {item.value !== undefined && (
                                <span className="text-sm font-medium text-gray-600 ml-4">
                                    {item.value}
                                </span>
                            )}
                        </div>
                    ))}
                    {items.length > 5 && (
                        <div className="px-4 py-2 text-center text-sm text-gray-500">
                            +{items.length - 5} more
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
