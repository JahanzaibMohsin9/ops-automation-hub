import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DeleteDocumentButton } from "@/components/delete-document-button";
import { DocumentProcessingStepper } from "@/components/document-processing-stepper";
import { DocumentRetryPanel } from "@/components/document-retry-panel";
import { DocumentProcessingStatusBadge, DocumentUploadStatusBadge } from "@/components/document-status-badge";
import {
  describeAuditEvent,
  describeAuditMetadata,
} from "@/features/audit/format";
import { formatDocumentType } from "@/features/documents/config";
import type { Prisma } from "@/generated/prisma/client";
import { formatBytes } from "@/features/documents/config";
import {
  getReviewStatusClasses,
  reviewTaskStatusLabels,
} from "@/features/review/config";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentId: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const doc = await prisma.document.findFirst({
    where: { id: resolved.documentId },
    select: { fileName: true },
  });
  return {
    title: doc
      ? `${doc.fileName} — Revenue & Ops Automation Hub`
      : "Document — Revenue & Ops Automation Hub",
    description: doc
      ? `View extraction results, OCR pages, confidence scoring, and review status for ${doc.fileName}.`
      : "Document detail view.",
  };
}

type DocumentDetailPageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

function getObjectValue(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Prisma.JsonValue>;
}

function getStringValue(
  value: Record<string, Prisma.JsonValue> | null,
  key: string
) {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function getNumberValue(
  value: Record<string, Prisma.JsonValue> | null,
  key: string
) {
  const candidate = value?.[key];
  return typeof candidate === "number" ? candidate : null;
}

function getStringArrayValue(
  value: Record<string, Prisma.JsonValue> | null,
  key: string
) {
  const candidate = value?.[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const workspaceContext = await requireWorkspaceContext();
  const resolvedParams = await params;

  const document = await prisma.document.findFirst({
    where: {
      id: resolvedParams.documentId,
      workspaceId: workspaceContext.workspaceId,
    },
    include: {
      pages: {
        orderBy: {
          pageNumber: "asc",
        },
      },
      extractedRecords: {
        orderBy: {
          extractedAt: "desc",
        },
        take: 1,
        include: {
          fields: {
            orderBy: {
              fieldName: "asc",
            },
          },
        },
      },
    },
  });

  if (!document) {
    notFound();
  }

  const auditEvents = await prisma.auditLog.findMany({
    where: {
      workspaceId: workspaceContext.workspaceId,
      entityType: "document",
      entityId: document.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  const latestReviewTask = await prisma.reviewTask.findFirst({
    where: {
      workspaceId: workspaceContext.workspaceId,
      entityType: "document",
      entityId: document.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const latestExtractedAt =
    document.pages.length > 0
      ? document.pages.reduce(
          (latest, page) => (page.createdAt > latest ? page.createdAt : latest),
          document.pages[0]!.createdAt
        )
      : null;
  const usedOcr = document.pages.some((page) => page.ocrUsed);
  const totalCharacters = document.pages.reduce(
    (sum, page) => sum + (page.rawText?.length ?? 0),
    0
  );
  const extractedRecord = document.extractedRecords[0] ?? null;

  function formatConfidence(score: number) {
    return `${Math.round(score * 100)}%`;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-stone-900/10 bg-white p-7 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <Link href="/documents" className="text-sm font-semibold text-amber-700 transition hover:text-amber-800">
          Back to documents
        </Link>

        <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
              Document detail
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
              {document.fileName}
            </h2>
            <p className="mt-3 text-lg text-stone-600">
              {formatDocumentType(document.documentType)} · {formatBytes(document.fileSize)}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <DocumentUploadStatusBadge status={document.uploadStatus} />
            <DocumentProcessingStatusBadge status={document.processingStatus} />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-red-800">Delete from app and Cloudflare R2</p>
              <p className="mt-1 text-sm leading-6 text-red-700">
                Removes the database record, extracted data, review tasks, and the stored file so it no longer consumes R2 storage.
              </p>
            </div>
            <DeleteDocumentButton documentId={document.id} />
          </div>
        </div>

        <div className="mt-4">
          <DocumentRetryPanel
            documentId={document.id}
            processingStatus={document.processingStatus}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <DocumentProcessingStepper
            uploadStatus={document.uploadStatus}
            processingStatus={document.processingStatus}
            hasExtractedPages={document.pages.length > 0}
            hasStructuredRecord={Boolean(extractedRecord)}
            reviewTaskStatus={latestReviewTask?.status ?? null}
          />

          <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold tracking-[0.22em] text-stone-500 uppercase">
                  Structured extraction
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
                  Schema fields with confidence and source snippets
                </h3>
                <p className="mt-3 text-sm leading-7 text-stone-600">
                  Low-confidence fields are highlighted so the review queue can focus attention where AI output is uncertain.
                </p>
              </div>
              {extractedRecord ? (
                <span
                  className={`inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${
                    latestReviewTask
                      ? getReviewStatusClasses(latestReviewTask.status)
                      : extractedRecord.requiresReview
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {latestReviewTask
                    ? reviewTaskStatusLabels[latestReviewTask.status]
                    : extractedRecord.requiresReview
                      ? "Review needed"
                      : "Auto approved"}
                </span>
              ) : null}
            </div>

            {!extractedRecord ? (
              <div className="mt-6 rounded-2xl border border-dashed border-stone-900/15 bg-stone-50 p-5 text-sm leading-7 text-stone-600">
                {document.processingStatus === "extracting_structured"
                  ? "Structured extraction is running now. Fields and confidence scores will appear here as soon as the model finishes."
                  : document.processingStatus === "failed"
                    ? document.processingError ?? "Structured extraction failed. The pipeline will need to be retried from the document detail flow."
                    : "Structured fields have not been extracted yet."}
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-2xl border border-stone-900/10">
                <table className="min-w-full border-collapse">
                  <thead className="bg-stone-50">
                    <tr className="text-left text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">
                      <th className="px-4 py-3">Field</th>
                      <th className="px-4 py-3">Value</th>
                      <th className="px-4 py-3">Confidence</th>
                      <th className="px-4 py-3">Source snippet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedRecord.fields.map((field) => (
                      <tr
                        key={field.id}
                        className={`border-t border-stone-900/10 text-sm ${
                          field.confidenceScore < 0.85
                            ? "bg-amber-50/70 text-stone-800"
                            : "text-stone-700"
                        }`}
                      >
                        <td className="px-4 py-3 align-top font-semibold text-stone-900">
                          {field.fieldName.replace(/_/g, " ")}
                        </td>
                        <td className="max-w-[260px] px-4 py-3 align-top">
                          <span className="break-words">{field.fieldValue ?? "Unknown"}</span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${
                              field.confidenceScore < 0.85
                                ? "border-amber-200 bg-amber-100 text-amber-800"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {formatConfidence(field.confidenceScore)}
                          </span>
                        </td>
                        <td className="max-w-[320px] px-4 py-3 align-top text-xs leading-6 text-stone-600">
                          {field.sourceSnippet ?? "No supporting snippet available."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
            <p className="text-sm font-semibold tracking-[0.22em] text-stone-500 uppercase">
              Extraction preview
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
              Page-level text from the document processor
            </h3>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              This view shows page-level extraction output from the Python processor, including OCR usage and page diagnostics.
            </p>

            {document.pages.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-stone-900/15 bg-stone-50 p-5 text-sm leading-7 text-stone-600">
                {document.processingStatus === "failed" || document.processingStatus === "ocr_required"
                  ? document.processingError ?? "Text extraction failed before any page text could be stored."
                  : "No document pages have been extracted yet. Uploaded files move here after the text extraction worker finishes."}
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {document.pages.map((page) => {
                  const metadata = getObjectValue(page.metadata);
                  const source = getStringValue(metadata, "source");
                  const warnings = getStringArrayValue(metadata, "warnings");
                  const charCount = getNumberValue(metadata, "char_count");

                  return (
                    <article key={page.id} className="rounded-2xl border border-stone-900/10 bg-stone-50 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">Page {page.pageNumber}</p>
                          <p className="mt-1 text-xs text-stone-500">
                            {page.rawText?.length ?? 0} characters extracted
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${
                              page.ocrUsed
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-stone-200 bg-white text-stone-700"
                            }`}
                          >
                            {page.ocrUsed ? "OCR used" : "Direct text"}
                          </span>
                          {source ? (
                            <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-stone-700 uppercase">
                              {source}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {(typeof charCount === "number" || warnings.length > 0) ? (
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-500">
                          {typeof charCount === "number" ? <span>{charCount} chars reported by extractor</span> : null}
                          {warnings.length > 0 ? <span>Warnings: {warnings.join(", ")}</span> : null}
                        </div>
                      ) : null}

                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-stone-700">
                        {page.rawText ?? "No extracted text available."}
                      </pre>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-[1.5rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <p className="text-sm font-semibold tracking-[0.22em] text-stone-400 uppercase">
            Metadata
          </p>
          <dl className="mt-5 grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Processing summary</dt>
              <dd className="mt-2 text-sm text-stone-100">
                {document.pages.length > 0
                  ? `${document.pages.length} page${document.pages.length === 1 ? "" : "s"} extracted${usedOcr ? " with OCR on at least one page" : ""}.`
                  : document.processingStatus === "failed"
                    ? "Processing failed before extraction completed."
                    : "Awaiting extraction results."}
              </dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Extracted at</dt>
              <dd className="mt-2 text-sm text-stone-100">
                {latestExtractedAt ? latestExtractedAt.toLocaleString() : "Not extracted yet"}
              </dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Total characters</dt>
              <dd className="mt-2 text-sm text-stone-100">
                {document.pages.length > 0 ? totalCharacters.toLocaleString() : "0"}
              </dd>
            </div>
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Structured extraction</dt>
              <dd className="mt-2 text-sm leading-6 text-stone-300">
                {extractedRecord
                  ? `${formatConfidence(extractedRecord.confidenceScore)} confidence via ${extractedRecord.modelUsed} (${extractedRecord.promptVersion}).`
                  : document.processingStatus === "failed"
                    ? "No structured extraction is available because the document pipeline failed before field generation."
                    : "Awaiting schema-based fields with confidence scoring and review routing."}
              </dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Review status</dt>
              <dd className="mt-2 text-sm text-stone-100">
                {latestReviewTask ? (
                  <Link
                    href={`/review-queue/${latestReviewTask.id}`}
                    className="text-amber-300 underline decoration-amber-500/40 underline-offset-4"
                  >
                    {reviewTaskStatusLabels[latestReviewTask.status]}
                  </Link>
                ) : extractedRecord?.requiresReview ? (
                  "Pending task will appear after extraction completes."
                ) : (
                  "No active review task"
                )}
              </dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Storage key</dt>
              <dd className="mt-2 break-all text-sm text-stone-100">{document.storageKey}</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Mime type</dt>
              <dd className="mt-2 text-sm text-stone-100">{document.mimeType}</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Processing run</dt>
              <dd className="mt-2 text-sm text-stone-100">{document.processingRunId ?? "Not queued yet"}</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Last error</dt>
              <dd className="mt-2 text-sm text-stone-100">{document.processingError ?? "None"}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase">Audit trail</p>
              <Link
                href={`/audit-log?entityType=document&entityId=${document.id}`}
                className="text-[11px] font-semibold text-amber-300 transition hover:text-amber-200"
              >
                Open full log
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {auditEvents.length === 0 ? (
                <p className="text-sm text-stone-300">No document audit events recorded yet.</p>
              ) : (
                auditEvents.map((event) => (
                  <article key={event.id} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                    <p className="text-sm font-semibold text-stone-100">
                      {describeAuditEvent(event.eventType, event.metadataJson as Prisma.JsonValue | null)}
                    </p>
                    <p className="mt-1 text-[11px] text-stone-400">{event.eventType}</p>
                    {describeAuditMetadata(event.metadataJson as Prisma.JsonValue | null) ? (
                      <p className="mt-1 text-xs text-stone-500">
                        {describeAuditMetadata(event.metadataJson as Prisma.JsonValue | null)}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-stone-400">{event.createdAt.toLocaleString()}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
