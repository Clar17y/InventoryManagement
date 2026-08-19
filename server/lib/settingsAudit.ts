import { Prisma, SettingsAuditAction, SettingsAuditType } from '@prisma/client'

type AuditTx = Pick<Prisma.TransactionClient, 'settingsAuditLog'>

interface SettingsAuditInput {
  settingType: SettingsAuditType
  settingId: string
  action: SettingsAuditAction
  before: Prisma.InputJsonObject | null
  after: Prisma.InputJsonObject | null
}

export function writeSettingsAudit(tx: AuditTx, entry: SettingsAuditInput) {
  return tx.settingsAuditLog.create({
    data: {
      ...entry,
      before: entry.before ?? Prisma.DbNull,
      after: entry.after ?? Prisma.DbNull,
    },
  })
}
