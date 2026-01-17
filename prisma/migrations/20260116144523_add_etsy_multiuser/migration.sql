/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `EtsyCredentials` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "EtsyCredentials" ADD COLUMN     "isAppOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loginName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EtsyCredentials_userId_key" ON "EtsyCredentials"("userId");

-- CreateIndex
CREATE INDEX "EtsyCredentials_isDefault_idx" ON "EtsyCredentials"("isDefault");
