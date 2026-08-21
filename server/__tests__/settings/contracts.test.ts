import { describe, expect, it } from 'vitest'
import {
  etsyFeeCreateBodySchema,
  includeArchivedQuerySchema,
  packagingOverheadCreateBodySchema,
  postageTierCreateBodySchema,
  postageTierUpdateBodySchema,
  postageTierMutationResponseSchema,
  settingsAuditEntriesResponseSchema,
} from '#contracts/routes/settings'
import {
  supplierCreateBodySchema,
  supplierMutationResponseSchema,
} from '#contracts/routes/suppliers'

describe('editable settings contracts', () => {
  it('accepts only an explicit true archived-list query', () => {
    expect(includeArchivedQuerySchema.parse({ includeArchived: 'true' })).toEqual({ includeArchived: true })
    expect(includeArchivedQuerySchema.parse({})).toEqual({ includeArchived: false })
  })

  it('trims names and labels and rejects negative money', () => {
    expect(postageTierCreateBodySchema.parse({ etsyCharge: 5, actualCost: 3.65, label: '  Tracked  ' })).toEqual({
      etsyCharge: 5,
      actualCost: 3.65,
      label: 'Tracked',
    })
    expect(postageTierCreateBodySchema.safeParse({ etsyCharge: -1, actualCost: 3.65 }).success).toBe(false)
    expect(postageTierUpdateBodySchema.parse({ label: null })).toEqual({ label: null })
    expect(supplierCreateBodySchema.parse({ name: '  Home Bargains  ' })).toEqual({ name: 'Home Bargains' })
  })

  it('enforces Decimal(10,2) bounds and scale for postage money', () => {
    expect(postageTierCreateBodySchema.safeParse({ etsyCharge: 99_999_999.99, actualCost: 0 }).success).toBe(true)
    expect(postageTierCreateBodySchema.safeParse({ etsyCharge: 100_000_000, actualCost: 0 }).success).toBe(false)
    expect(postageTierCreateBodySchema.safeParse({ etsyCharge: 1.23, actualCost: 0 }).success).toBe(true)
    expect(postageTierCreateBodySchema.safeParse({ etsyCharge: 1.234, actualCost: 0 }).success).toBe(false)
  })

  it('enforces Decimal(10,4) bounds and scale for packaging money', () => {
    expect(packagingOverheadCreateBodySchema.safeParse({ name: 'Box', costPerOrder: 999_999.9999 }).success).toBe(true)
    expect(packagingOverheadCreateBodySchema.safeParse({ name: 'Box', costPerOrder: 1_000_000 }).success).toBe(false)
    expect(packagingOverheadCreateBodySchema.safeParse({ name: 'Box', costPerOrder: 1.1234 }).success).toBe(true)
    expect(packagingOverheadCreateBodySchema.safeParse({ name: 'Box', costPerOrder: 1.12345 }).success).toBe(false)
  })

  it('enforces the fee-rate maximum and four decimal places', () => {
    const fee = { name: 'Fees', transactionFee: 1, regulatoryFee: 0.1234, paymentFeePercent: 0.04, paymentFeeFixed: 0.2, vatRate: 0.2, listingFee: 0.15 }
    expect(etsyFeeCreateBodySchema.safeParse(fee).success).toBe(true)
    expect(etsyFeeCreateBodySchema.safeParse({ ...fee, regulatoryFee: 0.12345 }).success).toBe(false)
    expect(etsyFeeCreateBodySchema.safeParse({ ...fee, transactionFee: 1.0001 }).success).toBe(false)
  })

  it('parses mutation outcomes and nullable audit snapshots', () => {
    expect(postageTierMutationResponseSchema.parse({
      item: {
        id: 'clx0q2p1w0000s1l1n4m9n9n9', etsyCharge: '5.00', actualCost: '3.65',
        label: null, isActive: true, createdAt: '2026-08-19T09:00:00.000Z',
      },
      outcome: 'restored',
    }).outcome).toBe('restored')
    expect(supplierMutationResponseSchema.parse({
      item: {
        id: 'clx0q2p1w0000s1l1n4m9n9n9', name: 'Home Bargains', isActive: true,
        createdAt: '2026-08-19T09:00:00.000Z', updatedAt: '2026-08-19T09:00:00.000Z',
      },
      outcome: 'existing',
    }).outcome).toBe('existing')
    expect(settingsAuditEntriesResponseSchema.parse([{
      id: 'clx0q2p1w0000s1l1n4m9n9n9', settingType: 'POSTAGE_TIER', settingId: 'tier-1',
      action: 'RESTORE', before: { isActive: false }, after: { isActive: true },
      createdAt: '2026-08-19T09:00:00.000Z',
    }])).toHaveLength(1)
  })
})
