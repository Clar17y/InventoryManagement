import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'

vi.mock('../../lib/api', () => ({
  sales: {
    previewEtsyResolution: vi.fn(),
    applyEtsyResolution: vi.fn(),
  },
}))

vi.mock('../../lib/api/request', () => ({
  ApiError: class ApiError extends Error {
    status: number
    body: unknown

    constructor(message: string, status: number, body: unknown = null) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.body = body
    }
  },
}))

import EtsySaleResolutionModal from '../../features/sales/components/EtsySaleResolutionModal'
import { sales } from '../../lib/api'
import { ApiError } from '../../lib/api/request'
import type { Sale } from '../../lib/api'

const mockPreview = vi.mocked(sales.previewEtsyResolution)
const mockApply = vi.mocked(sales.applyEtsyResolution)

const sale: Sale = {
  id: 'sale-1',
  saleDate: '2024-01-15T10:00:00Z',
  saleChannel: 'etsy',
  etsyOrderId: '1',
  grossRevenue: 35,
  postageCharged: 5,
  postageCost: 3.5,
  etsyFees: 4.5,
  transactionFee: 2.28,
  postageTransactionFee: 0.33,
  regulatoryFee: 0.11,
  processingFee: 1.6,
  vatOnProcessingFee: 0.32,
  listingFee: 0.15,
  offsiteAdsAttributed: null,
  offsiteAdsFee: null,
  vatOnOffsiteAdsFee: null,
  etsyPaymentGross: null,
  etsyPaymentFees: null,
  etsyPaymentNet: null,
  etsyManualResolutionNote: null,
  etsyFeeReconciliationStatus: 'PENDING',
  etsyFeeReconciliationSource: null,
  etsyFeeReconciledAt: null,
  etsyStatementImportId: null,
  packagingOverhead: 1.5,
  netRevenue: 30.5,
  totalCost: 15,
  margin: 15.5,
  notes: null,
  isHistorical: false,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
  lines: [],
}

const fingerprint = 'a'.repeat(64)
const preview = {
  resolution: {
    type: 'manual_verify' as const,
    etsyOrderId: '123456',
    attributed: true,
    offsiteAdsFeePence: 480,
    vatOnOffsiteAdsFeePence: 96,
    note: 'Receipt checked',
  },
  baseReceiptId: '123456',
  saleIds: ['sale-1', 'sale-1-2'],
  fingerprint,
  summary: {
    oldFeesPence: 450,
    newFeesPence: 1026,
    feeDeltaPence: 576,
    oldNetRevenuePence: 3050,
    newNetRevenuePence: 2474,
    netRevenueDeltaPence: -576,
    oldMarginPence: 1550,
    newMarginPence: 974,
    marginDeltaPence: -576,
  },
  rows: [
    {
      saleId: 'sale-1',
      before: {
        saleChannel: 'etsy' as const,
        etsyOrderId: '123456',
        status: 'PENDING' as const,
        source: null,
        offsiteAdsAttributed: null,
        transactionFeePence: 228,
        postageTransactionFeePence: 33,
        regulatoryFeePence: 11,
        processingFeePence: 160,
        vatOnProcessingFeePence: 32,
        listingFeePence: 15,
        offsiteAdsFeePence: null,
        vatOnOffsiteAdsFeePence: null,
        etsyFeesPence: 450,
        netRevenuePence: 3050,
        marginPence: 1550,
      },
      after: {
        saleChannel: 'etsy' as const,
        etsyOrderId: '123456',
        status: 'MANUALLY_VERIFIED' as const,
        source: 'MANUAL' as const,
        offsiteAdsAttributed: true,
        transactionFeePence: 228,
        postageTransactionFeePence: 33,
        regulatoryFeePence: 11,
        processingFeePence: 160,
        vatOnProcessingFeePence: 32,
        listingFeePence: 15,
        offsiteAdsFeePence: 480,
        vatOnOffsiteAdsFeePence: 96,
        etsyFeesPence: 1026,
        netRevenuePence: 2474,
        marginPence: 974,
      },
    },
    {
      saleId: 'sale-1-2',
      before: {
        saleChannel: 'etsy' as const,
        etsyOrderId: '123456-2',
        status: 'PENDING' as const,
        source: null,
        offsiteAdsAttributed: null,
        transactionFeePence: 100,
        postageTransactionFeePence: 0,
        regulatoryFeePence: 0,
        processingFeePence: 0,
        vatOnProcessingFeePence: 0,
        listingFeePence: 0,
        offsiteAdsFeePence: null,
        vatOnOffsiteAdsFeePence: null,
        etsyFeesPence: 100,
        netRevenuePence: 900,
        marginPence: 800,
      },
      after: {
        saleChannel: 'etsy' as const,
        etsyOrderId: '123456-2',
        status: 'MANUALLY_VERIFIED' as const,
        source: 'MANUAL' as const,
        offsiteAdsAttributed: true,
        transactionFeePence: 100,
        postageTransactionFeePence: 0,
        regulatoryFeePence: 0,
        processingFeePence: 0,
        vatOnProcessingFeePence: 0,
        listingFeePence: 0,
        offsiteAdsFeePence: 0,
        vatOnOffsiteAdsFeePence: 0,
        etsyFeesPence: 100,
        netRevenuePence: 900,
        marginPence: 800,
      },
    },
  ],
  warnings: ['Existing Etsy evidence will be cleared', 'Two local Sales will be updated'],
}

