CREATE TYPE "LeadFitLabel" AS ENUM ('high_fit', 'medium_fit', 'low_fit');

CREATE TABLE "LeadScore" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "numericScore" INTEGER NOT NULL,
  "fitLabel" "LeadFitLabel" NOT NULL,
  "reasoning" TEXT NOT NULL,
  "missingDataJson" JSONB,
  "confidenceScore" DOUBLE PRECISION NOT NULL,
  "modelUsed" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "tokenUsage" INTEGER,
  "latencyMs" INTEGER,
  "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadScore_leadId_key" ON "LeadScore"("leadId");
CREATE INDEX "LeadScore_workspaceId_scoredAt_idx" ON "LeadScore"("workspaceId", "scoredAt" DESC);
CREATE INDEX "LeadScore_workspaceId_fitLabel_idx" ON "LeadScore"("workspaceId", "fitLabel");

ALTER TABLE "LeadScore"
ADD CONSTRAINT "LeadScore_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "LeadScore"
ADD CONSTRAINT "LeadScore_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
