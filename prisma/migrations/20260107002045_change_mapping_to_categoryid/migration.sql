/*
  Warnings:

  - You are about to drop the column `requirementId` on the `HamperVariantMapping` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[etsySku]` on the table `HamperVariant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[variantId,categoryId]` on the table `HamperVariantMapping` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `categoryId` to the `HamperVariantMapping` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "HamperVariantMapping" DROP CONSTRAINT "HamperVariantMapping_requirementId_fkey";

-- DropIndex
DROP INDEX "HamperVariant_etsySku_idx";

-- DropIndex
DROP INDEX "HamperVariantMapping_variantId_requirementId_key";

-- AlterTable
ALTER TABLE "HamperVariantMapping" DROP COLUMN "requirementId",
ADD COLUMN     "categoryId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "HamperVariant_etsySku_key" ON "HamperVariant"("etsySku");

-- CreateIndex
CREATE UNIQUE INDEX "HamperVariantMapping_variantId_categoryId_key" ON "HamperVariantMapping"("variantId", "categoryId");

-- AddForeignKey
ALTER TABLE "HamperVariantMapping" ADD CONSTRAINT "HamperVariantMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ComponentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
