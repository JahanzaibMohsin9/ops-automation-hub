-- CreateTable
CREATE TABLE "ExtractedRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "schemaType" "DocumentType" NOT NULL,
    "extractionJson" JSONB NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "modelUsed" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "tokenUsage" INTEGER,
    "latencyMs" INTEGER,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedField" (
    "id" TEXT NOT NULL,
    "extractedRecordId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "sourceSnippet" TEXT,
    "reviewerOverrideValue" TEXT,
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExtractedField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtractedRecord_documentId_extractedAt_idx" ON "ExtractedRecord"("documentId", "extractedAt" DESC);

-- CreateIndex
CREATE INDEX "ExtractedRecord_workspaceId_requiresReview_idx" ON "ExtractedRecord"("workspaceId", "requiresReview");

-- CreateIndex
CREATE INDEX "ExtractedRecord_workspaceId_schemaType_extractedAt_idx" ON "ExtractedRecord"("workspaceId", "schemaType", "extractedAt" DESC);

-- CreateIndex
CREATE INDEX "ExtractedField_extractedRecordId_idx" ON "ExtractedField"("extractedRecordId");

-- CreateIndex
CREATE INDEX "ExtractedField_workspaceId_confidenceScore_idx" ON "ExtractedField"("workspaceId", "confidenceScore");

-- AddForeignKey
ALTER TABLE "ExtractedRecord" ADD CONSTRAINT "ExtractedRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedRecord" ADD CONSTRAINT "ExtractedRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_extractedRecordId_fkey" FOREIGN KEY ("extractedRecordId") REFERENCES "ExtractedRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
