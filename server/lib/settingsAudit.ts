import { Prisma, SettingsAuditAction, SettingsAuditType } from '@prisma/client'

type AuditTx = Pick<Prisma.TransactionClient, 'settingsAuditLog'>

interface SettingsAuditInput {
  settingType: SettingsAuditType
  settingId: string
  action: SettingsAuditAction
  before: Prisma.InputJsonObject | null
  after: Prisma.InputJsonObject | null
}

const unsafeAuditKeyPattern = /(?:access|refresh)?token|secret|password|credential|authorization|api[-_]?key|private[-_]?key/i

function assertSafeSnapshot(value: unknown): void {
  if (value === null || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (const item of value) assertSafeSnapshot(item)
    return
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (unsafeAuditKeyPattern.test(key)) {
      throw new Error(`Unsafe settings audit snapshot key "${key}" is not allowed`)
    }
    assertSafeSnapshot(nestedValue)
  }
}

export function writeSettingsAudit(tx: AuditTx, entry: SettingsAuditInput) {
  assertSafeSnapshot(entry.before)
  assertSafeSnapshot(entry.after)

  return tx.settingsAuditLog.create({
    data: {
      ...entry,
      before: entry.before ?? Prisma.DbNull,
      after: entry.after ?? Prisma.DbNull,
    },
  })
}
