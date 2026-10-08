import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";
import { PeriodSelector } from "@/components/period-selector";
import type { PeriodValue } from "@/components/period-selector";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import { DocumentProcessingStatusBadge } from "@/components/document-status-badge";
import {
  Users,
  FileText,
  AlertCircle,
  ArrowRight,
  Activity,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  RefreshCcw,
  ShieldCheck,
  BarChart3,
  ClipboardList,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard — Revenue & Ops Automation Hub",
  description:
    "Live operational metrics for your lead pipeline, document intelligence, CRM sync rates, and processing health.",
};

// ─── Period helpers ───────────────────────────────────────────────────────────

type PeriodBounds = {
  current: { start: Date; end: Date };
  previous: { start: Date; end: Date };
};

function parsePeriod(raw: string | undefined): PeriodValue {
  if (raw === "30d" || raw === "all") return raw;
  return "7d";
}

function getPeriodBounds(period: PeriodValue): PeriodBounds {
  const now = new Date();
  if (period === "all") {
    const epoch = new Date(0);
    return {
      current: { start: epoch, end: now },
      previous: { start: epoch, end: epoch },
    };
  }
  const days = period === "30d" ? 30 : 7;
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(
    currentStart.getTime() - days * 24 * 60 * 60 * 1000
  );
  return {
    current: { start: currentStart, end: now },
    previous: { start: previousStart, end: currentStart },
  };
}

// ─── Trend helper ─────────────────────────────────────────────────────────────

type TrendDirection = "up" | "down" | "flat";

function calcTrend(
  current: number,
  previous: number
): { direction: TrendDirection; pct: number } {
  if (previous === 0 && current === 0) return { direction: "flat", pct: 0 };
  if (previous === 0) return { direction: "up", pct: 100 };
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
    pct: Math.abs(pct),
  };
}

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrendBadge({
  direction,
  pct,
  isGoodUp = true,
}: {
  direction: TrendDirection;
  pct: number;
  isGoodUp?: boolean;
}) {
  if (direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-500">
        <Minus className="h-3 w-3" />
        No change
      </span>
    );
  }
  const isGood = direction === "up" ? isGoodUp : !isGoodUp;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
        isGood
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      ].join(" ")}
    >
      {direction === "up" ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {pct}%
    </span>
  );
}

