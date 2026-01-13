type PresetDays = 7 | 30 | 90

interface DateRangePickerProps {
  presetDays: PresetDays | null
  startDate: string
  endDate: string
  onPresetSelect: (days: PresetDays) => void
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
}

export default function DateRangePicker({
  presetDays,
  startDate,
  endDate,
  onPresetSelect,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) {
  const presets: PresetDays[] = [7, 30, 90]

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {presets.map((days) => {
          const isActive = presetDays === days
          return (
            <button
              key={days}
              type="button"
              onClick={() => onPresetSelect(days)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {days}d
            </button>
          )
        })}
        <span className="text-xs text-gray-500">
          {presetDays === null ? 'Custom range' : 'Rolling period'}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500">From</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5"
        />
        <span className="text-sm text-gray-500">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5"
        />
      </div>
    </div>
  )
}

