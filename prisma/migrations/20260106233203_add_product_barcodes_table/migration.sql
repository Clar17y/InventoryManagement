/*
  Warnings:

  - You are about to drop the column `barcode` on the `Product` table. All the data in the column will be lost.

*/
-- CreateTable (FIRST - so we can migrate data to it)
CREATE TABLE "ProductBarcode" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductBarcode_barcode_key" ON "ProductBarcode"("barcode");

-- CreateIndex
CREATE INDEX "ProductBarcode_productId_idx" ON "ProductBarcode"("productId");

-- AddForeignKey
ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing barcode data to new table
INSERT INTO "ProductBarcode" ("id", "barcode", "productId", "createdAt")
SELECT 
    gen_random_uuid()::text,
    "barcode",
    "id",
    CURRENT_TIMESTAMP
FROM "Product"
WHERE "barcode" IS NOT NULL;

-- DropIndex (after data migration)
DROP INDEX "Product_barcode_key";

-- AlterTable (after data migration)
ALTER TABLE "Product" DROP COLUMN "barcode";