function MetricCard({
  label,
  value,
  description,
  trendDirection,
  trendPct,
  isGoodUp = true,
  href,
  Icon,
  accent,
}: {
  label: string;
  value: string | number;
  description: string;
  trendDirection: TrendDirection;
  trendPct: number;
  isGoodUp?: boolean;
  href: string;
  Icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group flex min-h-[9rem] flex-col justify-between overflow-hidden rounded-xl border p-5 transition-all duration-200 hover:shadow-md active:scale-[0.99]",
        accent
          ? "border-amber-200 bg-amber-50 hover:border-amber-300"
          : "border-stone-100 bg-white hover:border-stone-200",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div
          className={[
            "flex h-9 w-9 items-center justify-center rounded-lg",
            accent ? "bg-amber-900 text-white" : "bg-stone-900 text-white",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight
          className={[
            "h-4 w-4 transition-transform duration-200 group-hover:translate-x-1",
            accent ? "text-amber-400" : "text-stone-300",
          ].join(" ")}
        />
      </div>

      {/* Value and label */}
      <div className="mt-4">
        <p
          className={[
            "text-[10px] font-bold uppercase tracking-[0.18em]",
            accent ? "text-amber-700" : "text-stone-400",
          ].join(" ")}
        >
          {label}
        </p>
        <p
          className={[
            "mt-1.5 text-3xl font-semibold tabular-nums tracking-tight",
            accent ? "text-amber-900" : "text-stone-900",
          ].join(" ")}
        >
          {value}
        </p>
        <p
          className={[
            "mt-1 text-xs leading-relaxed",
            accent ? "text-amber-700/80" : "text-stone-500",
          ].join(" ")}
        >
          {description}
        </p>
      </div>

      {/* Trend */}
      <div className="mt-3">
        <TrendBadge
          direction={trendDirection}
          pct={trendPct}
          isGoodUp={isGoodUp}
        />
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type DashboardPageProps = {
  searchParams: Promise<{ period?: string }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const workspaceContext = await requireWorkspaceContext();
  const { workspaceId } = workspaceContext;

  const resolvedParams = await searchParams;
  const period = parsePeriod(resolvedParams.period);
  const bounds = getPeriodBounds(period);
  const { current, previous } = bounds;

  // ─── Aggregation queries ───────────────────────────────────────────────────

  const last24hStart = new Date(current.end.getTime() - 24 * 60 * 60 * 1000);

  const [
    // Current-period counts
    leadsCurrentPeriod,
    qualifiedCurrentPeriod,
    syncedCurrentPeriod,
    docsCurrentPeriod,
    reviewCountCurrentPeriod,
    extractedCurrentPeriod,

    // Previous-period counts (for trend arrows)
    leadsPreviousPeriod,
    qualifiedPreviousPeriod,
    syncedPreviousPeriod,
    docsPreviousPeriod,
    reviewCountPreviousPeriod,
    extractedPreviousPeriod,

    // Totals for qualified rate calculation (current period)
    scoredCurrentPeriod,
    scoredPreviousPeriod,

    // Recent items (not period-scoped)
    recentLeads,
    recentDocuments,

    // Review queue summary
    pendingDocumentReviews,
    pendingLeadReviews,

    // Processing health (last 24h)
    leadsLast24h,
    docsLast24h,
  ] = await Promise.all([
    // Lead counts — current period
    prisma.lead.count({
      where: {
        workspaceId,
        processedAt: current.start < current.end
          ? { gte: current.start, lte: current.end }
          : undefined,
      },
    }),
    prisma.lead.count({
      where: {
        workspaceId,
        status: "qualified",
        updatedAt: current.start < current.end
          ? { gte: current.start, lte: current.end }
          : undefined,
      },
    }),
    prisma.cRMContactSync.count({
      where: {
        workspaceId,
        syncStatus: "synced",
        lastSyncedAt: current.start < current.end
          ? { gte: current.start, lte: current.end }
          : undefined,
      },
    }),
    prisma.document.count({
      where: {
        workspaceId,
        createdAt: current.start < current.end
          ? { gte: current.start, lte: current.end }
          : undefined,
      },
    }),
    // Low-confidence review rate — current
    prisma.extractedRecord.count({
      where: {
        workspaceId,
        requiresReview: true,
        extractedAt: current.start < current.end
          ? { gte: current.start, lte: current.end }
          : undefined,
      },
    }),
    prisma.extractedRecord.count({
      where: {
        workspaceId,
        extractedAt: current.start < current.end
          ? { gte: current.start, lte: current.end }
          : undefined,
      },
    }),

    // Lead counts — previous period (skip for "all time")
    period !== "all"
      ? prisma.lead.count({
          where: {
            workspaceId,
            processedAt: { gte: previous.start, lte: previous.end },
          },
        })
      : Promise.resolve(0),
    period !== "all"
      ? prisma.lead.count({
          where: {
            workspaceId,
            status: "qualified",
            updatedAt: { gte: previous.start, lte: previous.end },
          },
        })
      : Promise.resolve(0),
    period !== "all"
      ? prisma.cRMContactSync.count({
          where: {
            workspaceId,
            syncStatus: "synced",
            lastSyncedAt: { gte: previous.start, lte: previous.end },
          },
        })
      : Promise.resolve(0),
    period !== "all"
      ? prisma.document.count({
          where: {
            workspaceId,
            createdAt: { gte: previous.start, lte: previous.end },
          },
        })
      : Promise.resolve(0),
    period !== "all"
      ? prisma.extractedRecord.count({
          where: {
            workspaceId,
            requiresReview: true,
            extractedAt: { gte: previous.start, lte: previous.end },
          },
        })
      : Promise.resolve(0),
    period !== "all"
      ? prisma.extractedRecord.count({
          where: {
            workspaceId,
            extractedAt: { gte: previous.start, lte: previous.end },
          },
        })
      : Promise.resolve(0),

    // Scored totals for qualified rate
    prisma.leadScore.count({
      where: {
        workspaceId,
        scoredAt: current.start < current.end
          ? { gte: current.start, lte: current.end }
          : undefined,
      },
    }),
    period !== "all"
      ? prisma.leadScore.count({
          where: {
            workspaceId,
            scoredAt: { gte: previous.start, lte: previous.end },
          },
        })
      : Promise.resolve(0),

    // Recent 10 leads
    prisma.lead.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        fullName: true,
        companyName: true,
        status: true,
        createdAt: true,
        score: { select: { numericScore: true, fitLabel: true } },
      },
    }),

    // Recent 10 documents
    prisma.document.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        fileName: true,
        documentType: true,
        processingStatus: true,
        uploadStatus: true,
        createdAt: true,
      },
    }),

    // Review queue summary
    prisma.reviewTask.count({
      where: { workspaceId, status: "pending", entityType: "document" },
    }),
    prisma.reviewTask.count({
      where: { workspaceId, status: "pending", entityType: "lead" },
    }),

    // Processing health — last 24h leads
    prisma.lead.groupBy({
      by: ["status"],
      where: {
        workspaceId,
        updatedAt: { gte: last24hStart },
      },
      _count: { id: true },
    }),

    // Processing health — last 24h documents
    prisma.document.groupBy({
      by: ["processingStatus"],
      where: {
        workspaceId,
        updatedAt: { gte: last24hStart },
      },
      _count: { id: true },
    }),
  ]);

  // ─── Derived metrics ───────────────────────────────────────────────────────

  const qualifiedRateCurrent =
    scoredCurrentPeriod === 0
      ? 0
      : Math.round((qualifiedCurrentPeriod / scoredCurrentPeriod) * 100);
  const qualifiedRatePrevious =
    scoredPreviousPeriod === 0
      ? 0
      : Math.round((qualifiedPreviousPeriod / scoredPreviousPeriod) * 100);

  const reviewRateCurrent =
    extractedCurrentPeriod === 0
      ? 0
      : Math.round((reviewCountCurrentPeriod / extractedCurrentPeriod) * 100);
  const reviewRatePrevious =
    extractedPreviousPeriod === 0
      ? 0
      : Math.round((reviewCountPreviousPeriod / extractedPreviousPeriod) * 100);

  // CRM sync success rate = synced / (synced + failed)
  const [totalSyncAttemptsCurrent, totalSyncAttemptsPrevious] =
    await Promise.all([
      prisma.cRMContactSync.count({
        where: {
          workspaceId,
          updatedAt: current.start < current.end
            ? { gte: current.start, lte: current.end }
            : undefined,
        },
      }),
      period !== "all"
        ? prisma.cRMContactSync.count({
            where: {
              workspaceId,
              updatedAt: { gte: previous.start, lte: previous.end },
            },
          })
        : Promise.resolve(0),
    ]);

  const syncSuccessRateCurrent =
    totalSyncAttemptsCurrent === 0
      ? 0
      : Math.round((syncedCurrentPeriod / totalSyncAttemptsCurrent) * 100);
  const syncSuccessRatePrevious =
    totalSyncAttemptsPrevious === 0
      ? 0
      : Math.round((syncedPreviousPeriod / totalSyncAttemptsPrevious) * 100);

  // Average processing time per document, based on end-to-end document lifetime
  // from upload to its latest processed state within the selected period.
  const processedDocumentStatuses = [
    "review_needed",
    "approved",
    "rejected",
    "exported",
    "failed",
  ] as const;

  const processedDocumentsInPeriod = await prisma.document.findMany({
    where: {
      workspaceId,
      processingStatus: { in: [...processedDocumentStatuses] },
      ...(current.start < current.end
        ? { updatedAt: { gte: current.start, lte: current.end } }
        : {}),
    },
    select: {
      createdAt: true,
      updatedAt: true,
    },
  });

  const avgProcessingMs =
    processedDocumentsInPeriod.length === 0
      ? 0
      : Math.round(
          processedDocumentsInPeriod.reduce((total, document) => {
            return total + (document.updatedAt.getTime() - document.createdAt.getTime());
          }, 0) / processedDocumentsInPeriod.length
        );

  const avgProcessingDisplay =
    avgProcessingMs === 0
      ? "—"
      : avgProcessingMs < 1000
      ? `${Math.round(avgProcessingMs)}ms`
      : avgProcessingMs < 60_000
      ? `${(avgProcessingMs / 1000).toFixed(1)}s`
      : avgProcessingMs < 3_600_000
      ? `${(avgProcessingMs / 60_000).toFixed(1)}m`
      : `${(avgProcessingMs / 3_600_000).toFixed(1)}h`;

  // Processing health tallies
  const failedLeadStatuses = new Set([
    "enrichment_failed",
    "sync_failed",
    "review_needed",
  ]);
  const successLeadStatuses = new Set(["qualified", "low_priority"]);

  let leadSuccessCount = 0;
  let leadFailureCount = 0;
  for (const row of leadsLast24h) {
    if (successLeadStatuses.has(row.status)) leadSuccessCount += row._count.id;
    else if (failedLeadStatuses.has(row.status))
      leadFailureCount += row._count.id;
  }

  const failedDocStatuses = new Set(["failed"]);
  const successDocStatuses = new Set(["approved", "exported"]);
  let docSuccessCount = 0;
  let docFailureCount = 0;
  for (const row of docsLast24h) {
    if (successDocStatuses.has(row.processingStatus))
      docSuccessCount += row._count.id;
    else if (failedDocStatuses.has(row.processingStatus))
      docFailureCount += row._count.id;
  }

  const totalHealth24h =
    leadSuccessCount + leadFailureCount + docSuccessCount + docFailureCount;
  const successHealth24h = leadSuccessCount + docSuccessCount;
  const healthRate =
    totalHealth24h === 0
      ? null
      : Math.round((successHealth24h / totalHealth24h) * 100);

  // ─── Metric cards data ─────────────────────────────────────────────────────

  const leadsTrend = calcTrend(leadsCurrentPeriod, leadsPreviousPeriod);
  const qualRateTrend = calcTrend(
    qualifiedRateCurrent,
    qualifiedRatePrevious
  );
  const syncRateTrend = calcTrend(
    syncSuccessRateCurrent,
    syncSuccessRatePrevious
  );
  const docsTrend = calcTrend(docsCurrentPeriod, docsPreviousPeriod);
  const reviewRateTrend = calcTrend(
    reviewRateCurrent,
    reviewRatePrevious
  );

  const metrics = [
    {
      label: "Leads Processed",
      value: leadsCurrentPeriod,
      description: "Lead pipelines completed in this period",
      trend: leadsTrend,
      isGoodUp: true,
      href: "/leads",
      Icon: Users,
      accent: false,
    },
    {
      label: "Qualified Rate",
      value: `${qualifiedRateCurrent}%`,
      description: `${qualifiedCurrentPeriod} of ${scoredCurrentPeriod} scored leads`,
      trend: qualRateTrend,
      isGoodUp: true,
      href: "/leads?status=qualified",
      Icon: CheckCircle2,
      accent: false,
    },
    {
      label: "CRM Sync Rate",
      value: `${syncSuccessRateCurrent}%`,
      description: `${syncedCurrentPeriod} of ${totalSyncAttemptsCurrent} synced to HubSpot`,
      trend: syncRateTrend,
      isGoodUp: true,
      href: "/settings",
      Icon: RefreshCcw,
      accent: false,
    },
    {
      label: "Documents Processed",
      value: docsCurrentPeriod,
      description: "Files uploaded in this period",
      trend: docsTrend,
      isGoodUp: true,
      href: "/documents",
      Icon: FileText,
      accent: false,
    },
    {
      label: "Low-Confidence Review Rate",
      value: `${reviewRateCurrent}%`,
      description: `${reviewCountCurrentPeriod} of ${extractedCurrentPeriod} extractions flagged for review`,
      trend: reviewRateTrend,
      isGoodUp: false,
      href: "/review-queue",
      Icon: AlertCircle,
      accent: reviewCountCurrentPeriod > 0,
    },
    {
      label: "Avg Processing Time",
      value: avgProcessingDisplay,
      description: `Across ${processedDocumentsInPeriod.length} processed documents`,
      trend: { direction: "flat" as TrendDirection, pct: 0 },
      isGoodUp: false,
      href: "/documents",
      Icon: Clock,
      accent: false,
    },
  ];

  // ─── Pending review total for header badge ─────────────────────────────────
  const pendingReviewTotal = pendingDocumentReviews + pendingLeadReviews;

  return (
    <div className="space-y-5 pb-8">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 rounded-xl border border-stone-900/10 bg-stone-950 p-5 text-stone-50 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] uppercase text-stone-400">
            <BarChart3 className="h-3.5 w-3.5 text-amber-500" />
            Analytics Dashboard
          </div>
          <h2 className="truncate text-2xl font-semibold tracking-tight text-white">
            {workspaceContext.workspace.name}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-400">
            Live operational metrics for your lead pipeline and document
            intelligence.
          </p>
        </div>

        {/* Quick stat pills */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
              Total Leads
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">
              {leadsCurrentPeriod}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
              Documents
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">
              {docsCurrentPeriod}
            </p>
          </div>
          {pendingReviewTotal > 0 && (
            <Link
              href="/review-queue"
              className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-4 py-2.5 text-center transition hover:bg-amber-500/30"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                Needs Review
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-amber-200">
                {pendingReviewTotal}
              </p>
            </Link>
          )}
        </div>
      </section>

      {/* ── Period selector ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-stone-700">
            Performance Metrics
          </h3>
          <p className="text-xs text-stone-400">
            {period === "all"
              ? "Showing all-time totals"
              : period === "30d"
              ? "Compared to previous 30-day window"
              : "Compared to previous 7-day window"}
          </p>
        </div>
        <Suspense fallback={null}>
          <PeriodSelector current={period} />
        </Suspense>
      </div>

      {/* ── 6 Metric cards ────────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <MetricCard
            key={m.label}
            label={m.label}
            value={m.value}
            description={m.description}
            trendDirection={m.trend.direction}
            trendPct={m.trend.pct}
            isGoodUp={m.isGoodUp}
            href={m.href}
            Icon={m.Icon}
            accent={m.accent}
          />
        ))}
      </section>

      {/* ── Lower grid: recent + review summary + health ──────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Recent leads (2/3 width) */}
        <section className="lg:col-span-2 rounded-xl border border-stone-900/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                <Users className="h-3 w-3" />
                Lead Pipeline
              </div>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-stone-900">
                Recent Leads
              </h3>
            </div>
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 active:scale-95"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentLeads.length === 0 ? (
            <div className="mt-5 flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50/70 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-stone-300">
                <Users className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-medium text-stone-600">
                No leads yet
              </p>
              <p className="mt-1 max-w-xs text-xs text-stone-400">
                Submit your first lead or import a CSV to start your pipeline.
              </p>
              <Link
                href="/leads"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Go to Leads
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-stone-900/5">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-stone-900/5 bg-stone-50/60 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3 text-right">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-900/5">
                  {recentLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="group text-sm text-stone-600 transition-colors hover:bg-stone-50/70"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-semibold text-stone-900 transition-colors group-hover:text-amber-700"
                        >
                          {lead.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {lead.companyName}
                      </td>
                      <td className="px-4 py-3">
                        <LeadStatusBadge status={lead.status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {lead.score ? (
                          <span
                            className={[
                              "inline-flex h-7 w-10 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                              lead.score.numericScore >= 80
                                ? "bg-emerald-100 text-emerald-800"
                                : lead.score.numericScore >= 50
                                ? "bg-amber-100 text-amber-800"
                                : "bg-stone-100 text-stone-600",
                            ].join(" ")}
                          >
                            {lead.score.numericScore}
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-stone-400">
                        {relativeTime(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right column: Review queue + Processing health */}
        <div className="flex flex-col gap-5">
          {/* Review queue summary */}
          <section className="rounded-xl border border-stone-900/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                  <ClipboardList className="h-3 w-3" />
                  Review Queue
                </div>
                <h3 className="mt-2 text-base font-semibold tracking-tight text-stone-900">
                  Pending Reviews
                </h3>
              </div>
              <Link
                href="/review-queue"
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-100"
              >
                Open
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              <div
                className={[
                  "flex items-center justify-between rounded-lg border px-4 py-3",
                  pendingDocumentReviews > 0
                    ? "border-amber-200 bg-amber-50"
                    : "border-stone-100 bg-stone-50",
                ].join(" ")}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-md",
                      pendingDocumentReviews > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-stone-100 text-stone-400",
                    ].join(" ")}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <span
                    className={[
                      "text-xs font-semibold",
                      pendingDocumentReviews > 0
                        ? "text-amber-800"
                        : "text-stone-500",
                    ].join(" ")}
                  >
                    Documents
                  </span>
                </div>
                <span
                  className={[
                    "text-lg font-bold tabular-nums",
                    pendingDocumentReviews > 0
                      ? "text-amber-700"
                      : "text-stone-300",
                  ].join(" ")}
                >
                  {pendingDocumentReviews}
                </span>
              </div>

              <div
                className={[
                  "flex items-center justify-between rounded-lg border px-4 py-3",
                  pendingLeadReviews > 0
                    ? "border-amber-200 bg-amber-50"
                    : "border-stone-100 bg-stone-50",
                ].join(" ")}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-md",
                      pendingLeadReviews > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-stone-100 text-stone-400",
                    ].join(" ")}
                  >
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <span
                    className={[
                      "text-xs font-semibold",
                      pendingLeadReviews > 0
                        ? "text-amber-800"
                        : "text-stone-500",
                    ].join(" ")}
                  >
                    Leads
                  </span>
                </div>
                <span
                  className={[
                    "text-lg font-bold tabular-nums",
                    pendingLeadReviews > 0
                      ? "text-amber-700"
                      : "text-stone-300",
                  ].join(" ")}
                >
                  {pendingLeadReviews}
                </span>
              </div>

              {pendingReviewTotal === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700">
                    Queue is clear
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Processing health — last 24h */}
          <section className="rounded-xl border border-stone-900/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                <Activity className="h-3 w-3" />
                Health — 24h
              </div>
            </div>
            <h3 className="mt-2 text-base font-semibold tracking-tight text-stone-900">
              Processing Health
            </h3>
            <p className="mt-0.5 text-xs text-stone-400">
              Success/failure rates over the last 24 hours
            </p>

            {totalHealth24h === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50/70 py-6 text-center">
                <Activity className="h-6 w-6 text-stone-200" />
                <p className="mt-2 text-xs text-stone-400">
                  No activity in the last 24 hours
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {/* Health rate gauge */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-500">
                      Overall success rate
                    </span>
                    <span
                      className={[
                        "text-sm font-bold tabular-nums",
                        (healthRate ?? 0) >= 90
                          ? "text-emerald-600"
                          : (healthRate ?? 0) >= 70
                          ? "text-amber-600"
                          : "text-rose-600",
                      ].join(" ")}
                    >
                      {healthRate ?? 0}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={[
                        "h-full rounded-full transition-all duration-500",
                        (healthRate ?? 0) >= 90
                          ? "bg-emerald-500"
                          : (healthRate ?? 0) >= 70
                          ? "bg-amber-500"
                          : "bg-rose-500",
                      ].join(" ")}
                      style={{ width: `${healthRate ?? 0}%` }}
                    />
                  </div>
                </div>

                {/* Counts */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col items-center rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
                      {successHealth24h}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                      Success
                    </p>
                  </div>
                  <div className="flex flex-col items-center rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-center">
                    <XCircle className="h-4 w-4 text-rose-400" />
                    <p className="mt-1 text-xl font-bold tabular-nums text-rose-700">
                      {leadFailureCount + docFailureCount}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">
                      Failed
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Recent documents ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-stone-900/10 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
              <FileText className="h-3 w-3" />
              Document Intelligence
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-stone-900">
              Recent Documents
            </h3>
          </div>
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 active:scale-95"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentDocuments.length === 0 ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50/70 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-stone-300">
              <FileText className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium text-stone-600">
              No documents uploaded yet
            </p>
            <p className="mt-1 max-w-xs text-xs text-stone-400">
              Upload an invoice, onboarding form, or agreement to start
              automated extraction.
            </p>
            <Link
              href="/documents"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
            >
              Upload a document
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-stone-900/5">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-stone-900/5 bg-stone-50/60 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-4 py-3">File name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900/5">
                {recentDocuments.map((doc) => (
                  <tr
                    key={doc.id}
                    className="group text-sm text-stone-600 transition-colors hover:bg-stone-50/70"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="truncate font-semibold text-stone-900 transition-colors group-hover:text-amber-700"
                      >
                        {doc.fileName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                        {doc.documentType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DocumentProcessingStatusBadge
                        status={doc.processingStatus}
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-stone-400">
                      {relativeTime(doc.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
