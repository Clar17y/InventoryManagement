import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'

vi.stubGlobal('confirm', vi.fn(() => true))

vi.mock('../../lib/api', () => ({
  etsy: {
    getStatus: vi.fn(),
    initiateAuth: vi.fn(),
    disconnect: vi.fn(),
    getPendingOrders: vi.fn(),
    importOrder: vi.fn(),
  },
}))

import EtsyOrdersSyncPanel from '../../components/EtsyOrdersSyncPanel'
import { etsy } from '../../lib/api'

const mockGetStatus = vi.mocked(etsy.getStatus)
const mockGetPendingOrders = vi.mocked(etsy.getPendingOrders)
const mockImportOrder = vi.mocked(etsy.importOrder)

describe('EtsyOrdersSyncPanel', () => {
  const mockOnClose = vi.fn()
  const mockOnImportComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStatus.mockResolvedValue({ connected: false })
    mockGetPendingOrders.mockResolvedValue({ orders: [] })
    mockImportOrder.mockResolvedValue({
      success: true,
      sale: { id: 'sale-1', etsyOrderId: '12345', lines: 1 },
    })
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <EtsyOrdersSyncPanel isOpen={false} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('shows connect prompt when not connected', async () => {
    mockGetStatus.mockResolvedValue({ connected: false })

    render(
      <EtsyOrdersSyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
    )

    await waitFor(() => {
      expect(screen.getByText('Connect to Etsy')).toBeInTheDocument()
    })
  })

  it('loads and displays pending orders when connected', async () => {
    mockGetStatus.mockResolvedValue({ connected: true, shopId: '123', shopName: 'Shop' })
    mockGetPendingOrders.mockResolvedValue({
      orders: [
        {
          receiptId: 12345,
          buyerName: 'John Doe',
          createdAt: '2024-01-15T10:00:00Z',
          isPaid: true,
          isShipped: false,
          grandTotal: 35,
          subtotal: 30,
          shippingCost: 5,
          items: [
            {
              transactionId: 1,
              listingId: 123,
              title: 'Test Listing',
              quantity: 1,
              price: 30,
              sku: null,
              productId: null,
              variantName: null,
            },
          ],
        },
      ],
    })

    render(
      <EtsyOrdersSyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
    )

    await waitFor(() => {
      expect(screen.getByText('Order #12345')).toBeInTheDocument()
    })
  })

  it('imports selected orders', async () => {
    const user = userEvent.setup()

    mockGetStatus.mockResolvedValue({ connected: true, shopId: '123', shopName: 'Shop' })
    mockGetPendingOrders.mockResolvedValue({
      orders: [
        {
          receiptId: 12345,
          buyerName: 'John Doe',
          createdAt: '2024-01-15T10:00:00Z',
          isPaid: true,
          isShipped: false,
          grandTotal: 35,
          subtotal: 30,
          shippingCost: 5,
          items: [
            {
              transactionId: 1,
              listingId: 123,
              title: 'Test Listing',
              quantity: 1,
              price: 30,
              sku: null,
              productId: null,
              variantName: null,
            },
          ],
        },
      ],
    })

    render(
      <EtsyOrdersSyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
    )

    await waitFor(() => {
      expect(screen.getByText('Order #12345')).toBeInTheDocument()
    })

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    await user.click(screen.getByRole('button', { name: /import selected/i }))

    await waitFor(() => {
      expect(mockImportOrder).toHaveBeenCalledWith({ receiptId: 12345, postageCost: 5 })
      expect(mockOnImportComplete).toHaveBeenCalled()
    })
  })
})

