-- CreateEnum
CREATE TYPE "EtsyFeeReconciliationStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PAYMENT_SYNCED', 'STATEMENT_VERIFIED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "EtsyFeeReconciliationSource" AS ENUM ('ETSY_PAYMENT_API', 'ETSY_STATEMENT');

-- CreateTable
CREATE TABLE "EtsyStatementImport" (
    "id" TEXT NOT NULL,
    "statementMonth" DATE NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "matched" INTEGER NOT NULL,
    "changed" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "unmatched" INTEGER NOT NULL,
    "manualReview" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EtsyStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EtsyStatementImport_checksum_key" ON "EtsyStatementImport"("checksum");

-- AlterTable
ALTER TABLE "Sale"
ADD COLUMN "offsiteAdsAttributed" BOOLEAN,
ADD COLUMN "offsiteAdsFee" DECIMAL(10,2),
ADD COLUMN "vatOnOffsiteAdsFee" DECIMAL(10,2),
ADD COLUMN "etsyPaymentGross" DECIMAL(10,2),
ADD COLUMN "etsyPaymentFees" DECIMAL(10,2),
ADD COLUMN "etsyPaymentNet" DECIMAL(10,2),
ADD COLUMN "etsyFeeReconciliationStatus" "EtsyFeeReconciliationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "etsyFeeReconciliationSource" "EtsyFeeReconciliationSource",
ADD COLUMN "etsyFeeReconciledAt" TIMESTAMP(3),
ADD COLUMN "etsyStatementImportId" TEXT;

UPDATE "Sale"
SET "etsyFeeReconciliationStatus" = CASE
  WHEN "saleChannel" = 'etsy' THEN 'PENDING'::"EtsyFeeReconciliationStatus"
  ELSE 'NOT_APPLICABLE'::"EtsyFeeReconciliationStatus"
END;

-- CreateIndex
CREATE INDEX "Sale_etsyFeeReconciliationStatus_idx" ON "Sale"("etsyFeeReconciliationStatus");

-- CreateIndex
CREATE INDEX "Sale_etsyStatementImportId_idx" ON "Sale"("etsyStatementImportId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_etsyStatementImportId_fkey" FOREIGN KEY ("etsyStatementImportId") REFERENCES "EtsyStatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
