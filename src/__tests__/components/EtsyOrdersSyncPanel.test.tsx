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
    importOrdersBulk: vi.fn(),
  },
  inventory: {
    lotsByCategory: vi.fn(),
  },
}))

import EtsyOrdersSyncPanel from '../../components/EtsyOrdersSyncPanel'
import { etsy, inventory } from '../../lib/api'
import { ApiError } from '../../lib/api/request'

const mockGetStatus = vi.mocked(etsy.getStatus)
const mockGetPendingOrders = vi.mocked(etsy.getPendingOrders)
const mockImportOrder = vi.mocked(etsy.importOrder)
const mockImportOrdersBulk = vi.mocked(etsy.importOrdersBulk)
const mockLotsByCategory = vi.mocked(inventory.lotsByCategory)

describe('EtsyOrdersSyncPanel', () => {
  const mockOnClose = vi.fn()
  const mockOnImportComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStatus.mockResolvedValue({ connected: false })
    mockGetPendingOrders.mockResolvedValue({ orders: [] })
    mockLotsByCategory.mockResolvedValue([])
    mockImportOrder.mockResolvedValue({
      success: true,
      sale: { id: 'sale-1', etsyOrderId: '12345', totalCost: 0, margin: 0, lines: 1 },
    })
    mockImportOrdersBulk.mockResolvedValue({
      success: true,
      imported: 1,
      failed: 0,
      results: [{ receiptId: 12345, success: true, saleId: 'sale-1' }],
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

    const checkbox = screen.getByRole('checkbox', { name: /select order 12345/i })
    await user.click(checkbox)

    await user.click(screen.getByRole('button', { name: /import selected/i }))

    await waitFor(() => {
      expect(mockImportOrdersBulk).toHaveBeenCalledWith({
        orders: [{ receiptId: 12345, postageCost: 5 }],
        isHistorical: false,
      })
      expect(mockOnImportComplete).toHaveBeenCalled()
    })
  })

  it('supports substituting lots when stock is insufficient', async () => {
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

    mockImportOrder
      .mockRejectedValueOnce(
        new ApiError('Insufficient stock', 400, {
          code: 'insufficient_stock',
          message: 'Insufficient stock → Category A: need 2, have 1',
          shortages: [
            {
              key: 'cat-a-all',
              categoryId: 'cat-a',
              categoryName: 'Category A',
              variantId: null,
              pickRule: 'FIFO',
              need: 2,
              have: 1,
              missing: 1,
            },
          ],
        })
      )
      .mockResolvedValueOnce({
        success: true,
        sale: { id: 'sale-1', etsyOrderId: '12345', totalCost: 0, margin: 0, lines: 1 },
      })

    mockLotsByCategory.mockResolvedValue([
      {
        id: 'lot-1',
        productId: 'prod-1',
        quantity: 10,
        remaining: 10,
        unitCost: 1.25,
        receivedAt: '2024-01-01T00:00:00Z',
        expiresAt: null,
        productName: 'Alternative Product',
      },
    ])

    render(
      <EtsyOrdersSyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
    )

    await waitFor(() => {
      expect(screen.getByText('Order #12345')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /import as sale/i }))

    await waitFor(() => {
      expect(screen.getByText('Insufficient stock for order #12345')).toBeInTheDocument()
    })

    const importWithSubs = screen.getByRole('button', { name: /import with substitutions/i })
    expect(importWithSubs).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /substitute/i }))

    const editorTitle = await screen.findByText('Select lots for Category A')
    const editorRoot = editorTitle.closest('div')?.parentElement
    expect(editorRoot).toBeTruthy()

    const qtyInput = (editorRoot as HTMLElement).querySelector('input[type="number"][placeholder="0"]') as HTMLInputElement
    expect(qtyInput).toBeTruthy()

    await user.clear(qtyInput)
    await user.type(qtyInput, '2')
    await user.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /import with substitutions/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /import with substitutions/i }))

    await waitFor(() => {
      expect(mockImportOrder).toHaveBeenNthCalledWith(2, {
        receiptId: 12345,
        postageCost: 5,
        isHistorical: false,
        allocationOverrides: {
          'cat-a-all': [{ lotId: 'lot-1', quantity: 2 }],
        },
      })
      expect(mockOnImportComplete).toHaveBeenCalled()
    })
  })

  it('requires substitutions for all shortages before enabling import', async () => {
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

    mockImportOrder.mockRejectedValueOnce(
      new ApiError('Insufficient stock', 400, {
        code: 'insufficient_stock',
        message: 'Insufficient stock',
        shortages: [
          {
            key: 'cat-a-all',
            categoryId: 'cat-a',
            categoryName: 'Category A',
            variantId: null,
            pickRule: 'FIFO',
            need: 2,
            have: 0,
            missing: 2,
          },
          {
            key: 'cat-b-all',
            categoryId: 'cat-b',
            categoryName: 'Category B',
            variantId: null,
            pickRule: 'FIFO',
            need: 1,
            have: 0,
            missing: 1,
          },
        ],
      })
    )

    mockLotsByCategory.mockImplementation(async (categoryId: string) => {
      if (categoryId === 'cat-a') {
        return [
          {
            id: 'lot-a',
            productId: 'prod-a',
            quantity: 10,
            remaining: 10,
            unitCost: 1,
            receivedAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            productName: 'Alt A',
          },
        ] as any
      }
      return [
        {
          id: 'lot-b',
          productId: 'prod-b',
          quantity: 10,
          remaining: 10,
          unitCost: 1,
          receivedAt: '2024-01-01T00:00:00Z',
          expiresAt: null,
          productName: 'Alt B',
        },
      ] as any
    })

    render(
      <EtsyOrdersSyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
    )

    await waitFor(() => {
      expect(screen.getByText('Order #12345')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /import as sale/i }))

    await waitFor(() => {
      expect(screen.getByText('Insufficient stock for order #12345')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /import with substitutions/i })).toBeDisabled()

    // Substitute category A only
    await user.click(screen.getAllByRole('button', { name: /substitute/i })[0]!)

    const editorTitleA = await screen.findByText('Select lots for Category A')
    const editorRootA = editorTitleA.closest('div')?.parentElement as HTMLElement
    const qtyInputA = editorRootA.querySelector('input[type="number"][placeholder="0"]') as HTMLInputElement
    await user.clear(qtyInputA)
    await user.type(qtyInputA, '2')
    await user.click(screen.getByRole('button', { name: /apply/i }))

    expect(screen.getByRole('button', { name: /import with substitutions/i })).toBeDisabled()

    // Substitute category B
    await user.click(screen.getAllByRole('button', { name: /substitute/i })[1]!)

    const editorTitleB = await screen.findByText('Select lots for Category B')
    const editorRootB = editorTitleB.closest('div')?.parentElement as HTMLElement
    const qtyInputB = editorRootB.querySelector('input[type="number"][placeholder="0"]') as HTMLInputElement
    await user.clear(qtyInputB)
    await user.type(qtyInputB, '1')
    await user.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /import with substitutions/i })).toBeEnabled()
    })
  })
})

