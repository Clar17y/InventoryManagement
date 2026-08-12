import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'

vi.mock('../../lib/api', () => ({
  etsy: {
    getFeeReconciliationSummary: vi.fn(),
    previewPaymentFees: vi.fn(),
    applyPaymentFees: vi.fn(),
    previewStatementFees: vi.fn(),
    applyStatementFees: vi.fn(),
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

import EtsyFeeReconciliationPanel from '../../features/etsy/components/EtsyFeeReconciliationPanel'
import { etsy } from '../../lib/api'
import { ApiError } from '../../lib/api/request'

const mockSummary = vi.mocked(etsy.getFeeReconciliationSummary)
const mockPreviewPayment = vi.mocked(etsy.previewPaymentFees)
const mockApplyPayment = vi.mocked(etsy.applyPaymentFees)
const mockPreviewStatement = vi.mocked(etsy.previewStatementFees)
const mockApplyStatement = vi.mocked(etsy.applyStatementFees)

const fingerprint = 'a'.repeat(64)
const summary = {
  counts: {
    NOT_APPLICABLE: 0,
    PENDING: 2411,
    PAYMENT_SYNCED: 0,
    STATEMENT_VERIFIED: 5,
    MANUAL_REVIEW: 0,
  },
}

const paymentPreview = {
  fingerprint,
  statementChecksum: null,
  receiptIds: ['4137418052'],
  summary: {
    matched: 1,
    changed: 1,
    unchanged: 0,
    unmatched: 0,
    manualReview: 0,
    attributed: 1,
    notAttributed: 0,
    oldFees: 4,
    newFees: 4.5,
    marginDelta: -0.5,
  },
  changes: [],
  canApplyCanonicalFees: false,
  failures: [],
}

const statementPreview = {
  fingerprint,
  statementChecksum: 'b'.repeat(64),
  receiptIds: ['4137418052', '999'],
  summary: {
    matched: 2,
    changed: 1,
    unchanged: 1,
    unmatched: 1,
    manualReview: 1,
    attributed: 1,
    notAttributed: 1,
    oldFees: 4,
    newFees: 4.5,
    marginDelta: -0.5,
  },
  changes: [
    {
      receiptId: '999',
      saleIds: [],
      oldStatus: 'STATEMENT_VERIFIED' as const,
      newStatus: 'MANUAL_REVIEW' as const,
      attributed: null,
      oldFees: null,
      newFees: null,
      feeDelta: 0,
      oldNetRevenue: null,
      newNetRevenue: null,
      marginDelta: 0,
      offsiteAdsFee: null,
      vatOnOffsiteAdsFee: null,
      source: 'ETSY_STATEMENT' as const,
      outcome: 'manual_review' as const,
      message: 'Needs manual review',
      allocations: [],
    },
  ],
}

describe('EtsyFeeReconciliationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSummary.mockResolvedValue(summary)
    mockPreviewPayment.mockResolvedValue(paymentPreview)
    mockApplyPayment.mockResolvedValue({ ...paymentPreview, applied: true, duplicate: false, statementImportId: null })
    mockPreviewStatement.mockResolvedValue(statementPreview)
    mockApplyStatement.mockResolvedValue({ ...statementPreview, applied: true, duplicate: false, statementImportId: 'import-1' })
  })

  it('shows pending statement count and keeps apply disabled until a Payment preview exists', async () => {
    const user = userEvent.setup()
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    expect(await screen.findByText('2,411 Etsy sales need statement verification')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply payment fee changes' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))

    await waitFor(() => {
      expect(mockPreviewPayment).toHaveBeenCalledWith({ limit: 25 })
      expect(screen.getByRole('button', { name: 'Apply payment fee changes' })).toBeEnabled()
    })
  })

  it('clears a stale Payment preview and requires re-preview', async () => {
    const user = userEvent.setup()
    mockApplyPayment.mockRejectedValueOnce(new ApiError('Preview is stale', 409, null))
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))
    await user.click(await screen.findByRole('button', { name: 'Apply payment fee changes' }))

    await waitFor(() => {
      expect(screen.getByText('Preview is stale')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Apply payment fee changes' })).toBeDisabled()
    })
  })

  it('explains that observe-only Payment results do not change profit', async () => {
    const user = userEvent.setup()
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))

    expect(await screen.findByText(/observe-only/i)).toBeInTheDocument()
    expect(screen.getByText(/profit was not changed/i)).toBeInTheDocument()
  })

  it('previews and applies a statement using the selected file, month, fingerprint, and revision confirmation', async () => {
    const user = userEvent.setup()
    const onImportComplete = vi.fn()
    render(<EtsyFeeReconciliationPanel onImportComplete={onImportComplete} />)

    const file = new File(['sanitized,csv'], 'statement.csv', { type: 'text/csv' })
    await user.type(screen.getByLabelText('Statement month'), '2025-07')
    await user.upload(screen.getByLabelText('Statement CSV file'), file)
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))

    await waitFor(() => {
      expect(mockPreviewStatement).toHaveBeenCalledWith({
        statementMonth: '2025-07',
        fileName: 'statement.csv',
        csv: 'sanitized,csv',
      })
    })

    expect(screen.getByText(/Matched 2/)).toBeInTheDocument()
    expect(screen.getByText(/Unmatched 1/)).toBeInTheDocument()
    expect(screen.getByText(/Manual review 1/)).toBeInTheDocument()
    expect(screen.getByText(/Margin delta: -£0.50/)).toBeInTheDocument()

    expect(screen.getByRole('checkbox', { name: /confirm statement revision/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply statement changes' })).toBeDisabled()
    expect(mockApplyStatement).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox', { name: /confirm statement revision/i }))
    await user.click(screen.getByRole('button', { name: 'Apply statement changes' }))

    await waitFor(() => {
      expect(mockApplyStatement).toHaveBeenCalledWith({
        statementMonth: '2025-07',
        fileName: 'statement.csv',
        csv: 'sanitized,csv',
        fingerprint,
        allowStatementRevision: true,
      })
      expect(onImportComplete).toHaveBeenCalled()
    })
  })
})
