-- CreateEnum
CREATE TYPE "SalesAssistArtifactType" AS ENUM ('summary', 'followup', 'brief');

-- CreateTable
CREATE TABLE "SalesAssistArtifact" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "SalesAssistArtifactType" NOT NULL,
    "content" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "tokenUsage" INTEGER,
    "latencyMs" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAssistArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesAssistArtifact_leadId_type_generatedAt_idx" ON "SalesAssistArtifact"("leadId", "type", "generatedAt" DESC);

-- CreateIndex
CREATE INDEX "SalesAssistArtifact_workspaceId_type_generatedAt_idx" ON "SalesAssistArtifact"("workspaceId", "type", "generatedAt" DESC);

-- AddForeignKey
ALTER TABLE "SalesAssistArtifact" ADD CONSTRAINT "SalesAssistArtifact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAssistArtifact" ADD CONSTRAINT "SalesAssistArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
