ALTER TABLE "Lead"
ADD COLUMN "processingStatus" TEXT,
ADD COLUMN "processingRunId" TEXT,
ADD COLUMN "processingError" TEXT,
ADD COLUMN "processedAt" TIMESTAMP(3);

CREATE INDEX "Lead_workspaceId_processingStatus_idx"
ON "Lead"("workspaceId", "processingStatus");
