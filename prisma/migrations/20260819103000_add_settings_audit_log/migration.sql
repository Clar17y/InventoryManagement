-- CreateEnum
CREATE TYPE "SettingsAuditType" AS ENUM ('POSTAGE_TIER', 'PACKAGING_OVERHEAD', 'SUPPLIER', 'ETSY_FEE_CONFIG');

-- CreateEnum
CREATE TYPE "SettingsAuditAction" AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE');

-- CreateTable
CREATE TABLE "SettingsAuditLog" (
    "id" TEXT NOT NULL,
    "settingType" "SettingsAuditType" NOT NULL,
    "settingId" TEXT NOT NULL,
    "action" "SettingsAuditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingsAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettingsAuditLog_createdAt_idx" ON "SettingsAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SettingsAuditLog_settingType_createdAt_idx" ON "SettingsAuditLog"("settingType", "createdAt");
