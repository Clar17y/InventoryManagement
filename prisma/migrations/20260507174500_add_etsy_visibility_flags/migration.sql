-- AlterTable
ALTER TABLE "Hamper" ADD COLUMN     "etsyIsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "HamperVariant" ADD COLUMN     "etsyIsEnabled" BOOLEAN NOT NULL DEFAULT true;
