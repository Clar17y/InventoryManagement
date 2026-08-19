import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'
import SettingsSectionNav from '../../features/settings/components/SettingsSectionNav'

const DESKTOP_QUERY = '(min-width: 768px)'
const defaultMatchMedia = window.matchMedia

function installMatchMediaMock(initialMatches: boolean) {
  let currentMatches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQuery = {
    get matches() {
      return currentMatches
    },
    media: DESKTOP_QUERY,
    onchange: null,
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    }),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    }),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList

  const matchMedia = vi.fn().mockReturnValue(mediaQuery)
  window.matchMedia = matchMedia

  return {
    mediaQuery,
    setMatches(nextMatches: boolean) {
      currentMatches = nextMatches
      listeners.forEach((listener) => listener({ matches: nextMatches, media: DESKTOP_QUERY } as MediaQueryListEvent))
    },
  }
}

afterEach(() => {
  window.matchMedia = defaultMatchMedia
})

describe('SettingsSectionNav', () => {
  it('renders every section and reports the selected tab', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<SettingsSectionNav active="postage" onChange={onChange} />)

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal')
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.getByRole('tab', { name: 'Postage' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Suppliers' }))

    expect(onChange).toHaveBeenCalledWith('suppliers')
  })

  it('exposes horizontal orientation below the desktop breakpoint', async () => {
    installMatchMediaMock(false)

    render(<SettingsSectionNav active="postage" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal')
    })
  })

  it('exposes vertical orientation at desktop width and follows media-query changes', async () => {
    const controller = installMatchMediaMock(true)

    render(<SettingsSectionNav active="postage" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical')
    })
    expect(controller.mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    act(() => controller.setMatches(false))

    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('supports keyboard navigation and updates the selected tab', async () => {
    const user = userEvent.setup()

    function ControlledNav() {
      const [active, setActive] = useState<'postage' | 'packaging' | 'suppliers' | 'etsy-fees' | 'audit'>('postage')
      return <SettingsSectionNav active={active} onChange={setActive} />
    }

    render(<ControlledNav />)

    screen.getByRole('tab', { name: 'Postage' }).focus()
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('tab', { name: 'Packaging' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Packaging' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Audit History' })).toHaveFocus()

    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Postage' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Postage' })).toHaveAttribute('aria-selected', 'true')
  })
})
