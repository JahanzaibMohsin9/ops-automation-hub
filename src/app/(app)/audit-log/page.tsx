import Link from "next/link";
import type { Metadata } from "next";
import { Prisma } from "@/generated/prisma/client";
import {
  describeAuditEvent,
  describeAuditMetadata,
} from "@/features/audit/format";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: "Audit Log — Revenue & Ops Automation Hub",
  description:
    "Full workspace activity trail for leads, documents, integrations, and review actions. Filter by event type and date range.",
};

const PAGE_SIZE = 25;

type AuditLogPageProps = {
  searchParams: Promise<{
    eventType?: string;
    entityType?: string;
    entityId?: string;
    start?: string;
    end?: string;
    page?: string;
  }>;
};

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseDateBoundary(value: string | undefined, boundary: "start" | "end") {
  if (!value) {
    return null;
  }

  const normalized = boundary === "start" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildPageHref(
  params: {
    eventType?: string;
    entityType?: string;
    entityId?: string;
    start?: string;
    end?: string;
  },
  page: number
) {
  const searchParams = new URLSearchParams();

  if (params.eventType) {
    searchParams.set("eventType", params.eventType);
  }

  if (params.entityType) {
    searchParams.set("entityType", params.entityType);
  }

  if (params.entityId) {
    searchParams.set("entityId", params.entityId);
  }

  if (params.start) {
    searchParams.set("start", params.start);
  }

  if (params.end) {
    searchParams.set("end", params.end);
  }

  if (page > 1) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();
  return query ? `/audit-log?${query}` : "/audit-log";
}

function getEntityHref(entityType: string, entityId: string | null) {
  if (!entityId) {
    return null;
  }

  if (entityType === "lead") {
    return `/leads/${entityId}`;
  }

  if (entityType === "document") {
    return `/documents/${entityId}`;
  }

  return null;
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const workspaceContext = await requireWorkspaceContext();
  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const startDate = parseDateBoundary(resolvedSearchParams.start, "start");
  const endDate = parseDateBoundary(resolvedSearchParams.end, "end");

  const where: Prisma.AuditLogWhereInput = {
    workspaceId: workspaceContext.workspaceId,
    ...(resolvedSearchParams.eventType
      ? { eventType: resolvedSearchParams.eventType }
      : {}),
    ...(resolvedSearchParams.entityType
      ? { entityType: resolvedSearchParams.entityType }
      : {}),
    ...(resolvedSearchParams.entityId
      ? { entityId: resolvedSearchParams.entityId }
      : {}),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {}),
  };

  const [auditEvents, totalCount, distinctEventTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where: {
        workspaceId: workspaceContext.workspaceId,
      },
      distinct: ["eventType"],
      orderBy: {
        eventType: "asc",
      },
      select: {
        eventType: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-stone-900/10 bg-white p-7 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <ScrollText className="h-3.5 w-3.5" />
              Audit log
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-900">
              Workspace activity trail
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
              Review pipeline activity across leads, documents, integrations, and review actions. Filters are applied server-side so the log stays useful as the dataset grows.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Showing {(page - 1) * PAGE_SIZE + (auditEvents.length > 0 ? 1 : 0)}-
            {(page - 1) * PAGE_SIZE + auditEvents.length} of {totalCount}
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <form className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]">
          <label className="space-y-2 text-sm">
            <span className="inline-flex items-center gap-2 font-semibold text-stone-700">
              <Filter className="h-4 w-4 text-stone-400" />
              Event type
            </span>
            <select
              name="eventType"
              defaultValue={resolvedSearchParams.eventType ?? ""}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="">All event types</option>
              {distinctEventTypes.map((event) => (
                <option key={event.eventType} value={event.eventType}>
                  {event.eventType}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="inline-flex items-center gap-2 font-semibold text-stone-700">
              <CalendarDays className="h-4 w-4 text-stone-400" />
              Start date
            </span>
            <input
              type="date"
              name="start"
              defaultValue={resolvedSearchParams.start ?? ""}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-semibold text-stone-700">End date</span>
            <input
              type="date"
              name="end"
              defaultValue={resolvedSearchParams.end ?? ""}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
          </label>

          <div className="flex items-end gap-3">
            {resolvedSearchParams.entityType ? (
              <input type="hidden" name="entityType" value={resolvedSearchParams.entityType} />
            ) : null}
            {resolvedSearchParams.entityId ? (
              <input type="hidden" name="entityId" value={resolvedSearchParams.entityId} />
            ) : null}
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Apply filters
            </button>
            <Link
              href={
                resolvedSearchParams.entityType && resolvedSearchParams.entityId
                  ? `/audit-log?entityType=${resolvedSearchParams.entityType}&entityId=${resolvedSearchParams.entityId}`
                  : "/audit-log"
              }
              className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
            >
              Clear
            </Link>
          </div>
        </form>
      </section>

      <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        {auditEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-8 text-center">
            <p className="text-sm font-semibold text-stone-700">No audit events match these filters.</p>
            <p className="mt-2 text-sm text-stone-500">
              Try clearing the event type filter or widening the date range.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {auditEvents.map((event) => {
              const entityHref = getEntityHref(event.entityType, event.entityId);
              const metadataSummary = describeAuditMetadata(
                event.metadataJson as Prisma.JsonValue | null
              );

              return (
                <article
                  key={event.id}
                  className="rounded-2xl border border-stone-900/10 bg-stone-50/60 p-5"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-stone-900">
                        {describeAuditEvent(
                          event.eventType,
                          event.metadataJson as Prisma.JsonValue | null
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        <span>{event.eventType}</span>
                        <span>•</span>
                        <span>{event.entityType}</span>
                        {event.entityId ? (
                          <>
                            <span>•</span>
                            {entityHref ? (
                              <Link href={entityHref} className="text-amber-700 hover:text-amber-800">
                                Open record
                              </Link>
                            ) : (
                              <span className="break-all normal-case tracking-normal">
                                {event.entityId}
                              </span>
                            )}
                          </>
                        ) : null}
                      </div>
                      {metadataSummary ? (
                        <p className="mt-3 text-sm leading-6 text-stone-600">{metadataSummary}</p>
                      ) : null}
                    </div>
                    <div className="text-sm font-medium text-stone-500">
                      {event.createdAt.toLocaleString()}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-stone-900/10 pt-4">
          <Link
            href={buildPageHref(
              {
                eventType: resolvedSearchParams.eventType,
                entityType: resolvedSearchParams.entityType,
                entityId: resolvedSearchParams.entityId,
                start: resolvedSearchParams.start,
                end: resolvedSearchParams.end,
              },
              Math.max(1, page - 1)
            )}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
              hasPreviousPage
                ? "border border-stone-200 text-stone-700 hover:bg-stone-50"
                : "pointer-events-none border border-stone-100 text-stone-300",
            ].join(" ")}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Link>

          <p className="text-sm text-stone-500">
            Page {page} of {totalPages}
          </p>

          <Link
            href={buildPageHref(
              {
                eventType: resolvedSearchParams.eventType,
                entityType: resolvedSearchParams.entityType,
                entityId: resolvedSearchParams.entityId,
                start: resolvedSearchParams.start,
                end: resolvedSearchParams.end,
              },
              Math.min(totalPages, page + 1)
            )}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
              hasNextPage
                ? "border border-stone-200 text-stone-700 hover:bg-stone-50"
                : "pointer-events-none border border-stone-100 text-stone-300",
            ].join(" ")}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