function renderModal(overrides: Partial<ComponentProps<typeof EtsySaleResolutionModal>> = {}) {
  return render(
    <EtsySaleResolutionModal
      sale={sale}
      onClose={vi.fn()}
      onResolved={vi.fn()}
      {...overrides}
    />,
  )
}

describe('EtsySaleResolutionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreview.mockResolvedValue(preview)
    mockApply.mockResolvedValue({ ...preview, applied: true })
  })

  it('focuses the modal, traps keyboard focus, and restores the trigger focus on close', async () => {
    const user = userEvent.setup()
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.textContent = 'Open resolution'
    document.body.append(trigger)
    trigger.focus()

    const { unmount } = renderModal()

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' })))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))

    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('offers all three guarded resolution choices', () => {
    renderModal()

    expect(screen.getByRole('radio', { name: 'This was not an Etsy sale' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Correct the Etsy receipt ID' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Manually verify this Etsy sale' })).toBeInTheDocument()
  })

  it('hides the Etsy ID and explains fee cleanup for Direct/Fair reclassification', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('radio', { name: 'This was not an Etsy sale' }))
    expect(screen.queryByLabelText('Etsy receipt ID')).not.toBeInTheDocument()
    expect(screen.getByText(/Etsy fees will be removed on save/i)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Fair/Market' }))
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    await waitFor(() => expect(mockPreview).toHaveBeenCalledWith('sale-1', {
      resolution: { type: 'reclassify', channel: 'fair' },
    }))
  })

  it('validates a receipt ID in the client while leaving final authority to the server', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('radio', { name: 'Correct the Etsy receipt ID' }))

    const idInput = screen.getByLabelText('Etsy receipt ID')
    await user.clear(idInput)
    await user.type(idInput, '1')
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    expect(screen.getByText(/enter a valid Etsy receipt ID/i)).toBeInTheDocument()
    expect(mockPreview).not.toHaveBeenCalled()

    await user.clear(idInput)
    await user.type(idInput, '123456')
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    await waitFor(() => expect(mockPreview).toHaveBeenCalledWith('sale-1', {
      resolution: { type: 'correct_receipt_id', etsyOrderId: '123456' },
    }))
  })

  it('forces not-attributed fee and VAT inputs to zero and disables them', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('radio', { name: 'Manually verify this Etsy sale' }))
    const feeInput = screen.getByLabelText('Offsite Ads fee')
    const vatInput = screen.getByLabelText('VAT on Offsite Ads fee')

    expect(feeInput).toHaveValue('0.00')
    expect(vatInput).toHaveValue('0.00')
    expect(feeInput).toBeDisabled()
    expect(vatInput).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Attributed to Offsite Ads' }))
    expect(feeInput).toBeEnabled()
    expect(vatInput).toBeEnabled()
  })

  it('converts exact pounds to pence and rejects fractional pennies', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('radio', { name: 'Manually verify this Etsy sale' }))
    await user.click(screen.getByRole('radio', { name: 'Attributed to Offsite Ads' }))
    await user.clear(screen.getByLabelText('Etsy receipt ID'))
    await user.type(screen.getByLabelText('Etsy receipt ID'), '123456')
    await user.clear(screen.getByLabelText('Offsite Ads fee'))
    await user.type(screen.getByLabelText('Offsite Ads fee'), '4.80')
    await user.clear(screen.getByLabelText('VAT on Offsite Ads fee'))
    await user.type(screen.getByLabelText('VAT on Offsite Ads fee'), '0.96')
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    await waitFor(() => expect(mockPreview).toHaveBeenCalledWith('sale-1', {
      resolution: {
        type: 'manual_verify',
        etsyOrderId: '123456',
        attributed: true,
        offsiteAdsFeePence: 480,
        vatOnOffsiteAdsFeePence: 96,
      },
    }))

    await user.clear(screen.getByLabelText('Offsite Ads fee'))
    await user.type(screen.getByLabelText('Offsite Ads fee'), '4.801')
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    expect(screen.getByText(/whole pennies/i)).toBeInTheDocument()
    expect(mockPreview).toHaveBeenCalledTimes(1)
  })

  it('limits the optional manual note to 500 characters', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('radio', { name: 'Manually verify this Etsy sale' }))
    expect(screen.getByLabelText('Manual note')).toHaveAttribute('maxLength', '500')
  })

  it('clears an existing preview and disables Confirm after any input changes', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('radio', { name: 'Correct the Etsy receipt ID' }))
    const idInput = screen.getByLabelText('Etsy receipt ID')
    await user.clear(idInput)
    await user.type(idInput, '123456')
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    expect(await screen.findByText('Preview ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm resolution' })).toBeEnabled()

    await user.type(idInput, '7')
    expect(screen.queryByText('Preview ready')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm resolution' })).toBeDisabled()
  })

  it('renders server preview group count, warnings, summary deltas, and every row', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('radio', { name: 'Correct the Etsy receipt ID' }))
    const idInput = screen.getByLabelText('Etsy receipt ID')
    await user.clear(idInput)
    await user.type(idInput, '123456')
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))

    expect(await screen.findByText('2 affected local Sales')).toBeInTheDocument()
    expect(screen.getByText('Existing Etsy evidence will be cleared')).toBeInTheDocument()
    expect(screen.getByText(/Fee delta: \+£5\.76/)).toBeInTheDocument()
    expect(screen.getByText(/Net revenue delta: -£5\.76/)).toBeInTheDocument()
    expect(screen.getByText('sale-1')).toBeInTheDocument()
    expect(screen.getByText('sale-1-2')).toBeInTheDocument()
  })

  it('confirms with the same normalized resolution and fingerprint', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('radio', { name: 'Correct the Etsy receipt ID' }))
    const idInput = screen.getByLabelText('Etsy receipt ID')
    await user.clear(idInput)
    await user.type(idInput, '123456')
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    await screen.findByText('Preview ready')
    await user.click(screen.getByRole('button', { name: 'Confirm resolution' }))

    await waitFor(() => expect(mockApply).toHaveBeenCalledWith('sale-1', {
      resolution: { type: 'correct_receipt_id', etsyOrderId: '123456' },
      fingerprint,
    }))
  })

  it('retains inputs after 400, clears preview but retains inputs after 409, and resolves before closing', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onResolved = vi.fn().mockResolvedValue(undefined)
    renderModal({ onClose, onResolved })
    await user.click(screen.getByRole('radio', { name: 'Correct the Etsy receipt ID' }))
    const idInput = screen.getByLabelText('Etsy receipt ID')
    await user.clear(idInput)
    await user.type(idInput, '123456')

    mockPreview.mockRejectedValueOnce(new ApiError('Invalid resolution', 400, null))
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid resolution'))
    expect(idInput).toHaveValue('123456')

    mockPreview.mockResolvedValueOnce(preview)
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    await screen.findByText('Preview ready')
    mockApply.mockRejectedValueOnce(new ApiError('Preview is stale', 409, null))
    await user.click(screen.getByRole('button', { name: 'Confirm resolution' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Preview is stale'))
    expect(screen.queryByText('Preview ready')).not.toBeInTheDocument()
    expect(idInput).toHaveValue('123456')

    mockPreview.mockResolvedValueOnce(preview)
    await user.click(screen.getByRole('button', { name: 'Preview resolution' }))
    await screen.findByText('Preview ready')
    mockApply.mockImplementationOnce(async () => {
      expect(onClose).not.toHaveBeenCalled()
      return { ...preview, applied: true }
    })
    await user.click(screen.getByRole('button', { name: 'Confirm resolution' }))
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('prevents double preview and apply while each request is loading', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('radio', { name: 'Correct the Etsy receipt ID' }))
    const idInput = screen.getByLabelText('Etsy receipt ID')
    await user.clear(idInput)
    await user.type(idInput, '123456')

    let resolvePreview!: (value: typeof preview) => void
    mockPreview.mockReturnValueOnce(new Promise((resolve) => { resolvePreview = resolve }))
    const previewButton = screen.getByRole('button', { name: 'Preview resolution' })
    await user.click(previewButton)
    await user.click(previewButton)
    expect(mockPreview).toHaveBeenCalledTimes(1)
    expect(previewButton).toBeDisabled()
    await act(async () => { resolvePreview(preview) })
    await screen.findByText('Preview ready')

    let resolveApply!: (value: typeof preview & { applied: boolean }) => void
    mockApply.mockReturnValueOnce(new Promise((resolve) => { resolveApply = resolve }))
    const confirmButton = screen.getByRole('button', { name: 'Confirm resolution' })
    await user.click(confirmButton)
    await user.click(confirmButton)
    expect(mockApply).toHaveBeenCalledTimes(1)
    expect(confirmButton).toBeDisabled()
    await act(async () => { resolveApply({ ...preview, applied: true }) })
  })
})
