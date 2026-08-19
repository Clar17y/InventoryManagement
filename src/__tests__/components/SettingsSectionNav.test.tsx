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
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.getByRole('tab', { name: 'Postage' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Suppliers' }))

    expect(onChange).toHaveBeenCalledWith('suppliers')
  })
})
