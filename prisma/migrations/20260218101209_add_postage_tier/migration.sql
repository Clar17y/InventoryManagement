-- CreateTable
CREATE TABLE "PostageTier" (
    "id" TEXT NOT NULL,
    "etsyCharge" DECIMAL(10,2) NOT NULL,
    "actualCost" DECIMAL(10,2) NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostageTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostageTier_etsyCharge_key" ON "PostageTier"("etsyCharge");
