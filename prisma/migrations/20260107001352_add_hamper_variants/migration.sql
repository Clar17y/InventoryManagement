-- AlterTable
ALTER TABLE "Hamper" ADD COLUMN     "hasVariants" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "variantId" TEXT;

-- CreateTable
CREATE TABLE "HamperVariant" (
    "id" TEXT NOT NULL,
    "hamperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "etsySku" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HamperVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HamperVariantMapping" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "HamperVariantMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HamperVariant_etsySku_idx" ON "HamperVariant"("etsySku");

-- CreateIndex
CREATE UNIQUE INDEX "HamperVariant_hamperId_name_key" ON "HamperVariant"("hamperId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "HamperVariantMapping_variantId_requirementId_key" ON "HamperVariantMapping"("variantId", "requirementId");

-- AddForeignKey
ALTER TABLE "HamperVariant" ADD CONSTRAINT "HamperVariant_hamperId_fkey" FOREIGN KEY ("hamperId") REFERENCES "Hamper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HamperVariantMapping" ADD CONSTRAINT "HamperVariantMapping_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "HamperVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HamperVariantMapping" ADD CONSTRAINT "HamperVariantMapping_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "HamperRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HamperVariantMapping" ADD CONSTRAINT "HamperVariantMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "HamperVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
