import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'
import PackagingOverheadSection from '../../features/settings/components/PackagingOverheadSection'

const activeOverhead = {
  id: 'pkg1',
  name: 'Tape',
  costPerOrder: 0.15,
  effectiveFrom: '2024-01-01T00:00:00.000Z',
  effectiveTo: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
}

const secondOverhead = {
  id: 'pkg2',
  name: 'Bubble wrap',
  costPerOrder: 0.2,
  effectiveFrom: '2024-01-01T00:00:00.000Z',
  effectiveTo: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
}

const archivedOverhead = {
  id: 'pkg3',
  name: 'Old boxes',
  costPerOrder: 0.3,
  effectiveFrom: '2024-01-01T00:00:00.000Z',
  effectiveTo: '2024-02-01T00:00:00.000Z',
  isActive: false,
  createdAt: '2024-01-01T00:00:00.000Z',
}

const renderSection = (overrides: Record<string, unknown> = {}) => {
  const props = {
    packagingOverheads: [activeOverhead],
    packagingTotal: 0.15,
    onCreate: vi.fn().mockResolvedValue(activeOverhead),
    onUpdate: vi.fn().mockResolvedValue(activeOverhead),
    onArchive: vi.fn().mockResolvedValue(undefined),
    onRestore: vi.fn().mockResolvedValue(activeOverhead),
    ...overrides,
  }

  return {
    ...props,
    ...render(<PackagingOverheadSection {...(props as any)} />),
  }
}

describe('PackagingOverheadSection', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders active overheads and the total', () => {
    renderSection({ packagingOverheads: [activeOverhead, secondOverhead], packagingTotal: 0.35 })

    expect(screen.getByText('Packaging Overhead')).toBeInTheDocument()
    expect(screen.getByText('Tape')).toBeInTheDocument()
    expect(screen.getByText('Bubble wrap')).toBeInTheDocument()
    expect(screen.getByText('Total per order')).toBeInTheDocument()
    expect(screen.getByText('£0.35')).toBeInTheDocument()
  })

  it('edits the overhead name and cost and saves the selected row', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue({ ...activeOverhead, name: 'Bubble wrap', costPerOrder: 0.24 })
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit Tape overhead' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Bubble wrap')
    await user.clear(screen.getByLabelText('Cost per order'))
    await user.type(screen.getByLabelText('Cost per order'), '0.24')
    await user.click(screen.getByRole('button', { name: 'Save Tape overhead' }))

    expect(onUpdate).toHaveBeenCalledWith('pkg1', {
      name: 'Bubble wrap',
      costPerOrder: 0.24,
    })
  })

  it('cancels an overhead edit and restores view mode', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(activeOverhead)
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit Tape overhead' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Changed')
    await user.click(screen.getByRole('button', { name: 'Cancel Tape overhead' }))

    expect(screen.queryByRole('button', { name: 'Save Tape overhead' })).not.toBeInTheDocument()
    expect(screen.getByText('Tape')).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('shows numeric validation beside an invalid cost', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderSection({ packagingOverheads: [], packagingTotal: 0, onCreate })

    await user.type(screen.getByPlaceholderText('Item name (e.g., Tape)'), 'Tape')
    await user.type(screen.getByPlaceholderText('Cost'), '-0.10')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Cost must be a finite, non-negative number')).toBeInTheDocument()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('retains the draft and shows a recoverable update error', async () => {
    const user = userEvent.setup()
    const error = Object.assign(new Error('Overhead could not be saved'), {
      body: { error: 'Overhead could not be saved', field: 'name' },
    })
    const onUpdate = vi.fn().mockRejectedValue(error)
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit Tape overhead' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Changed')
    await user.click(screen.getByRole('button', { name: 'Save Tape overhead' }))

    expect(await screen.findByText('Overhead could not be saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Changed')
    expect(screen.getByRole('button', { name: 'Save Tape overhead' })).toBeInTheDocument()
  })

  it('requires confirmation before archiving and shows archive failures', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn().mockRejectedValue(new Error('Archive failed'))
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    renderSection({ onArchive })

    await user.click(screen.getByRole('button', { name: 'Archive Tape overhead' }))

    expect(confirmMock).toHaveBeenCalledWith('Archive this packaging overhead?')
    expect(await screen.findByRole('alert')).toHaveTextContent('Archive failed')
  })

  it('keeps archived overheads collapsed, displays effectiveTo, and restores by ID', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn().mockResolvedValue(activeOverhead)
    renderSection({ packagingOverheads: [activeOverhead, archivedOverhead], onRestore })

    expect(screen.queryByText('Old boxes')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Archived \(1\)/ }))
    expect(screen.getByText('Old boxes')).toBeInTheDocument()
    expect(screen.getByText(/Effective to: 2024-02-01/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restore Old boxes overhead' }))
    expect(onRestore).toHaveBeenCalledWith('pkg3')
  })

  it('disables only the selected row while saving', async () => {
    const user = userEvent.setup()
    let resolveUpdate: ((item: typeof activeOverhead) => void) | undefined
    const onUpdate = vi.fn().mockImplementation(() => new Promise<typeof activeOverhead>((resolve) => {
      resolveUpdate = resolve
    }))
    renderSection({ packagingOverheads: [activeOverhead, secondOverhead], onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit Tape overhead' }))
    await user.click(screen.getByRole('button', { name: 'Save Tape overhead' }))

    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByLabelText('Cost per order')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit Bubble wrap overhead' })).toBeEnabled()

    resolveUpdate?.(activeOverhead)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Tape overhead' })).toBeInTheDocument())
  })
})
