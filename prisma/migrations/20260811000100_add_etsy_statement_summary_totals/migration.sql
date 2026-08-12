-- Persist the complete preview summary needed for truthful duplicate imports.
ALTER TABLE "EtsyStatementImport"
ADD COLUMN "attributed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "notAttributed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "oldFeesPence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "newFeesPence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "marginDeltaPence" INTEGER NOT NULL DEFAULT 0;
