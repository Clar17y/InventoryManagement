import { useState } from 'react'
import { FunnelIcon } from '@heroicons/react/24/outline'
import { useDebounce } from '../../hooks/useDebounce'

interface DateSearchFilterProps {
    startDate: string
    endDate: string
    searchQuery: string
    onStartDateChange: (date: string) => void
    onEndDateChange: (date: string) => void
    onSearchChange: (query: string) => void
    searchPlaceholder?: string
    showQuickSelectors?: boolean
}

export default function DateSearchFilter({
    startDate,
    endDate,
    searchQuery,
    onStartDateChange,
    onEndDateChange,
    onSearchChange,
    searchPlaceholder = 'Search...',
    showQuickSelectors = true,
}: DateSearchFilterProps) {
    const currentYear = new Date().getFullYear()

    const setDateRange = (start: string, end: string) => {
        onStartDateChange(start)
        onEndDateChange(end)
    }

    const clearDateFilter = () => {
        onStartDateChange('')
        onEndDateChange('')
    }

    const getQuarterDates = (quarter: number, year: number) => {
        const quarters = [
            { start: `${year}-01-01`, end: `${year}-03-31` },
            { start: `${year}-04-01`, end: `${year}-06-30` },
            { start: `${year}-07-01`, end: `${year}-09-30` },
            { start: `${year}-10-01`, end: `${year}-12-31` },
        ]
        return quarters[quarter - 1] || { start: '', end: '' }
    }

    // Financial year is April to March
    const getFYDates = (year: number) => ({
        start: `${year}-04-01`,
        end: `${year + 1}-03-31`,
    })

    return (
        <div className="card space-y-3">
            {/* Search - full width on mobile, appears first for quick access */}
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="text-sm border rounded-lg px-3 py-1.5 flex-1 min-w-0"
                    placeholder={searchPlaceholder}
                />
                {searchQuery && (
                    <button
                        onClick={() => onSearchChange('')}
                        className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Date filters - wrap naturally on mobile */}
            <div className="flex items-center gap-2 flex-wrap">
                <FunnelIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    className="text-sm border rounded-lg px-2 py-1.5 min-w-0"
                    placeholder="Start date"
                />
                <span className="text-gray-400">to</span>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    className="text-sm border rounded-lg px-2 py-1.5 min-w-0"
                    placeholder="End date"
                />
                {(startDate || endDate) && (
                    <button
                        onClick={clearDateFilter}
                        className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Quick selectors */}
            {showQuickSelectors && (
                <div className="overflow-x-auto -mx-4 px-4 pb-1">
                    <div className="flex gap-2 min-w-max">
                        <span className="text-xs text-gray-500 self-center">Quick:</span>
                        {[1, 2, 3, 4].map((q) => {
                            const dates = getQuarterDates(q, currentYear)
                            return (
                                <button
                                    key={q}
                                    onClick={() => setDateRange(dates.start || '', dates.end || '')}
                                    className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 whitespace-nowrap"
                                >
                                    Q{q} {currentYear}
                                </button>
                            )
                        })}
                        <button
                            onClick={() => setDateRange(`${currentYear}-01-01`, `${currentYear}-12-31`)}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 whitespace-nowrap"
                        >
                            {currentYear}
                        </button>
                        <button
                            onClick={() => {
                                const fy = getFYDates(currentYear - 1) // Current FY started last April
                                setDateRange(fy.start, fy.end)
                            }}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 whitespace-nowrap"
                        >
                            FY {currentYear - 1}/{currentYear}
                        </button>
                        <button
                            onClick={clearDateFilter}
                            className="text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 whitespace-nowrap"
                        >
                            All Time
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// Hook to use with the DateSearchFilter component
export function useDateSearchFilter() {
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const debouncedSearchQuery = useDebounce(searchQuery, 400)

    return {
        startDate,
        endDate,
        searchQuery,
        debouncedSearchQuery,
        setStartDate,
        setEndDate,
        setSearchQuery,
    }
}
