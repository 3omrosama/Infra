-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('ESXI', 'CASAOS', 'DOCKER', 'PROXMOX', 'TRUENAS', 'LINUX_SERVER', 'WINDOWS_SERVER');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED', 'CONNECTING', 'DISABLED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('ESXI', 'VM', 'CASAOS', 'DOCKER', 'SERVER', 'STORAGE', 'NETWORK');

-- CreateEnum
CREATE TYPE "PowerState" AS ENUM ('RUNNING', 'STOPPED', 'SUSPENDED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "UserRole" NOT NULL,
    "description" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT,
    "roleName" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ConnectionType" NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfrastructureProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerId" TEXT,
    "type" "ConnectionType" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "useHttps" BOOLEAN NOT NULL DEFAULT true,
    "skipSslVerify" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "encryptedSecret" TEXT,
    "secretIv" TEXT,
    "secretTag" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeen" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "errorDetails" TEXT,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 30,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfrastructureConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Host" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "build" TEXT,
    "cpuModel" TEXT,
    "cpuCores" INTEGER NOT NULL DEFAULT 1,
    "cpuMhzTotal" INTEGER,
    "cpuUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memoryBytesTotal" BIGINT NOT NULL DEFAULT 0,
    "memoryUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageBytesTotal" BIGINT NOT NULL DEFAULT 0,
    "storageBytesUsed" BIGINT NOT NULL DEFAULT 0,
    "storageUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uptimeSeconds" BIGINT NOT NULL DEFAULT 0,
    "powerState" "PowerState" NOT NULL DEFAULT 'RUNNING',
    "vmCount" INTEGER NOT NULL DEFAULT 0,
    "runningVmCount" INTEGER NOT NULL DEFAULT 0,
    "datastores" JSONB,
    "networksJson" JSONB,
    "rawDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualMachine" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "hostId" TEXT,
    "externalVmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "powerState" "PowerState" NOT NULL DEFAULT 'RUNNING',
    "cpuCount" INTEGER NOT NULL DEFAULT 1,
    "cpuUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memoryBytes" BIGINT NOT NULL DEFAULT 0,
    "memoryUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageBytes" BIGINT NOT NULL DEFAULT 0,
    "storageUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "guestOs" TEXT,
    "uptimeSeconds" BIGINT NOT NULL DEFAULT 0,
    "datastoreName" TEXT,
    "networkName" TEXT,
    "rawDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VirtualMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasaOSServer" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "uptimeSeconds" BIGINT NOT NULL DEFAULT 0,
    "cpuModel" TEXT,
    "cpuCores" INTEGER NOT NULL DEFAULT 1,
    "cpuUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memoryBytesTotal" BIGINT NOT NULL DEFAULT 0,
    "memoryBytesUsed" BIGINT NOT NULL DEFAULT 0,
    "memoryUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageBytesTotal" BIGINT NOT NULL DEFAULT 0,
    "storageBytesUsed" BIGINT NOT NULL DEFAULT 0,
    "storageUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diskCount" INTEGER NOT NULL DEFAULT 0,
    "runningAppsCount" INTEGER NOT NULL DEFAULT 0,
    "totalAppsCount" INTEGER NOT NULL DEFAULT 0,
    "dockerVersion" TEXT,
    "disks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CasaOSServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "powerState" "PowerState" NOT NULL DEFAULT 'RUNNING',
    "cpuUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memoryBytes" BIGINT NOT NULL DEFAULT 0,
    "memoryLimitBytes" BIGINT NOT NULL DEFAULT 0,
    "memoryUsagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "networkTxBytes" BIGINT NOT NULL DEFAULT 0,
    "networkRxBytes" BIGINT NOT NULL DEFAULT 0,
    "ports" JSONB,
    "volumes" JSONB,
    "restartCount" INTEGER NOT NULL DEFAULT 0,
    "isCasaOsApp" BOOLEAN NOT NULL DEFAULT false,
    "appCategory" TEXT,
    "appTitle" TEXT,
    "appIcon" TEXT,
    "uptimeSeconds" BIGINT NOT NULL DEFAULT 0,
    "rawDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DockerImage" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "inUse" BOOLEAN NOT NULL DEFAULT false,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DockerImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DockerVolume" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driver" TEXT NOT NULL DEFAULT 'local',
    "scope" TEXT NOT NULL DEFAULT 'local',
    "mountpoint" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "inUse" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DockerVolume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Storage" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "hostId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacityBytes" BIGINT NOT NULL DEFAULT 0,
    "freeBytes" BIGINT NOT NULL DEFAULT 0,
    "usagePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mountPoint" TEXT,
    "driveModel" TEXT,
    "healthStatus" TEXT NOT NULL DEFAULT 'OK',
    "temperatureC" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Network" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "hostId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "vlanId" INTEGER,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "speedMbps" INTEGER,
    "rxBytesPerSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "txBytesPerSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "resourceType" "ResourceType",
    "resourceId" TEXT,
    "resourceName" TEXT,
    "cpuPct" DOUBLE PRECISION NOT NULL,
    "memoryPct" DOUBLE PRECISION NOT NULL,
    "storagePct" DOUBLE PRECISION,
    "networkRxKbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "networkTxKbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 60,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "targetType" "ResourceType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL,
    "resourceType" "ResourceType",
    "resourceId" TEXT,
    "valueObserved" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "connectionId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" TEXT NOT NULL,
    "ipAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 30,
    "metricRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "demoMode" BOOLEAN NOT NULL DEFAULT true,
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "emailAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpFrom" TEXT NOT NULL DEFAULT 'alerts@noc-manager.local',
    "autoResolveMinutes" INTEGER NOT NULL DEFAULT 120,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InfrastructureProvider_name_key" ON "InfrastructureProvider"("name");

-- CreateIndex
CREATE INDEX "InfrastructureConnection_type_idx" ON "InfrastructureConnection"("type");

-- CreateIndex
CREATE INDEX "InfrastructureConnection_status_idx" ON "InfrastructureConnection"("status");

-- CreateIndex
CREATE INDEX "Host_connectionId_idx" ON "Host"("connectionId");

-- CreateIndex
CREATE INDEX "VirtualMachine_connectionId_idx" ON "VirtualMachine"("connectionId");

-- CreateIndex
CREATE INDEX "VirtualMachine_powerState_idx" ON "VirtualMachine"("powerState");

-- CreateIndex
CREATE UNIQUE INDEX "CasaOSServer_connectionId_key" ON "CasaOSServer"("connectionId");

-- CreateIndex
CREATE INDEX "CasaOSServer_connectionId_idx" ON "CasaOSServer"("connectionId");

-- CreateIndex
CREATE INDEX "Container_connectionId_idx" ON "Container"("connectionId");

-- CreateIndex
CREATE INDEX "Container_powerState_idx" ON "Container"("powerState");

-- CreateIndex
CREATE INDEX "DockerImage_connectionId_idx" ON "DockerImage"("connectionId");

-- CreateIndex
CREATE INDEX "DockerVolume_connectionId_idx" ON "DockerVolume"("connectionId");

-- CreateIndex
CREATE INDEX "Storage_connectionId_idx" ON "Storage"("connectionId");

-- CreateIndex
CREATE INDEX "Network_connectionId_idx" ON "Network"("connectionId");

-- CreateIndex
CREATE INDEX "Metric_connectionId_timestamp_idx" ON "Metric"("connectionId", "timestamp");

-- CreateIndex
CREATE INDEX "Metric_resourceId_timestamp_idx" ON "Metric"("resourceId", "timestamp");

-- CreateIndex
CREATE INDEX "Metric_timestamp_idx" ON "Metric"("timestamp");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_severity_idx" ON "Alert"("severity");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Event_timestamp_idx" ON "Event"("timestamp");

-- CreateIndex
CREATE INDEX "Event_connectionId_idx" ON "Event"("connectionId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfrastructureConnection" ADD CONSTRAINT "InfrastructureConnection_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InfrastructureProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Host" ADD CONSTRAINT "Host_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualMachine" ADD CONSTRAINT "VirtualMachine_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualMachine" ADD CONSTRAINT "VirtualMachine_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasaOSServer" ADD CONSTRAINT "CasaOSServer_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockerImage" ADD CONSTRAINT "DockerImage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockerVolume" ADD CONSTRAINT "DockerVolume_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Storage" ADD CONSTRAINT "Storage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Storage" ADD CONSTRAINT "Storage_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Network" ADD CONSTRAINT "Network_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Network" ADD CONSTRAINT "Network_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InfrastructureConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

