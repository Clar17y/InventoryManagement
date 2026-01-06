-- AlterEnum
ALTER TYPE "ExpenseCategory" ADD VALUE 'STOCK';

-- AlterTable
ALTER TABLE "BusinessExpense" ADD COLUMN     "isHistorical" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EtsyFeeConfig" ALTER COLUMN "listingFee" DROP DEFAULT,
ALTER COLUMN "paymentFeeFixed" DROP DEFAULT,
ALTER COLUMN "paymentFeePercent" DROP DEFAULT,
ALTER COLUMN "regulatoryFee" DROP DEFAULT,
ALTER COLUMN "transactionFee" DROP DEFAULT,
ALTER COLUMN "vatRate" DROP DEFAULT;
