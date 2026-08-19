import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'
import SettingsSectionNav from '../../features/settings/components/SettingsSectionNav'

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
