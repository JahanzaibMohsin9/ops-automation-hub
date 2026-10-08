import type {
  DocumentProcessingStatus,
  DocumentType,
  DocumentUploadStatus,
} from "@/generated/prisma/client";

export const DOCUMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;

export const allowedDocumentMimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
] as const;

export const allowedDocumentExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"];

export const documentTypeOptions: Array<{
  value: DocumentType;
  label: string;
  description: string;
}> = [
  {
    value: "invoice",
    label: "Invoice",
    description: "Vendor invoices, bills, and payment requests.",
  },
  {
    value: "onboarding_form",
    label: "Onboarding form",
    description: "Employee, client, or vendor onboarding packets.",
  },
  {
    value: "agreement",
    label: "Agreement",
    description: "Contracts, MSAs, scopes of work, and other agreements.",
  },
];

export const documentUploadStatusLabels: Record<DocumentUploadStatus, string> = {
  uploading: "Uploading",
  uploaded: "Uploaded",
  failed: "Upload failed",
};

export const documentProcessingStatusLabels: Record<DocumentProcessingStatus, string> = {
  pending: "Pending",
  extracting_text: "Extracting text",
  ocr_required: "OCR required",
  extracting_structured: "Extracting structured data",
  review_needed: "Review needed",
  approved: "Approved",
  rejected: "Rejected",
  exported: "Exported",
  failed: "Failed",
};

export function formatDocumentType(documentType: DocumentType) {
  return documentType.replace(/_/g, " ");
}

export function isAllowedDocumentMimeType(mimeType: string) {
  return allowedDocumentMimeTypes.includes(mimeType as (typeof allowedDocumentMimeTypes)[number]);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
