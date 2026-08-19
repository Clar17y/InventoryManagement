/* eslint-disable react-refresh/only-export-components */

import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % settingsSections.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + settingsSections.length) % settingsSections.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = settingsSections.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    tabRefs.current[nextIndex]?.focus()
    onChange(settingsSections[nextIndex]!.id)
  }

  return (
    <nav aria-label="Settings sections">
      <div
        role="tablist"
        aria-label="Settings sections"
        aria-orientation="horizontal"
        className="flex min-w-max gap-1 overflow-x-auto md:min-w-0 md:flex-col md:overflow-visible"
      >
        {settingsSections.map((section, index) => {
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
              ref={(button) => {
                tabRefs.current[index] = button
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
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
