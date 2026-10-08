import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";
import {
  formatConfidencePercent,
  getReviewStatusClasses,
  reviewEntityTypeLabels,
  reviewTaskStatusLabels,
} from "@/features/review/config";

export const metadata: Metadata = {
  title: "Review Queue — Revenue & Ops Automation Hub",
  description:
    "Inspect and resolve low-confidence document extractions and lead scoring results before they move downstream.",
};

type ReviewQueuePageProps = {
  searchParams: Promise<{
    entityType?: string;
    status?: string;
  }>;
};

export default async function ReviewQueuePage({
  searchParams,
}: ReviewQueuePageProps) {
  const workspaceContext = await requireWorkspaceContext();
  const resolvedSearchParams = await searchParams;
  const entityType =
    resolvedSearchParams.entityType === "document" || resolvedSearchParams.entityType === "lead"
      ? resolvedSearchParams.entityType
      : "all";
  const status =
    resolvedSearchParams.status === "approved" || resolvedSearchParams.status === "rejected"
      ? resolvedSearchParams.status
      : resolvedSearchParams.status === "all"
        ? "all"
        : "pending";

  const reviewTasks = await prisma.reviewTask.findMany({
    where: {
      workspaceId: workspaceContext.workspaceId,
      ...(entityType === "all" ? {} : { entityType }),
      ...(status === "all" ? {} : { status }),
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const documentIds = reviewTasks
    .filter((task) => task.entityType === "document")
    .map((task) => task.entityId);
  const leadIds = reviewTasks
    .filter((task) => task.entityType === "lead")
    .map((task) => task.entityId);

  const [documents, leads] = await Promise.all([
    documentIds.length > 0
      ? prisma.document.findMany({
          where: {
            workspaceId: workspaceContext.workspaceId,
            id: {
              in: documentIds,
            },
          },
          include: {
            extractedRecords: {
              orderBy: {
                extractedAt: "desc",
              },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    leadIds.length > 0
      ? prisma.lead.findMany({
          where: {
            workspaceId: workspaceContext.workspaceId,
            id: {
              in: leadIds,
            },
          },
          include: {
            score: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const documentMap = new Map(
    documents.map((document) => [
      document.id,
      {
        name: document.fileName,
        confidence: document.extractedRecords[0]?.confidenceScore ?? null,
      },
    ])
  );
  const leadMap = new Map(
    leads.map((lead) => [
      lead.id,
      {
        name: lead.fullName,
        confidence: lead.score?.confidenceScore ?? null,
      },
    ])
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-stone-900/10 bg-white p-7 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
              Review queue
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">
              Resolve low-confidence automation before it moves downstream.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
              Review tasks are created automatically when document extraction or
              lead scoring confidence drops below the handoff threshold.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/api/review-tasks/export?format=json"
              className="rounded-full border border-stone-900/15 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-900/30"
            >
              Export approved JSON
            </a>
            <a
              href="/api/review-tasks/export?format=csv"
              className="rounded-full border border-stone-900/15 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-900/30"
            >
              Export approved CSV
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {[
            { label: "All entities", value: "all" },
            { label: "Documents", value: "document" },
            { label: "Leads", value: "lead" },
          ].map((filter) => {
            const active = entityType === filter.value;
            return (
              <Link
                key={filter.value}
                href={`/review-queue?entityType=${filter.value}&status=${status}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-stone-900 text-white"
                    : "border border-stone-900/15 text-stone-700 hover:border-stone-900/30"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}

          {[
            { label: "Pending", value: "pending" },
            { label: "Approved", value: "approved" },
            { label: "Rejected", value: "rejected" },
            { label: "All statuses", value: "all" },
          ].map((filter) => {
            const active = status === filter.value;
            return (
              <Link
                key={filter.value}
                href={`/review-queue?entityType=${entityType}&status=${filter.value}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-amber-500 text-stone-950"
                    : "border border-stone-900/15 text-stone-700 hover:border-stone-900/30"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>

        {reviewTasks.length === 0 ? (
          <div className="mt-6 rounded-[1.5rem] border border-dashed border-stone-900/15 bg-stone-50 p-8">
            <p className="text-lg font-semibold text-stone-900">No review items match the current filters.</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
              Pending document extractions and low-confidence lead scores will
              appear here automatically when automated confidence checks fail.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-stone-900/10">
            <table className="min-w-full border-collapse">
              <thead className="bg-stone-50">
                <tr className="text-left text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">
                  <th className="px-5 py-4">Entity type</th>
                  <th className="px-5 py-4">Item</th>
                  <th className="px-5 py-4">Confidence</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {reviewTasks.map((task) => {
                  const item =
                    task.entityType === "document"
                      ? documentMap.get(task.entityId)
                      : leadMap.get(task.entityId);

                  return (
                    <tr key={task.id} className="border-t border-stone-900/10 text-sm text-stone-700 transition-colors hover:bg-stone-50/80">
                      <td className="px-5 py-4 align-top font-semibold text-stone-900">
                        {reviewEntityTypeLabels[task.entityType]}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <Link
                          href={`/review-queue/${task.id}`}
                          className="font-semibold text-stone-900 transition hover:text-amber-700"
                        >
                          {item?.name ?? `${reviewEntityTypeLabels[task.entityType]} ${task.entityId}`}
                        </Link>
                      </td>
                      <td className="px-5 py-4 align-top text-stone-500">
                        {formatConfidencePercent(item?.confidence)}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${getReviewStatusClasses(
                            task.status
                          )}`}
                        >
                          {reviewTaskStatusLabels[task.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top text-stone-500">
                        {task.createdAt.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
