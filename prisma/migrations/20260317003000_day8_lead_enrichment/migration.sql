ALTER TYPE "LeadStatus" ADD VALUE 'enriched';
ALTER TYPE "LeadStatus" ADD VALUE 'enrichment_failed';

CREATE TYPE "LeadEnrichmentStatus" AS ENUM ('pending', 'success', 'failed', 'partial');

CREATE TABLE "LeadEnrichment" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "rawPayloadJson" JSONB,
  "normalizedData" JSONB,
  "status" "LeadEnrichmentStatus" NOT NULL DEFAULT 'pending',
  "enrichedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadEnrichment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LeadEnrichment"
ADD CONSTRAINT "LeadEnrichment_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "LeadEnrichment"
ADD CONSTRAINT "LeadEnrichment_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "LeadEnrichment_leadId_enrichedAt_idx"
ON "LeadEnrichment"("leadId", "enrichedAt" DESC);

CREATE INDEX "LeadEnrichment_workspaceId_status_idx"
ON "LeadEnrichment"("workspaceId", "status");
