import type {
  DocumentProcessingStatus,
  DocumentUploadStatus,
  ReviewTaskStatus,
} from "@/generated/prisma/client";

export type DocumentPipelineStepState =
  | "complete"
  | "current"
  | "upcoming"
  | "attention"
  | "skipped";

export type DocumentPipelineStep = {
  id: "upload" | "extract_text" | "extract_structured" | "review" | "export";
  label: string;
  description: string;
  state: DocumentPipelineStepState;
};

type DocumentPipelineProgressInput = {
  uploadStatus: DocumentUploadStatus;
  processingStatus: DocumentProcessingStatus;
  hasExtractedPages: boolean;
  hasStructuredRecord: boolean;
  reviewTaskStatus: ReviewTaskStatus | null;
};

function isTerminalFailure(
  uploadStatus: DocumentUploadStatus,
  processingStatus: DocumentProcessingStatus
) {
  return uploadStatus === "failed" || processingStatus === "failed";
}

export function getDocumentPipelineSteps(
  input: DocumentPipelineProgressInput
): DocumentPipelineStep[] {
  const { uploadStatus, processingStatus, hasExtractedPages, hasStructuredRecord, reviewTaskStatus } = input;
  const failed = isTerminalFailure(uploadStatus, processingStatus);
  const needsReview = processingStatus === "review_needed" || reviewTaskStatus === "pending";
  const reviewResolved =
    reviewTaskStatus === "approved" ||
    reviewTaskStatus === "rejected" ||
    processingStatus === "approved" ||
    processingStatus === "rejected" ||
    processingStatus === "exported";

  return [
    {
      id: "upload",
      label: "Uploaded",
      description:
        uploadStatus === "failed"
          ? "The file upload failed before processing could start."
          : "The source file was stored and the processing job was queued.",
      state:
        uploadStatus === "failed"
          ? "attention"
          : uploadStatus === "uploaded"
            ? "complete"
            : "current",
    },
    {
      id: "extract_text",
      label: "Text extraction",
      description: hasExtractedPages
        ? "Page text is available for downstream structured extraction."
        : "The processor is extracting text and OCR where needed.",
      state: failed && !hasExtractedPages
        ? "attention"
        : hasExtractedPages
          ? "complete"
          : processingStatus === "pending" || processingStatus === "extracting_text" || processingStatus === "ocr_required"
            ? "current"
            : "upcoming",
    },
    {
      id: "extract_structured",
      label: "Structured extraction",
      description: hasStructuredRecord
        ? "Schema fields, confidence, and snippets were generated."
        : "The AI extraction step is shaping fields for review or approval.",
      state: failed && !hasStructuredRecord
        ? "attention"
        : hasStructuredRecord
          ? "complete"
          : processingStatus === "extracting_structured"
            ? "current"
            : hasExtractedPages
              ? "current"
              : "upcoming",
    },
    {
      id: "review",
      label: "Human review",
      description: needsReview
        ? "A reviewer needs to approve, reject, or edit low-confidence fields."
        : reviewResolved
          ? "Review is resolved, or the document auto-approved without manual work."
          : "This step is skipped when extraction is confident enough to auto-approve.",
      state: failed
        ? "upcoming"
        : needsReview
          ? "current"
          : reviewResolved
            ? "complete"
            : hasStructuredRecord
              ? "skipped"
              : "upcoming",
    },
    {
      id: "export",
      label: "Export",
      description:
        processingStatus === "exported"
          ? "The approved record has been exported."
          : "Approved records are ready for CSV or JSON export.",
      state: failed
        ? "upcoming"
        : processingStatus === "exported"
          ? "complete"
          : processingStatus === "approved"
            ? "current"
            : "upcoming",
    },
  ];
}
