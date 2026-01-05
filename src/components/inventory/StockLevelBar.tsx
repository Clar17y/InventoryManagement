interface StockLevelBarProps {
    current: number
    max?: number
    showLabel?: boolean
    size?: 'sm' | 'md'
}

export default function StockLevelBar({
    current,
    max = 20,
    showLabel = true,
    size = 'md'
}: StockLevelBarProps) {
    const percentage = Math.min((current / max) * 100, 100)

    // Color based on stock health
    const getColor = () => {
        if (current <= 0) return 'bg-gray-300'
        if (current <= 5) return 'bg-red-500'
        if (current <= 10) return 'bg-amber-500'
        return 'bg-emerald-500'
    }

    const getTextColor = () => {
        if (current <= 0) return 'text-gray-500'
        if (current <= 5) return 'text-red-600'
        if (current <= 10) return 'text-amber-600'
        return 'text-emerald-600'
    }

    const barHeight = size === 'sm' ? 'h-1.5' : 'h-2'

    return (
        <div className="flex items-center gap-2">
            <div className={`flex-1 bg-gray-100 rounded-full ${barHeight} overflow-hidden`}>
                <div
                    className={`${barHeight} ${getColor()} rounded-full transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            {showLabel && (
                <span className={`text-sm font-medium ${getTextColor()} min-w-[3rem] text-right`}>
                    {current}
                </span>
            )}
        </div>
    )
}
