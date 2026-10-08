-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('hubspot', 'slack');

-- CreateEnum
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('disconnected', 'connected');

-- CreateEnum
CREATE TYPE "CRMContactSyncStatus" AS ENUM ('pending', 'synced', 'failed', 'retrying');

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "metadata" JSONB,
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'disconnected',
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMContactSync" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalContactId" TEXT,
    "syncStatus" "CRMContactSyncStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "contactUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CRMContactSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_workspaceId_provider_key" ON "IntegrationConnection"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "IntegrationConnection_workspaceId_status_idx" ON "IntegrationConnection"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CRMContactSync_leadId_provider_key" ON "CRMContactSync"("leadId", "provider");

-- CreateIndex
CREATE INDEX "CRMContactSync_workspaceId_syncStatus_idx" ON "CRMContactSync"("workspaceId", "syncStatus");

-- CreateIndex
CREATE INDEX "CRMContactSync_workspaceId_leadId_idx" ON "CRMContactSync"("workspaceId", "leadId");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMContactSync" ADD CONSTRAINT "CRMContactSync_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMContactSync" ADD CONSTRAINT "CRMContactSync_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
