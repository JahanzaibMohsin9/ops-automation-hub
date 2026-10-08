import type {
  DocumentProcessingStatus,
  DocumentUploadStatus,
} from "@/generated/prisma/client";
import {
  documentProcessingStatusLabels,
  documentUploadStatusLabels,
} from "@/features/documents/config";

export function DocumentUploadStatusBadge({
  status,
}: {
  status: DocumentUploadStatus;
}) {
  const className =
    status === "uploaded"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${className}`}>
      {documentUploadStatusLabels[status]}
    </span>
  );
}

export function DocumentProcessingStatusBadge({
  status,
}: {
  status: DocumentProcessingStatus;
}) {
  const className =
    status === "approved" || status === "exported"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "failed" || status === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : status === "review_needed" || status === "ocr_required"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-stone-200 bg-stone-100 text-stone-700";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${className}`}>
      {documentProcessingStatusLabels[status]}
    </span>
  );
}
