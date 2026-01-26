-- Add priority column to HamperVariantMapping
ALTER TABLE "HamperVariantMapping" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 1;

-- Backfill deterministic priorities per (variantId, categoryId) group
-- Order by productId to ensure consistent ordering
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "variantId", "categoryId"
    ORDER BY "productId"
  ) as rn
  FROM "HamperVariantMapping"
)
UPDATE "HamperVariantMapping" m SET priority = r.rn FROM ranked r WHERE m.id = r.id;

-- Add unique constraint: no duplicate priorities within same variant+category
CREATE UNIQUE INDEX "HamperVariantMapping_variantId_categoryId_priority_key" ON "HamperVariantMapping"("variantId", "categoryId", "priority");

-- Add unique constraint: no duplicate products within same variant+category
CREATE UNIQUE INDEX "HamperVariantMapping_variantId_categoryId_productId_key" ON "HamperVariantMapping"("variantId", "categoryId", "productId");
