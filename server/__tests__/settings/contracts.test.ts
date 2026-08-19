import { describe, expect, it } from 'vitest'
import {
  includeArchivedQuerySchema,
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
