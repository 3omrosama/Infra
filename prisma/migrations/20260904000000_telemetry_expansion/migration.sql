-- AlterTable
ALTER TABLE "Metric" ADD COLUMN IF NOT EXISTS "hostId" TEXT,
ADD COLUMN IF NOT EXISTS "cpuCoresTotal" INTEGER,
ADD COLUMN IF NOT EXISTS "memoryUsedBytes" BIGINT,
ADD COLUMN IF NOT EXISTS "memoryTotalBytes" BIGINT,
ADD COLUMN IF NOT EXISTS "storageUsedBytes" BIGINT,
ADD COLUMN IF NOT EXISTS "storageTotalBytes" BIGINT,
ADD COLUMN IF NOT EXISTS "uptimeSeconds" BIGINT,
ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Metric_connectionId_idx" ON "Metric"("connectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Metric_hostId_idx" ON "Metric"("hostId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Metric_timestamp_connectionId_idx" ON "Metric"("timestamp", "connectionId");
