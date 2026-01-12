-- Sync migration: etsyProductId column already exists in database
-- This migration just records it in the migration history
-- AlterTable (already applied manually/via direct db access)
ALTER TABLE "HamperVariant" ADD COLUMN IF NOT EXISTS "etsyProductId" TEXT;

-- CreateIndex (already exists)
CREATE UNIQUE INDEX IF NOT EXISTS "HamperVariant_etsyProductId_key" ON "HamperVariant"("etsyProductId");
