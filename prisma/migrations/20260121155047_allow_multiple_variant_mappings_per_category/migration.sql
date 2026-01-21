-- DropIndex
DROP INDEX "HamperVariantMapping_variantId_categoryId_key";

-- CreateIndex
CREATE INDEX "HamperVariantMapping_variantId_idx" ON "HamperVariantMapping"("variantId");
