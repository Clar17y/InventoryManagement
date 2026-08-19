/* eslint-disable react-refresh/only-export-components */

export const settingsSections = [
  { id: 'postage', label: 'Postage' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'etsy-fees', label: 'Etsy Fees' },
  { id: 'audit', label: 'Audit History' },
] as const

export type SettingsSection = typeof settingsSections[number]['id']

interface SettingsSectionNavProps {
  active: SettingsSection
  onChange: (section: SettingsSection) => void
}

export default function SettingsSectionNav({ active, onChange }: SettingsSectionNavProps) {
  return (
    <nav aria-label="Settings sections">
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex min-w-max gap-1 overflow-x-auto md:min-w-0 md:flex-col md:overflow-visible"
      >
        {settingsSections.map((section) => {
          const selected = active === section.id

          return (
            <button
              key={section.id}
              id={`settings-tab-${section.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`settings-panel-${section.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(section.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors md:w-full ${
                selected
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {section.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
