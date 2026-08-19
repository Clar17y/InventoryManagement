import { Prisma, SettingsAuditAction, SettingsAuditType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeSettingsAudit } from '../../lib/settingsAudit'

const create = vi.fn().mockResolvedValue({ id: 'audit-1' })
const tx = {
  settingsAuditLog: { create },
} as unknown as Pick<Prisma.TransactionClient, 'settingsAuditLog'>

const entry = {
  settingType: SettingsAuditType.POSTAGE_TIER,
  settingId: 'tier-1',
  action: SettingsAuditAction.UPDATE,
  before: null,
  after: { etsyCharge: '5.00', actualCost: '3.65', label: 'Tracked', isActive: true },
}

describe('writeSettingsAudit', () => {
  beforeEach(() => {
    create.mockClear()
  })

  it('rejects credential-bearing snapshots before Prisma create', () => {
    expect(() => writeSettingsAudit(tx, {
      ...entry,
      before: { isActive: false, accessToken: 'secret-token' },
    })).toThrowError('Unsafe settings audit snapshot key "accessToken" is not allowed')

    expect(create).not.toHaveBeenCalled()
  })

  it('passes safe snapshots through and maps null snapshots to Prisma.DbNull', async () => {
    await writeSettingsAudit(tx, entry)

    expect(create).toHaveBeenCalledWith({
      data: {
        ...entry,
        before: Prisma.DbNull,
      },
    })
  })
})
