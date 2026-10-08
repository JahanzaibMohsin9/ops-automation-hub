-- CreateEnum
CREATE TYPE "ReviewEntityType" AS ENUM ('document', 'lead');

-- CreateEnum
CREATE TYPE "ReviewTaskStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('approve', 'reject', 'edit_approve');

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entityType" "ReviewEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "ReviewTaskStatus" NOT NULL DEFAULT 'pending',
    "assignedToUserId" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL,
    "reviewTaskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "changesJson" JSONB,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewTask_workspaceId_status_createdAt_idx" ON "ReviewTask"("workspaceId", "status", "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ReviewTask_workspaceId_entityType_status_createdAt_idx" ON "ReviewTask"("workspaceId", "entityType", "status", "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ReviewTask_workspaceId_entityType_entityId_status_createdAt_idx" ON "ReviewTask"("workspaceId", "entityType", "entityId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApprovalAction_reviewTaskId_createdAt_idx" ON "ApprovalAction"("reviewTaskId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApprovalAction_workspaceId_createdAt_idx" ON "ApprovalAction"("workspaceId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_reviewTaskId_fkey" FOREIGN KEY ("reviewTaskId") REFERENCES "ReviewTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
