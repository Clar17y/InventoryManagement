import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'
import PostageTiersSection from '../../features/settings/components/PostageTiersSection'

const activeTier = {
  id: 'tier1',
  etsyCharge: 5,
  actualCost: 5.05,
  label: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
}

const secondTier = {
  id: 'tier2',
  etsyCharge: 6,
  actualCost: 8.55,
  label: 'Large',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
}

const archivedTier = {
  id: 'tier3',
  etsyCharge: 7,
  actualCost: 7.25,
  label: 'Archived',
  isActive: false,
  createdAt: '2024-01-01T00:00:00Z',
}

const renderSection = (overrides: Record<string, unknown> = {}) => {
  const props = {
    tiers: [activeTier],
    onCreate: vi.fn().mockResolvedValue({ item: activeTier, outcome: 'created' }),
    onUpdate: vi.fn().mockResolvedValue(activeTier),
    onArchive: vi.fn().mockResolvedValue(undefined),
    onRestore: vi.fn().mockResolvedValue(activeTier),
    ...overrides,
  }

  return {
    ...props,
    ...render(<PostageTiersSection {...(props as any)} />),
  }
}

describe('PostageTiersSection', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the section description and active tier values', () => {
    renderSection({ tiers: [activeTier, secondTier] })

    expect(screen.getByText('Postage Tiers')).toBeInTheDocument()
    expect(screen.getByText(/Map Etsy shipping charges to actual postage costs/)).toBeInTheDocument()
    expect(screen.getByText(/Etsy charges £5\.00/)).toBeInTheDocument()
    expect(screen.getByText(/Actual cost £5\.05/)).toBeInTheDocument()
    expect(screen.getByText(/Etsy charges £6\.00/)).toBeInTheDocument()
    expect(screen.getByText(/Actual cost £8\.55/)).toBeInTheDocument()
  })

  it('edits every postage field and saves the selected row', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue({
      ...activeTier,
      etsyCharge: 5.5,
      actualCost: 3.85,
      label: 'Tracked 48',
    })

    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit £5.00 tier' }))
    await user.clear(screen.getByLabelText('Etsy charge'))
    await user.type(screen.getByLabelText('Etsy charge'), '5.50')
    await user.clear(screen.getByLabelText('Actual cost'))
    await user.type(screen.getByLabelText('Actual cost'), '3.85')
    await user.type(screen.getByLabelText('Label'), 'Tracked 48')
    await user.click(screen.getByRole('button', { name: 'Save £5.00 tier' }))

    expect(onUpdate).toHaveBeenCalledWith('tier1', {
      etsyCharge: 5.5,
      actualCost: 3.85,
      label: 'Tracked 48',
    })
  })

  it('cancels an edit and restores view mode without saving the draft', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(activeTier)
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit £5.00 tier' }))
    await user.clear(screen.getByLabelText('Actual cost'))
    await user.type(screen.getByLabelText('Actual cost'), '3.85')
    await user.click(screen.getByRole('button', { name: 'Cancel £5.00 tier' }))

    expect(screen.queryByRole('button', { name: 'Save £5.00 tier' })).not.toBeInTheDocument()
    expect(screen.getByText(/Actual cost £5\.05/)).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('normalizes an empty edit label to null', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(activeTier)
    renderSection({ tiers: [{ ...activeTier, label: 'Tracked' }], onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit £5.00 tier' }))
    await user.clear(screen.getByLabelText('Label'))
    await user.click(screen.getByRole('button', { name: 'Save £5.00 tier' }))

    expect(onUpdate).toHaveBeenCalledWith('tier1', {
      etsyCharge: 5,
      actualCost: 5.05,
      label: null,
    })
  })

  it('keeps the draft and shows a charge conflict beside the field', async () => {
    const user = userEvent.setup()
    const conflict = Object.assign(new Error('Etsy charge £5.50 is already used by another tier'), {
      status: 409,
      body: { error: 'Etsy charge £5.50 is already used by another tier', field: 'etsyCharge' },
    })
    const onUpdate = vi.fn().mockRejectedValue(conflict)
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit £5.00 tier' }))
    await user.clear(screen.getByLabelText('Etsy charge'))
    await user.type(screen.getByLabelText('Etsy charge'), '5.50')
    await user.click(screen.getByRole('button', { name: 'Save £5.00 tier' }))

    expect(await screen.findByText('Etsy charge £5.50 is already used by another tier')).toBeInTheDocument()
    expect(screen.getByLabelText('Etsy charge')).toHaveValue(5.5)
    expect(screen.getByRole('button', { name: 'Save £5.00 tier' })).toBeInTheDocument()
  })

  it('shows numeric validation beside an invalid add field', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderSection({ tiers: [], onCreate })

    await user.type(screen.getByPlaceholderText('Etsy charge'), '-1')
    await user.type(screen.getByPlaceholderText('Actual cost'), '2.00')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Etsy charge must be a finite, non-negative number')).toBeInTheDocument()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it.each(['created', 'updated', 'restored'] as const)(
    'shows the %s confirmation returned by Add',
    async (outcome) => {
      const user = userEvent.setup()
      const onCreate = vi.fn().mockResolvedValue({ item: activeTier, outcome })
      renderSection({ tiers: [], onCreate })

      await user.type(screen.getByPlaceholderText('Etsy charge'), '5.00')
      await user.type(screen.getByPlaceholderText('Actual cost'), '5.05')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(onCreate).toHaveBeenCalledWith({
        etsyCharge: 5,
        actualCost: 5.05,
        label: undefined,
      })
      expect(await screen.findByText(new RegExp(`Postage tier ${outcome}`, 'i'))).toBeInTheDocument()
    },
  )

  it('normalizes an empty add label to undefined', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue({ item: activeTier, outcome: 'created' })
    renderSection({ tiers: [], onCreate })

    await user.type(screen.getByPlaceholderText('Etsy charge'), '5.00')
    await user.type(screen.getByPlaceholderText('Actual cost'), '5.05')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onCreate).toHaveBeenCalledWith({
      etsyCharge: 5,
      actualCost: 5.05,
      label: undefined,
    })
  })

  it('requires archive confirmation before archiving a tier', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn().mockResolvedValue(undefined)
    const confirmMock = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmMock)
    renderSection({ onArchive })

    await user.click(screen.getByRole('button', { name: 'Archive £5.00 tier' }))
    expect(confirmMock).toHaveBeenCalledWith('Archive this postage tier?')
    expect(onArchive).not.toHaveBeenCalled()

    confirmMock.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Archive £5.00 tier' }))
    expect(onArchive).toHaveBeenCalledWith('tier1')
  })

  it('keeps archived tiers collapsed until opened and restores a selected tier', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn().mockResolvedValue(activeTier)
    renderSection({ tiers: [activeTier, archivedTier], onRestore })

    expect(screen.queryByText('Archived')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Archived \(1\)/ }))
    expect(screen.getByText(/Etsy charges £7\.00/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restore £7.00 tier' }))
    expect(onRestore).toHaveBeenCalledWith('tier3')
    await waitFor(() => {
      expect(screen.getByText('Postage tier restored.')).toBeInTheDocument()
    })
  })

  it('disables only the row being saved while other rows remain usable', async () => {
    const user = userEvent.setup()
    let resolveUpdate: ((tier: typeof activeTier) => void) | undefined
    const onUpdate = vi.fn().mockImplementation(() => new Promise<typeof activeTier>((resolve) => {
      resolveUpdate = resolve
    }))
    renderSection({ tiers: [activeTier, secondTier], onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit £5.00 tier' }))
    await user.click(screen.getByRole('button', { name: 'Save £5.00 tier' }))

    expect(screen.getByRole('button', { name: 'Save £5.00 tier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit £6.00 tier' })).toBeEnabled()

    resolveUpdate?.(activeTier)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit £5.00 tier' })).toBeInTheDocument()
    })
  })

  it('shows an archive failure beside the affected row', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn().mockRejectedValue(new Error('Archive failed'))
    renderSection({ onArchive })

    await user.click(screen.getByRole('button', { name: 'Archive £5.00 tier' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Archive failed')
  })

  it('shows a restore failure beside the affected archived row', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn().mockRejectedValue(new Error('Restore failed'))
    renderSection({ tiers: [activeTier, archivedTier], onRestore })

    await user.click(screen.getByRole('button', { name: /Archived \(1\)/ }))
    await user.click(screen.getByRole('button', { name: 'Restore £7.00 tier' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Restore failed')
  })

  it('disables the selected row inputs while its save is pending', async () => {
    const user = userEvent.setup()
    let resolveUpdate: ((tier: typeof activeTier) => void) | undefined
    const onUpdate = vi.fn().mockImplementation(() => new Promise<typeof activeTier>((resolve) => {
      resolveUpdate = resolve
    }))
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit £5.00 tier' }))
    await user.click(screen.getByRole('button', { name: 'Save £5.00 tier' }))

    expect(screen.getByLabelText('Etsy charge')).toBeDisabled()
    expect(screen.getByLabelText('Actual cost')).toBeDisabled()
    expect(screen.getByLabelText('Label')).toBeDisabled()

    resolveUpdate?.(activeTier)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit £5.00 tier' })).toBeInTheDocument())
  })

  it('disables all Add inputs while Add is pending', async () => {
    const user = userEvent.setup()
    let resolveCreate: ((result: { item: typeof activeTier; outcome: 'created' }) => void) | undefined
    const onCreate = vi.fn().mockImplementation(() => new Promise<{ item: typeof activeTier; outcome: 'created' }>((resolve) => {
      resolveCreate = resolve
    }))
    renderSection({ tiers: [], onCreate })

    await user.type(screen.getByPlaceholderText('Etsy charge'), '5.00')
    await user.type(screen.getByPlaceholderText('Actual cost'), '5.05')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByPlaceholderText('Etsy charge')).toBeDisabled()
    expect(screen.getByPlaceholderText('Actual cost')).toBeDisabled()
    expect(screen.getByPlaceholderText('Label (optional)')).toBeDisabled()

    resolveCreate?.({ item: activeTier, outcome: 'created' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument())
  })

  it('gives the Add inputs accessible names', () => {
    renderSection({ tiers: [] })

    expect(screen.getByRole('spinbutton', { name: 'New Etsy charge' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'New actual cost' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'New label' })).toBeInTheDocument()
  })
})
