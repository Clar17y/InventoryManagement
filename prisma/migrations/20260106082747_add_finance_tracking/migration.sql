/*
  Warnings:

  - You are about to drop the column `fixedFee` on the `EtsyFeeConfig` table. All the data in the column will be lost.
  - You are about to drop the column `paymentFee` on the `EtsyFeeConfig` table. All the data in the column will be lost.
  - You are about to drop the column `percentageFee` on the `EtsyFeeConfig` table. All the data in the column will be lost.
  - Added the required column `listingFee` to the `EtsyFeeConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentFeeFixed` to the `EtsyFeeConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentFeePercent` to the `EtsyFeeConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `regulatoryFee` to the `EtsyFeeConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transactionFee` to the `EtsyFeeConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vatRate` to the `EtsyFeeConfig` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('ADVERTISING', 'LISTING_FEE', 'POSTAGE', 'PACKAGING', 'OTHER');

-- DropForeignKey
ALTER TABLE "SaleLine" DROP CONSTRAINT "SaleLine_hamperId_fkey";

-- AlterTable: EtsyFeeConfig - First add new columns with defaults, then drop old ones
ALTER TABLE "EtsyFeeConfig"
ADD COLUMN     "listingFee" DECIMAL(10,2) NOT NULL DEFAULT 0.15,
ADD COLUMN     "paymentFeeFixed" DECIMAL(10,2) NOT NULL DEFAULT 0.20,
ADD COLUMN     "paymentFeePercent" DECIMAL(5,4) NOT NULL DEFAULT 0.04,
ADD COLUMN     "regulatoryFee" DECIMAL(5,4) NOT NULL DEFAULT 0.0032,
ADD COLUMN     "transactionFee" DECIMAL(5,4) NOT NULL DEFAULT 0.065,
ADD COLUMN     "vatRate" DECIMAL(5,4) NOT NULL DEFAULT 0.20;

-- Now drop the old columns
ALTER TABLE "EtsyFeeConfig" DROP COLUMN "fixedFee",
DROP COLUMN "paymentFee",
DROP COLUMN "percentageFee";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "isHistorical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "listingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "postageCharged" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "postageCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "postageTransactionFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "processingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "regulatoryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "saleChannel" TEXT NOT NULL DEFAULT 'etsy',
ADD COLUMN     "transactionFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatOnProcessingFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "description" TEXT,
ALTER COLUMN "hamperId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BusinessExpense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "ExpenseCategory" NOT NULL,
    "supplier" TEXT,
    "description" TEXT NOT NULL,
    "amountIncVat" DECIMAL(10,2) NOT NULL,
    "amountExcVat" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessExpense_date_idx" ON "BusinessExpense"("date");

-- CreateIndex
CREATE INDEX "BusinessExpense_category_idx" ON "BusinessExpense"("category");

-- CreateIndex
CREATE INDEX "Sale_saleDate_idx" ON "Sale"("saleDate");

-- CreateIndex
CREATE INDEX "Sale_saleChannel_idx" ON "Sale"("saleChannel");

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_hamperId_fkey" FOREIGN KEY ("hamperId") REFERENCES "Hamper"("id") ON DELETE SET NULL ON UPDATE CASCADE;
