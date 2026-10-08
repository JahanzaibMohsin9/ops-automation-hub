import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DocumentReviewForm } from "@/components/document-review-form";
import { LeadReviewForm } from "@/components/lead-review-form";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import { formatDocumentType } from "@/features/documents/config";
import {
  approvalActionLabels,
  formatConfidencePercent,
  getReviewStatusClasses,
  reviewTaskStatusLabels,
} from "@/features/review/config";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ reviewTaskId: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const task = await prisma.reviewTask.findFirst({
    where: { id: resolved.reviewTaskId },
    select: { entityType: true, entityId: true },
  });
  const label = task?.entityType === "document" ? "Document review" : "Lead review";
  return {
    title: `${label} — Review Queue — Revenue & Ops Automation Hub`,
    description: "Review and resolve an AI extraction or lead scoring task.",
  };
}

type ReviewTaskDetailPageProps = {
  params: Promise<{
    reviewTaskId: string;
  }>;
};

export default async function ReviewTaskDetailPage({
  params,
}: ReviewTaskDetailPageProps) {
  const workspaceContext = await requireWorkspaceContext();
  const resolvedParams = await params;

  const reviewTask = await prisma.reviewTask.findFirst({
    where: {
      id: resolvedParams.reviewTaskId,
      workspaceId: workspaceContext.workspaceId,
    },
    include: {
      approvalActions: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!reviewTask) {
    notFound();
  }

  if (reviewTask.entityType !== "document") {
    const lead = await prisma.lead.findFirst({
      where: {
        id: reviewTask.entityId,
        workspaceId: workspaceContext.workspaceId,
      },
      include: {
        score: true,
      },
    });

    if (!lead || !lead.score) {
      notFound();
    }

    return (
      <div className="space-y-6">
        <section className="rounded-[1.75rem] border border-stone-900/10 bg-white p-7 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
          <Link
            href="/review-queue"
            className="text-sm font-semibold text-amber-700 transition hover:text-amber-800"
          >
            Back to review queue
          </Link>

          <div className="mt-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
                Lead review
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
                {lead.fullName}
              </h2>
              <p className="mt-3 text-lg text-stone-600">
                {lead.companyName} · Review task created{" "}
                {reviewTask.createdAt.toLocaleString()}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${getReviewStatusClasses(
                  reviewTask.status
                )}`}
              >
                {reviewTaskStatusLabels[reviewTask.status]}
              </span>
              <LeadStatusBadge status={lead.status} />
              <Link
                href={`/leads/${lead.id}`}
                className="rounded-full border border-stone-900/15 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-900/30"
              >
                Open lead detail
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
            <p className="text-sm font-semibold tracking-[0.22em] text-stone-500 uppercase">
              Score context
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-5">
                <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
                  Current score
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
                  {lead.score.numericScore}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-5">
                <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
                  Confidence
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
                  {formatConfidencePercent(lead.score.confidenceScore)}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-stone-900/10 bg-stone-50 p-5">
              <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
                Current reasoning
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                {lead.score.reasoning}
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-stone-900/10 bg-stone-50 p-5">
              <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
                Missing data
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Array.isArray(lead.score.missingDataJson)
                  ? lead.score.missingDataJson.filter(
                      (item): item is string => typeof item === "string"
                    )
                  : []
                ).length === 0 ? (
                  <span className="text-sm text-stone-500">
                    No missing fields were flagged.
                  </span>
                ) : (
                  (Array.isArray(lead.score.missingDataJson)
                    ? lead.score.missingDataJson.filter(
                        (item): item is string => typeof item === "string"
                      )
                    : []
                  ).map((field) => (
                    <span
                      key={field}
                      className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                    >
                      {field}
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <LeadReviewForm
              reviewTaskId={reviewTask.id}
              status={reviewTask.status}
              score={{
                numericScore: lead.score.numericScore,
                fitLabel: lead.score.fitLabel,
                reasoning: lead.score.reasoning,
                confidenceScore: lead.score.confidenceScore,
                missingFields: Array.isArray(lead.score.missingDataJson)
                  ? lead.score.missingDataJson.filter(
                      (item): item is string => typeof item === "string"
                    )
                  : [],
              }}
            />

            <section className="rounded-[1.5rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <p className="text-sm font-semibold tracking-[0.22em] text-stone-400 uppercase">
                Review history
              </p>
              <div className="mt-5 space-y-3">
                {reviewTask.approvalActions.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-stone-300">
                    No reviewer actions recorded yet.
                  </p>
                ) : (
                  reviewTask.approvalActions.map((action) => (
                    <article
                      key={action.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <p className="text-sm font-semibold text-stone-100">
                        {approvalActionLabels[action.action]}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        {action.createdAt.toLocaleString()}
                      </p>
                      <p className="mt-2 text-xs text-stone-300">
                        Actor: {action.actorUserId}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  const document = await prisma.document.findFirst({
    where: {
      id: reviewTask.entityId,
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

  const extractedRecord = document?.extractedRecords[0] ?? null;

  if (!document || !extractedRecord) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-stone-900/10 bg-white p-7 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <Link href="/review-queue" className="text-sm font-semibold text-amber-700 transition hover:text-amber-800">
          Back to review queue
        </Link>

        <div className="mt-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
              Document review
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
              {document.fileName}
            </h2>
            <p className="mt-3 text-lg text-stone-600">
              {formatDocumentType(document.documentType)} · Review task created {reviewTask.createdAt.toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${getReviewStatusClasses(
                reviewTask.status
              )}`}
            >
              {reviewTaskStatusLabels[reviewTask.status]}
            </span>
            <Link
              href={`/documents/${document.id}`}
              className="rounded-full border border-stone-900/15 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-900/30"
            >
              Open document detail
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.22em] text-stone-500 uppercase">
                Source document
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
                Rendered page text for review
              </h3>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                Reviewers can compare the extracted fields against the stored page text and OCR output without leaving the queue.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              {formatConfidencePercent(extractedRecord.confidenceScore)} overall confidence
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {document.pages.map((page) => (
              <article key={page.id} className="rounded-2xl border border-stone-900/10 bg-stone-50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Page {page.pageNumber}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {page.ocrUsed ? "OCR-assisted extraction" : "Direct text extraction"}
                    </p>
                  </div>
                </div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-stone-700">
                  {page.rawText ?? "No extracted text was stored for this page."}
                </pre>
              </article>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <DocumentReviewForm
            reviewTaskId={reviewTask.id}
            status={reviewTask.status}
            fields={extractedRecord.fields}
          />

          <section className="rounded-[1.5rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <p className="text-sm font-semibold tracking-[0.22em] text-stone-400 uppercase">
              Review history
            </p>
            <div className="mt-5 space-y-3">
              {reviewTask.approvalActions.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-stone-300">
                  No reviewer actions recorded yet.
                </p>
              ) : (
                reviewTask.approvalActions.map((action) => (
                  <article key={action.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-stone-100">
                      {approvalActionLabels[action.action]}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">{action.createdAt.toLocaleString()}</p>
                    <p className="mt-2 text-xs text-stone-300">Actor: {action.actorUserId}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
