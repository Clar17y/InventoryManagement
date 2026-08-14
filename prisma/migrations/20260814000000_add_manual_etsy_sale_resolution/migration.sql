ALTER TYPE "EtsyFeeReconciliationStatus" ADD VALUE 'MANUALLY_VERIFIED';
ALTER TYPE "EtsyFeeReconciliationSource" ADD VALUE 'MANUAL';
ALTER TABLE "Sale" ADD COLUMN "etsyManualResolutionNote" TEXT;
