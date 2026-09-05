-- AlterTable
ALTER TABLE "InfrastructureConnection" ADD COLUMN IF NOT EXISTS "endpointKey" TEXT;

-- Backfill endpointKey for any existing records that do not have it
UPDATE "InfrastructureConnection"
SET "endpointKey" = LOWER("type"::text) || '://' || "host" || ':' || "port"
WHERE "endpointKey" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InfrastructureConnection_endpointKey_key" ON "InfrastructureConnection"("endpointKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InfrastructureConnection_endpointKey_idx" ON "InfrastructureConnection"("endpointKey");
