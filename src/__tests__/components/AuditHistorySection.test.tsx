import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils/test-utils'
import AuditHistorySection from '../../features/settings/components/AuditHistorySection'

const restoreEntry = {
  id: 'clw5k3q2m0000abcde1234567',
  settingType: 'POSTAGE_TIER',
  settingId: 'clw5k3q2m0001abcde1234567',
  action: 'RESTORE',
  before: { etsyCharge: '3.65', actualCost: '3.25', label: 'Tracked' },
  after: { etsyCharge: '3.65', actualCost: '3.65', label: 'Tracked' },
  createdAt: '2026-08-19T12:00:00.000Z',
}

const olderEntry = {
  id: 'clw5k3q2m0002abcde1234567',
  settingType: 'SUPPLIER',
  settingId: 'clw5k3q2m0003abcde1234567',
  action: 'UPDATE',
  before: { name: 'Old shop' },
  after: { name: 'New shop' },
  createdAt: '2026-08-18T12:00:00.000Z',
}

const packagingEntry = {
  id: 'clw5k3q2m0004abcde1234567',
  settingType: 'PACKAGING_OVERHEAD',
  settingId: 'clw5k3q2m0005abcde1234567',
  action: 'CREATE',
  before: null,
  after: { name: 'Gift box', costPerOrder: '1.50' },
  createdAt: '2026-08-17T12:00:00.000Z',
}

const etsyFeeEntry = {
  id: 'clw5k3q2m0006abcde1234567',
  settingType: 'ETSY_FEE_CONFIG',
  settingId: 'clw5k3q2m0007abcde1234567',
  action: 'ARCHIVE',
  before: { name: 'UK Etsy Fees' },
  after: null,
  createdAt: '2026-08-16T12:00:00.000Z',
}

describe('AuditHistorySection', () => {
  it('renders newest-first entries with readable type and action labels', () => {
    render(<AuditHistorySection entries={[restoreEntry as any, packagingEntry as any, olderEntry as any, etsyFeeEntry as any]} />)

    expect(screen.getByText('Audit History')).toBeInTheDocument()
    expect(screen.getByText('Postage tier restored')).toBeInTheDocument()
    expect(screen.getByText('Packaging overhead created')).toBeInTheDocument()
    expect(screen.getByText('Supplier updated')).toBeInTheDocument()
    expect(screen.getByText('Etsy fee configuration archived')).toBeInTheDocument()

    const rows = screen.getAllByTestId('audit-entry')
    expect(within(rows[0]!).getByText('Postage tier restored')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Packaging overhead created')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Supplier updated')).toBeInTheDocument()
    expect(within(rows[3]!).getByText('Etsy fee configuration archived')).toBeInTheDocument()
  })

  it('keeps snapshots collapsed and expands before and after values on request', async () => {
    const user = userEvent.setup()
    render(<AuditHistorySection entries={[restoreEntry as any]} />)

    expect(screen.queryByText(/"actualCost": "3\.65"/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show change details' }))

    expect(screen.getByText(/"actualCost": "3\.65"/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide change details' })).toBeInTheDocument()
  })

  it('renders null snapshots clearly and does not expose sensitive keys', async () => {
    const user = userEvent.setup()
    const entry = {
      ...olderEntry,
      before: null,
      after: {
        name: 'Shop',
        apiKey: 'do-not-show',
        authorization: 'Bearer do-not-show',
        accessToken: 'do-not-show',
        clientSecret: 'do-not-show',
        unknownOperationalKey: 'do-not-show',
      },
    }
    render(<AuditHistorySection entries={[entry as any]} />)

    await user.click(screen.getByRole('button', { name: 'Show change details' }))

    expect(screen.getByText('No previous value recorded')).toBeInTheDocument()
    expect(screen.getByText(/"name": "Shop"/)).toBeInTheDocument()
    expect(screen.queryByText(/apiKey|authorization|accessToken|clientSecret|unknownOperationalKey|do-not-show/)).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no audit entries', () => {
    render(<AuditHistorySection entries={[]} />)

    expect(screen.getByText('No setting changes recorded yet.')).toBeInTheDocument()
  })
})
