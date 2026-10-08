-- AlterTable
ALTER TABLE "Workspace"
ADD COLUMN "leadScoringCriteria" TEXT;

-- CreateTable
CREATE TABLE "LeadSubmissionAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSubmissionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSubmissionAttempt_workspaceId_ipAddress_createdAt_idx"
ON "LeadSubmissionAttempt"("workspaceId", "ipAddress", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "LeadSubmissionAttempt"
ADD CONSTRAINT "LeadSubmissionAttempt_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
