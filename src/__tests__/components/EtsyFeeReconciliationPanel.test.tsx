import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
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

const observeOnlyReceiptIds = Array.from({ length: 25 }, (_, index) => String(4137418052 + index))
const observeOnlyPaymentPreview = {
  ...paymentPreview,
  receiptIds: observeOnlyReceiptIds,
  summary: {
    ...paymentPreview.summary,
    matched: observeOnlyReceiptIds.length,
  },
  failures: observeOnlyReceiptIds.map((receiptId) => ({
    receiptId,
    status: 'PENDING' as const,
    message: 'No Payment aggregate returned',
  })),
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

const statementPreviewWithoutRevision = {
  ...statementPreview,
  changes: statementPreview.changes.map((change) => ({
    ...change,
    oldStatus: null,
  })),
} as unknown as typeof statementPreview

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
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

  it('instructs operators to upload the original Etsy CSV as downloaded', () => {
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    expect(screen.getByText(/Upload the original Etsy statement CSV as downloaded\. Do not resave or sanitize it\./i)).toBeInTheDocument()
  })

  it('clarifies observe-only Payment results and hides canonical apply', async () => {
    const user = userEvent.setup()
    mockPreviewPayment.mockResolvedValueOnce(observeOnlyPaymentPreview)
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    expect(await screen.findByText('2,411 Etsy sales need statement verification')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))

    await waitFor(() => {
      expect(mockPreviewPayment).toHaveBeenCalledWith({ limit: 25 })
      expect(screen.getByText('Local receipts 25')).toBeInTheDocument()
      expect(screen.getByText('Validated aggregates 0')).toBeInTheDocument()
      expect(screen.getByText('Payment totals cannot verify Offsite Ads attribution.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Apply payment fee changes' })).not.toBeInTheDocument()
    })
  })

  it('shows Payment apply only for an enabled gate and a current preview fingerprint', async () => {
    const user = userEvent.setup()
    mockPreviewPayment.mockResolvedValueOnce({ ...paymentPreview, canApplyCanonicalFees: true })
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))

    const applyButton = await screen.findByRole('button', { name: 'Apply payment fee changes' })
    expect(applyButton).toBeEnabled()

    await user.click(applyButton)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Apply payment fee changes' })).not.toBeInTheDocument()
    })
  })

  it('clears a stale Payment preview and requires re-preview', async () => {
    const user = userEvent.setup()
    mockPreviewPayment.mockResolvedValueOnce({ ...paymentPreview, canApplyCanonicalFees: true })
    mockApplyPayment.mockRejectedValueOnce(new ApiError('Preview is stale', 409, null))
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))
    await user.click(await screen.findByRole('button', { name: 'Apply payment fee changes' }))

    await waitFor(() => {
      expect(screen.getByText('Preview is stale')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Apply payment fee changes' })).not.toBeInTheDocument()
    })
  })

  it('keeps Payment and statement actions loading independently', async () => {
    const user = userEvent.setup()
    const paymentRequest = deferred<typeof paymentPreview>()
    const statementRequest = deferred<typeof statementPreview>()
    mockPreviewPayment.mockReturnValueOnce(paymentRequest.promise)
    mockPreviewStatement.mockReturnValueOnce(statementRequest.promise)
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    const monthInput = screen.getByLabelText('Statement month')
    const fileInput = screen.getByLabelText('Statement CSV file')
    await user.type(monthInput, '2025-07')
    await user.upload(fileInput, new File(['sanitized,csv'], 'statement.csv', { type: 'text/csv' }))

    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))

    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previewing…' })).toBeDisabled()

    statementRequest.resolve(statementPreviewWithoutRevision)
    await waitFor(() => expect(screen.getByText('Matched 2')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()

    paymentRequest.resolve({ ...paymentPreview, canApplyCanonicalFees: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply payment fee changes' })).toBeEnabled())
  })

  it('keeps Payment and statement errors visible independently', async () => {
    const user = userEvent.setup()
    mockPreviewPayment.mockRejectedValueOnce(new Error('Payment check failed'))
    mockPreviewStatement.mockRejectedValueOnce(new Error('Statement preview failed'))
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    const monthInput = screen.getByLabelText('Statement month')
    const fileInput = screen.getByLabelText('Statement CSV file')
    await user.type(monthInput, '2025-07')
    await user.upload(fileInput, new File(['sanitized,csv'], 'statement.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))

    await waitFor(() => {
      expect(screen.getByText('Payment check failed')).toBeInTheDocument()
      expect(screen.getByText('Statement preview failed')).toBeInTheDocument()
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

  it('clears a stale statement preview and disables apply after a 409', async () => {
    const user = userEvent.setup()
    mockPreviewStatement.mockResolvedValueOnce(statementPreviewWithoutRevision)
    mockApplyStatement.mockRejectedValueOnce(new ApiError('Statement preview is stale', 409, null))
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    await user.type(screen.getByLabelText('Statement month'), '2025-07')
    await user.upload(screen.getByLabelText('Statement CSV file'), new File(['sanitized,csv'], 'statement.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply statement changes' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Apply statement changes' }))

    await waitFor(() => {
      expect(screen.getByText('Statement preview is stale')).toBeInTheDocument()
      expect(screen.queryByText('Matched 2')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Apply statement changes' })).toBeDisabled()
    })
  })

  it('invalidates an in-flight statement preview when the selected file changes', async () => {
    const user = userEvent.setup()
    const statementRequest = deferred<typeof statementPreview>()
    mockPreviewStatement.mockReturnValueOnce(statementRequest.promise)
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    const monthInput = screen.getByLabelText('Statement month')
    const fileInput = screen.getByLabelText('Statement CSV file')
    await user.type(monthInput, '2025-07')
    await user.upload(fileInput, new File(['first'], 'first.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))
    await user.upload(fileInput, new File(['second'], 'second.csv', { type: 'text/csv' }))

    statementRequest.resolve(statementPreviewWithoutRevision)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview statement' })).toBeEnabled())
    expect(screen.queryByText('Matched 2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply statement changes' })).toBeDisabled()
  })

  it('invalidates an in-flight statement preview when the selected month changes', async () => {
    const user = userEvent.setup()
    const statementRequest = deferred<typeof statementPreview>()
    mockPreviewStatement.mockReturnValueOnce(statementRequest.promise)
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    const monthInput = screen.getByLabelText('Statement month')
    const fileInput = screen.getByLabelText('Statement CSV file')
    await user.type(monthInput, '2025-07')
    await user.upload(fileInput, new File(['sanitized,csv'], 'statement.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))
    await user.clear(monthInput)
    await user.type(monthInput, '2025-08')

    statementRequest.resolve(statementPreviewWithoutRevision)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview statement' })).toBeEnabled())
    expect(screen.queryByText('Matched 2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply statement changes' })).toBeDisabled()
  })

  it('shows duplicate statement applies as a no-write outcome', async () => {
    const user = userEvent.setup()
    mockPreviewStatement.mockResolvedValueOnce(statementPreviewWithoutRevision)
    mockApplyStatement.mockResolvedValueOnce({
      ...statementPreviewWithoutRevision,
      applied: false,
      duplicate: true,
      statementImportId: 'import-1',
    })
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    await user.type(screen.getByLabelText('Statement month'), '2025-07')
    await user.upload(screen.getByLabelText('Statement CSV file'), new File(['sanitized,csv'], 'statement.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply statement changes' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Apply statement changes' }))

    await waitFor(() => expect(screen.getByText('This statement was already applied; no writes were made.')).toBeInTheDocument())
  })

  it('keeps summary refresh disabled until concurrent applies finish reloading status', async () => {
    const user = userEvent.setup()
    const firstReload = deferred<typeof summary>()
    const secondReload = deferred<typeof summary>()
    mockSummary
      .mockResolvedValueOnce(summary)
      .mockReturnValueOnce(firstReload.promise)
      .mockReturnValueOnce(secondReload.promise)
    mockPreviewPayment.mockResolvedValueOnce({ ...paymentPreview, canApplyCanonicalFees: true })
    mockPreviewStatement.mockResolvedValueOnce(statementPreviewWithoutRevision)
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    await screen.findByText('2,411 Etsy sales need statement verification')
    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply payment fee changes' })).toBeEnabled())

    await user.type(screen.getByLabelText('Statement month'), '2025-07')
    await user.upload(screen.getByLabelText('Statement CSV file'), new File(['sanitized,csv'], 'statement.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply statement changes' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Apply payment fee changes' }))
    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Apply statement changes' }))
    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(3))

    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    expect(refreshButton).toBeDisabled()

    await act(async () => {
      firstReload.resolve(summary)
      await Promise.resolve()
    })
    await waitFor(() => expect(refreshButton).toBeDisabled())

    await act(async () => {
      secondReload.resolve(summary)
      await Promise.resolve()
    })
    await waitFor(() => expect(refreshButton).toBeEnabled())
  })

  it('ignores an older summary failure after a newer reload succeeds', async () => {
    const user = userEvent.setup()
    const olderFailure = deferred<typeof summary>()
    const newerSuccess = deferred<typeof summary>()
    const newerSummary = {
      ...summary,
      counts: {
        ...summary.counts,
        PENDING: 7,
      },
    }
    mockSummary
      .mockResolvedValueOnce(summary)
      .mockReturnValueOnce(olderFailure.promise)
      .mockReturnValueOnce(newerSuccess.promise)
    mockPreviewPayment.mockResolvedValueOnce({ ...paymentPreview, canApplyCanonicalFees: true })
    mockPreviewStatement.mockResolvedValueOnce(statementPreviewWithoutRevision)
    render(<EtsyFeeReconciliationPanel onImportComplete={vi.fn()} />)

    await screen.findByText('2,411 Etsy sales need statement verification')
    await user.click(screen.getByRole('button', { name: 'Check payment fees' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply payment fee changes' })).toBeEnabled())

    await user.type(screen.getByLabelText('Statement month'), '2025-07')
    await user.upload(screen.getByLabelText('Statement CSV file'), new File(['sanitized,csv'], 'statement.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Preview statement' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply statement changes' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Apply payment fee changes' }))
    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Apply statement changes' }))
    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(3))

    await act(async () => {
      newerSuccess.resolve(newerSummary)
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByText('7 Etsy sales need statement verification')).toBeInTheDocument())

    await act(async () => {
      olderFailure.reject(new Error('stale summary failure'))
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.queryByText('stale summary failure')).not.toBeInTheDocument())
  })
})
