import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'

vi.mock('../../features/settings/components/SupplierProductsModal', () => ({
  default: ({ supplier, onClose }: { supplier: { id: string }; onClose: () => void }) => (
    <div role="dialog">
      <span>Supplier products for {supplier.id}</span>
      <button type="button" onClick={onClose}>Close modal</button>
    </div>
  ),
}))

import SupplierManagementSection from '../../features/settings/components/SupplierManagementSection'

const activeSupplier = {
  id: 's1',
  name: 'Home Bargains',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const secondSupplier = {
  id: 's2',
  name: 'Amazon',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const archivedSupplier = {
  id: 's3',
  name: 'Old supplier',
  isActive: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const renderSection = (overrides: Record<string, unknown> = {}) => {
  const props = {
    suppliersList: [activeSupplier],
    onCreate: vi.fn().mockResolvedValue({ item: activeSupplier, outcome: 'created' }),
    onUpdate: vi.fn().mockResolvedValue(activeSupplier),
    onArchive: vi.fn().mockResolvedValue(undefined),
    onRestore: vi.fn().mockResolvedValue(activeSupplier),
    ...overrides,
  }

  return {
    ...props,
    ...render(<SupplierManagementSection {...(props as any)} />),
  }
}

describe('SupplierManagementSection', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the section description and active supplier names', () => {
    renderSection({ suppliersList: [activeSupplier, secondSupplier] })

    expect(screen.getByText('Suppliers / Shops')).toBeInTheDocument()
    expect(screen.getByText(/Manage shops where products can be purchased/)).toBeInTheDocument()
    expect(screen.getByText('Home Bargains')).toBeInTheDocument()
    expect(screen.getByText('Amazon')).toBeInTheDocument()
  })

  it('renames a supplier and saves the trimmed draft', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue({ ...activeSupplier, name: 'Corner Shop' })
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit Home Bargains supplier' }))
    await user.clear(screen.getByLabelText('Supplier name'))
    await user.type(screen.getByLabelText('Supplier name'), '  Corner Shop  ')
    await user.click(screen.getByRole('button', { name: 'Save Home Bargains supplier' }))

    expect(onUpdate).toHaveBeenCalledWith('s1', { name: 'Corner Shop' })
  })

  it('retains a rename draft and shows a field conflict', async () => {
    const user = userEvent.setup()
    const error = Object.assign(new Error('Supplier name is already in use'), {
      body: { error: 'Supplier name is already in use', field: 'name' },
    })
    const onUpdate = vi.fn().mockRejectedValue(error)
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit Home Bargains supplier' }))
    await user.clear(screen.getByLabelText('Supplier name'))
    await user.type(screen.getByLabelText('Supplier name'), 'Amazon')
    await user.click(screen.getByRole('button', { name: 'Save Home Bargains supplier' }))

    expect(await screen.findByText('Supplier name is already in use')).toBeInTheDocument()
    expect(screen.getByLabelText('Supplier name')).toHaveValue('Amazon')
    expect(screen.getByRole('button', { name: 'Save Home Bargains supplier' })).toBeInTheDocument()
  })

  it('cancels a rename and restores the view row', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(activeSupplier)
    renderSection({ onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit Home Bargains supplier' }))
    await user.clear(screen.getByLabelText('Supplier name'))
    await user.type(screen.getByLabelText('Supplier name'), 'Changed')
    await user.click(screen.getByRole('button', { name: 'Cancel Home Bargains supplier' }))

    expect(screen.queryByRole('button', { name: 'Save Home Bargains supplier' })).not.toBeInTheDocument()
    expect(screen.getByText('Home Bargains')).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it.each(['created', 'existing', 'restored'] as const)(
    'shows the %s confirmation returned by Add',
    async (outcome) => {
      const user = userEvent.setup()
      const onCreate = vi.fn().mockResolvedValue({ item: activeSupplier, outcome })
      renderSection({ suppliersList: [], onCreate })

      await user.type(screen.getByPlaceholderText('Shop name (e.g., Home Bargains)'), 'New shop')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(onCreate).toHaveBeenCalledWith({ name: 'New shop' })
      expect(await screen.findByText(new RegExp(`Supplier ${outcome}`, 'i'))).toBeInTheDocument()
    },
  )

  it('requires confirmation before archiving and shows archive failures', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn().mockRejectedValue(new Error('Archive failed'))
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    renderSection({ onArchive })

    await user.click(screen.getByRole('button', { name: 'Archive Home Bargains supplier' }))

    expect(confirmMock).toHaveBeenCalledWith('Archive this supplier?')
    expect(await screen.findByRole('alert')).toHaveTextContent('Archive failed')
  })

  it('keeps archived suppliers collapsed and restores by ID', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn().mockResolvedValue(activeSupplier)
    renderSection({ suppliersList: [activeSupplier, archivedSupplier], onRestore })

    expect(screen.queryByText('Old supplier')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Archived \(1\)/ }))
    expect(screen.getByText('Old supplier')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore Old supplier supplier' }))

    expect(onRestore).toHaveBeenCalledWith('s3')
  })

  it('preserves the Products action and passes the exact supplier ID to the modal', async () => {
    const user = userEvent.setup()
    renderSection({ suppliersList: [activeSupplier] })

    await user.click(screen.getByRole('button', { name: 'Products for Home Bargains' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Supplier products for s1')
  })

  it('disables the selected rename input while saving and keeps other rows usable', async () => {
    const user = userEvent.setup()
    let resolveUpdate: ((item: typeof activeSupplier) => void) | undefined
    const onUpdate = vi.fn().mockImplementation(() => new Promise<typeof activeSupplier>((resolve) => {
      resolveUpdate = resolve
    }))
    renderSection({ suppliersList: [activeSupplier, secondSupplier], onUpdate })

    await user.click(screen.getByRole('button', { name: 'Edit Home Bargains supplier' }))
    await user.click(screen.getByRole('button', { name: 'Save Home Bargains supplier' }))

    expect(screen.getByLabelText('Supplier name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit Amazon supplier' })).toBeEnabled()

    resolveUpdate?.(activeSupplier)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Home Bargains supplier' })).toBeInTheDocument())
  })
})
