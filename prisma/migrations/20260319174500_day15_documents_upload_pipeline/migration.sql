-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('invoice', 'onboarding_form', 'agreement');

-- CreateEnum
CREATE TYPE "DocumentUploadStatus" AS ENUM ('uploading', 'uploaded', 'failed');

-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('pending', 'extracting_text', 'ocr_required', 'extracting_structured', 'review_needed', 'approved', 'rejected', 'exported', 'failed');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadStatus" "DocumentUploadStatus" NOT NULL DEFAULT 'uploading',
    "processingStatus" "DocumentProcessingStatus" NOT NULL DEFAULT 'pending',
    "processingRunId" TEXT,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "rawText" TEXT,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_workspaceId_storageKey_key" ON "Document"("workspaceId", "storageKey");

-- CreateIndex
CREATE INDEX "Document_workspaceId_createdAt_idx" ON "Document"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Document_workspaceId_processingStatus_idx" ON "Document"("workspaceId", "processingStatus");

-- CreateIndex
CREATE INDEX "Document_workspaceId_uploadStatus_idx" ON "Document"("workspaceId", "uploadStatus");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "DocumentPage_workspaceId_createdAt_idx" ON "DocumentPage"("workspaceId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
