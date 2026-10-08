import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Prisma } from "@/generated/prisma/client";
import { HubSpotSyncPanel } from "@/components/hubspot-sync-panel";
import { LeadPlaceholderPanel } from "@/components/lead-placeholder-panel";
import { LeadRetryActions } from "@/components/lead-retry-actions";
import { SalesAssistPanel } from "@/components/sales-assist-panel";
import { evaluateQualifiedLeadFlowAudit } from "@/features/leads/audit-flow";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import { getHubSpotConnectionState } from "@/features/hubspot/connection";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Briefcase,
  Globe,
  ShieldCheck,
  Zap,
  Clock,
  TrendingUp,
  BarChart3,
  Bot,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ leadId: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const lead = await prisma.lead.findFirst({
    where: { id: resolvedParams.leadId },
    select: { fullName: true, companyName: true },
  });
  if (!lead) {
    return { title: "Lead Not Found — Revenue & Ops Automation Hub" };
  }
  return {
    title: `${lead.fullName} (${lead.companyName ?? "Unknown"}) — Revenue & Ops Automation Hub`,
    description: `Lead profile, AI scoring, enrichment data, sales assist, and HubSpot sync status for ${lead.fullName}.`,
  };
}

type EnrichmentPanelData = {
  provider: string;
  status: string;
  enrichedAt: Date;
  rawPayloadJson: Prisma.JsonValue | null;
  normalizedData: {
    companyDescription?: string;
    industry?: string;
    employeeRange?: string;
    website?: string;
    linkedInUrl?: string;
    technologies: string[];
    foundedYear?: number;
  };
};

type LeadScorePanelData = {
  numericScore: number;
  fitLabel: string;
  reasoning: string;
  missingFields: string[];
  confidenceScore: number;
  modelUsed: string;
  promptVersion: string;
  scoredAt: Date;
};

type SalesAssistArtifactPanelData = {
  type: "summary" | "followup" | "brief";
  content: string;
  modelUsed: string;
  promptVersion: string;
  generatedAt: Date;
};

type HubSpotSyncPanelData = {
  syncStatus: "pending" | "synced" | "failed" | "retrying";
  externalContactId: string | null;
  errorMessage: string | null;
  contactUrl: string | null;
  lastSyncedAt: Date | null;
  retryCount: number;
};

type LeadDetailPageProps = {
  params: Promise<{
    leadId: string;
  }>;
  searchParams: Promise<{
    fromPage?: string;
    status?: string;
  }>;
};

function describeAuditEvent(
  eventType: string,
  metadataJson: Prisma.JsonValue | null
) {
  switch (eventType) {
    case "lead.created": {
      const metadata =
        metadataJson &&
        typeof metadataJson === "object" &&
        !Array.isArray(metadataJson)
          ? (metadataJson as Record<string, Prisma.JsonValue>)
          : null;
      const sourceType =
        metadata &&
        "sourceType" in metadata &&
        typeof metadata.sourceType === "string"
          ? metadata.sourceType
          : "form";

      return `Lead captured via ${sourceType}.`;
    }
    case "lead.process.started":
      return "Background processing started.";
    case "lead.process.enqueued":
      return "Background processing was queued.";
    case "lead.process.completed":
      return "Background processing completed successfully.";
    case "lead.process.failed":
      return "Background processing failed after multiple attempts.";
    case "lead.process.retry_scheduled":
      return "Processing failed; retrying in the background.";
    case "lead.process.enqueue_failed":
      return "Background processing could not be queued.";
    case "lead.enrich.started":
      return "Enrichment started with the mock provider.";
    case "lead.enrich.completed":
      return "Enrichment completed successfully.";
    case "lead.enrich.partial":
      return "Enrichment completed with partial data.";
    case "lead.enrich.failed":
      return "Enrichment failed after multiple attempts.";
    case "lead.enrich.retry_scheduled":
      return "Enrichment failed; retrying in the background.";
    case "lead.score.started":
      return "AI scoring started.";
    case "lead.score.completed": {
      const metadata = getObjectValue(metadataJson);
      const finalStatus = getStringValue(metadata, "finalStatus");

      if (finalStatus === "review_needed") {
        return "AI scoring completed and routed this lead to review.";
      }

      if (finalStatus === "qualified") {
        return "AI scoring completed and marked this lead qualified.";
      }

      if (finalStatus === "low_priority") {
        return "AI scoring completed and marked this lead low priority.";
      }

      return "AI scoring completed.";
    }
    case "lead.score.failed":
      return "AI scoring failed after multiple attempts.";
    case "lead.score.retry_scheduled":
      return "AI scoring failed; retrying in the background.";
    case "lead.sales_assist.generated": {
      const metadata = getObjectValue(metadataJson);
      const artifactType = getStringValue(metadata, "artifactType");

      if (artifactType === "followup") {
        return "Generated a new follow-up draft.";
      }

      if (artifactType === "brief") {
        return "Generated a new meeting brief.";
      }

      if (artifactType === "summary") {
        return "Generated a new lead summary.";
      }

      return "Generated a sales assist artifact.";
    }
    case "lead.hubspot_sync.started":
      return "HubSpot sync started.";
    case "lead.hubspot_sync.completed":
      return "HubSpot contact sync completed.";
    case "lead.hubspot_sync.failed":
      return "HubSpot sync failed after multiple attempts.";
    case "lead.hubspot_sync.retry_scheduled":
      return "HubSpot sync failed; retrying in the background.";
    case "lead.hubspot_sync.skipped":
      return "HubSpot sync was skipped because the workspace is not connected.";
    case "lead.hubspot_sync.enqueued":
      return "HubSpot sync was queued.";
    case "notification.slack.enqueued":
      return "Slack notification was queued.";
    case "notification.slack.sent":
      return "Slack notification was delivered.";
    case "notification.slack.skipped":
      return "Slack notification was skipped.";
    case "notification.slack.failed":
      return "Slack notification failed after multiple attempts.";
    case "notification.slack.retry_scheduled":
      return "Slack notification failed; retrying in the background.";
    case "integration.hubspot.connected":
      return "HubSpot was connected for this workspace.";
    case "integration.hubspot.disconnected":
      return "HubSpot was disconnected for this workspace.";
    case "lead.import.started":
      return "CSV batch import started.";
    case "lead.import.completed":
      return "CSV batch import completed.";
    default:
      return eventType.replace(/\./g, " ");
  }
}

function describeAuditMetadata(metadataJson: Prisma.JsonValue | null) {
  const metadata = getObjectValue(metadataJson);

  if (!metadata) {
    return null;
  }

  const highlights = [
    getStringValue(metadata, "provider"),
    getStringValue(metadata, "notificationType"),
    getStringValue(metadata, "fitLabel"),
    getStringValue(metadata, "finalStatus"),
    getStringValue(metadata, "syncStatus"),
    getStringValue(metadata, "reason"),
    getStringValue(metadata, "error"),
  ].filter((value): value is string => Boolean(value));

  if (highlights.length === 0) {
    return null;
  }

  return highlights.join(" · ");
}

function getObjectValue(
  value: Prisma.JsonValue | null
): Record<string, Prisma.JsonValue> | null {
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
  return typeof candidate === "string" ? candidate : undefined;
}

function getNumberValue(
  value: Record<string, Prisma.JsonValue> | null,
  key: string
) {
  const candidate = value?.[key];
  return typeof candidate === "number" ? candidate : undefined;
}

function getStringArrayValue(
  value: Record<string, Prisma.JsonValue> | null,
  key: string
) {
  const candidate = value?.[key];

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item): item is string => typeof item === "string");
}

function parseEnrichmentPanelData(
  enrichment: {
    provider: string;
    status: string;
    enrichedAt: Date;
    rawPayloadJson: Prisma.JsonValue | null;
    normalizedData: Prisma.JsonValue | null;
  } | null
): EnrichmentPanelData | null {
  if (!enrichment) {
    return null;
  }

  const normalized = getObjectValue(enrichment.normalizedData);

  return {
    provider: enrichment.provider,
    status: enrichment.status,
    enrichedAt: enrichment.enrichedAt,
    rawPayloadJson: enrichment.rawPayloadJson,
    normalizedData: {
      companyDescription: getStringValue(normalized, "companyDescription"),
      industry: getStringValue(normalized, "industry"),
      employeeRange: getStringValue(normalized, "employeeRange"),
      website: getStringValue(normalized, "website"),
      linkedInUrl: getStringValue(normalized, "linkedInUrl"),
      technologies: getStringArrayValue(normalized, "technologies"),
      foundedYear: getNumberValue(normalized, "foundedYear"),
    },
  };
}

function parseLeadScorePanelData(
  score: {
    numericScore: number;
    fitLabel: string;
    reasoning: string;
    missingDataJson: Prisma.JsonValue | null;
    confidenceScore: number;
    modelUsed: string;
    promptVersion: string;
    scoredAt: Date;
  } | null
): LeadScorePanelData | null {
  if (!score) {
    return null;
  }

  return {
    numericScore: score.numericScore,
    fitLabel: score.fitLabel,
    reasoning: score.reasoning,
    missingFields: Array.isArray(score.missingDataJson)
      ? score.missingDataJson.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    confidenceScore: score.confidenceScore,
    modelUsed: score.modelUsed,
    promptVersion: score.promptVersion,
    scoredAt: score.scoredAt,
  };
}

function buildSalesAssistCards(
  artifacts: SalesAssistArtifactPanelData[]
): Array<{
  type: "summary" | "followup" | "brief";
  title: string;
  description: string;
  content?: string;
  modelUsed?: string;
  promptVersion?: string;
  generatedAt?: string;
}> {
  const artifactMap = new Map<
    SalesAssistArtifactPanelData["type"],
    SalesAssistArtifactPanelData
  >(artifacts.map((artifact) => [artifact.type, artifact] as const));

  const baseCards: Array<{
    type: SalesAssistArtifactPanelData["type"];
    title: string;
    description: string;
  }> = [
    {
      type: "summary",
      title: "Summary",
      description:
        "Create a concise internal overview of the lead, company, and fit rationale.",
    },
    {
      type: "followup",
      title: "Follow-up",
      description:
        "Create a personalized first outreach email based on the current lead context.",
    },
    {
      type: "brief",
      title: "Meeting brief",
      description:
        "Create a structured prep brief with talking points, discovery questions, and risks.",
    },
  ];

  return baseCards.map((card) => {
    const artifact = artifactMap.get(card.type);

    return {
      ...card,
      content: artifact?.content,
      modelUsed: artifact?.modelUsed,
      promptVersion: artifact?.promptVersion,
      generatedAt: artifact?.generatedAt?.toLocaleString(),
    };
  });
}

function parseHubSpotSyncPanelData(
  syncRecord: {
    syncStatus: "pending" | "synced" | "failed" | "retrying";
    externalContactId: string | null;
    errorMessage: string | null;
    contactUrl: string | null;
    lastSyncedAt: Date | null;
    retryCount: number;
  } | null
): HubSpotSyncPanelData | null {
  if (!syncRecord) {
    return null;
  }

  return {
    syncStatus: syncRecord.syncStatus,
    externalContactId: syncRecord.externalContactId,
    errorMessage: syncRecord.errorMessage,
    contactUrl: syncRecord.contactUrl,
    lastSyncedAt: syncRecord.lastSyncedAt,
    retryCount: syncRecord.retryCount,
  };
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: LeadDetailPageProps) {
  const workspaceContext = await requireWorkspaceContext();
  const hubSpotConnectionState = await getHubSpotConnectionState(
    workspaceContext.workspaceId
  );
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const lead = await prisma.lead.findFirst({
    where: {
      id: resolvedParams.leadId,
      workspaceId: workspaceContext.workspaceId,
    },
  });

  if (!lead) {
    notFound();
  }
  const [
    leadSource,
    latestEnrichmentRecord,
    latestScoreRecord,
    latestArtifacts,
    latestHubSpotSyncRecord,
  ] =
    await Promise.all([
    prisma.leadSource.findFirst({
      where: {
        id: lead.leadSourceId,
        workspaceId: workspaceContext.workspaceId,
      },
    }),
    prisma.$queryRaw<
      Array<{
        provider: string;
        status: string;
        enrichedAt: Date;
        rawPayloadJson: Prisma.JsonValue | null;
        normalizedData: Prisma.JsonValue | null;
      }>
    >`SELECT "provider", "status"::text AS "status", "enrichedAt", "rawPayloadJson", "normalizedData"
       FROM "LeadEnrichment"
       WHERE "leadId" = ${lead.id} AND "workspaceId" = ${workspaceContext.workspaceId}
       ORDER BY "enrichedAt" DESC
       LIMIT 1`,
    prisma.$queryRaw<
      Array<{
        numericScore: number;
        fitLabel: string;
        reasoning: string;
        missingDataJson: Prisma.JsonValue | null;
        confidenceScore: number;
        modelUsed: string;
        promptVersion: string;
        scoredAt: Date;
      }>
    >`SELECT "numericScore", "fitLabel"::text AS "fitLabel", "reasoning", "missingDataJson", "confidenceScore", "modelUsed", "promptVersion", "scoredAt"
       FROM "LeadScore"
       WHERE "leadId" = ${lead.id} AND "workspaceId" = ${workspaceContext.workspaceId}
       LIMIT 1`,
    prisma.$queryRaw<
      Array<{
        type: "summary" | "followup" | "brief";
        content: string;
        modelUsed: string;
        promptVersion: string;
        generatedAt: Date;
      }>
    >`SELECT DISTINCT ON ("type")
        "type"::text AS "type",
        "content",
        "modelUsed",
        "promptVersion",
        "generatedAt"
      FROM "SalesAssistArtifact"
      WHERE "leadId" = ${lead.id} AND "workspaceId" = ${workspaceContext.workspaceId}
      ORDER BY "type", "generatedAt" DESC`,
    prisma.$queryRaw<
      Array<{
        syncStatus: "pending" | "synced" | "failed" | "retrying";
        externalContactId: string | null;
        errorMessage: string | null;
        contactUrl: string | null;
        lastSyncedAt: Date | null;
        retryCount: number;
      }>
    >`SELECT
        "syncStatus"::text AS "syncStatus",
        "externalContactId",
        "errorMessage",
        "contactUrl",
        "lastSyncedAt",
        "retryCount"
      FROM "CRMContactSync"
      WHERE "leadId" = ${lead.id} AND "workspaceId" = ${workspaceContext.workspaceId}
      LIMIT 1`,
  ]);

  const auditEvents = await prisma.auditLog.findMany({
    where: {
      workspaceId: workspaceContext.workspaceId,
      entityType: "lead",
      entityId: lead.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  const latestEnrichment = parseEnrichmentPanelData(latestEnrichmentRecord[0] ?? null);
  const latestScore = parseLeadScorePanelData(latestScoreRecord[0] ?? null);
  const salesAssistCards = buildSalesAssistCards(latestArtifacts);
  const latestHubSpotSync = parseHubSpotSyncPanelData(
    latestHubSpotSyncRecord[0] ?? null
  );
  const flowAudit = evaluateQualifiedLeadFlowAudit(
    auditEvents.map((event) => event.eventType)
  );
  const showEnrichmentRetry = lead.status === "enrichment_failed";
  const showScoringRetry =
    !latestScore &&
    auditEvents.some((event) => event.eventType === "lead.score.failed");
  const backParams = new URLSearchParams();

  if (resolvedSearchParams.fromPage) {
    backParams.set("page", resolvedSearchParams.fromPage);
  }

  if (resolvedSearchParams.status) {
    backParams.set("status", resolvedSearchParams.status);
  }

  const backHref = backParams.toString()
    ? `/leads?${backParams.toString()}`
    : "/leads";

  return (
    <div className="space-y-10 pb-12">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5 md:p-12">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-bold text-stone-400 transition hover:text-stone-900 mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pipeline
        </Link>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-[10px] font-bold tracking-widest text-stone-500 uppercase">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              Verified Prospect
            </div>
            <h2 className="text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl">
              {lead.fullName}
            </h2>
            <div className="flex items-center gap-3 text-lg text-stone-500">
               <Building2 className="h-5 w-5 text-stone-400" />
               <span className="font-medium text-stone-900">{lead.companyName}</span>
            </div>
          </div>
          <LeadStatusBadge status={lead.status} />
        </div>
      </section>

      <div className="grid gap-10 xl:grid-cols-[1fr_400px]">
        <div className="space-y-10">
          <section className="rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5 md:p-12">
            <div className="flex items-center gap-3 border-b border-stone-900/5 pb-8">
              <Mail className="h-5 w-5 text-amber-500" />
              <h3 className="text-2xl font-semibold tracking-tight text-stone-900">
                Contact Strategy
              </h3>
            </div>
            
            <dl className="mt-8 grid gap-6 sm:grid-cols-2">
              {[
                { label: "Direct Email", val: lead.email, icon: Mail },
                { label: "Primary Phone", val: lead.phone ?? "Not provided", icon: Phone },
                { label: "Job Title", val: lead.jobTitle ?? "Not provided", icon: Briefcase },
                { label: "Company Domain", val: lead.companyDomain ?? "Not provided", icon: Globe },
              ].map((item) => (
                <div key={item.label} className="group rounded-[1.5rem] border border-stone-900/5 bg-stone-50/50 p-6 transition-colors hover:bg-white hover:shadow-xl hover:shadow-stone-900/5">
                  <dt className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
                    <item.icon className="h-3 w-3" />
                    {item.label}
                  </dt>
                  <dd className="mt-3 text-sm font-bold text-stone-900 truncate">
                    {item.val}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5 md:p-12">
            <div className="flex items-center gap-3 border-b border-stone-900/5 pb-8">
              <Building2 className="h-5 w-5 text-amber-500" />
              <h3 className="text-2xl font-semibold tracking-tight text-stone-900">
                Institutional Context
              </h3>
            </div>
            
            <dl className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="group rounded-[1.5rem] border border-stone-900/5 bg-stone-50/50 p-6 transition-colors hover:bg-white">
                <dt className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Industry Focus</dt>
                <dd className="mt-3 text-sm font-bold text-stone-900">{lead.industry ?? "Unknown"}</dd>
              </div>
              <div className="group rounded-[1.5rem] border border-stone-900/5 bg-stone-50/50 p-6 transition-colors hover:bg-white">
                <dt className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Org Size Range</dt>
                <dd className="mt-3 text-sm font-bold text-stone-900">{lead.employeeRange ?? "Unknown"}</dd>
              </div>
              <div className="sm:col-span-2 group rounded-[1.5rem] border border-stone-900/5 bg-stone-900 p-6 text-white">
                <dt className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">Origination Source</dt>
                <dd className="mt-3 flex items-center gap-3 text-sm font-bold">
                   <div className="h-2 w-2 rounded-full bg-amber-500" />
                   {leadSource?.name ?? "Unknown source"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5 md:p-12">
            <div className="flex items-center justify-between border-b border-stone-900/5 pb-8">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-500" />
                <h3 className="text-2xl font-semibold tracking-tight text-stone-900">
                  Execution Log
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className={[
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase",
                  flowAudit.isComplete ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500"
                ].join(" ")}>
                  {flowAudit.completedSteps}/{flowAudit.totalSteps} pipeline verified
                </div>
                <Link
                  href={`/audit-log?entityType=lead&entityId=${lead.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-[10px] font-bold tracking-widest text-stone-500 uppercase transition hover:border-stone-300 hover:text-stone-900"
                >
                  View full audit log
                </Link>
              </div>
            </div>

            <div className="mt-8 space-y-6">
              {auditEvents.length === 0 ? (
                <div className="rounded-[2rem] border-2 border-dashed border-stone-100 bg-stone-50/50 py-12 text-center">
                   <p className="text-sm text-stone-500">No activity logged.</p>
                </div>
              ) : (
                auditEvents.map((event, idx) => (
                  <div key={event.id} className="relative pl-10">
                    {idx !== auditEvents.length - 1 && (
                      <div className="absolute left-[11px] top-6 h-full w-[2px] bg-stone-100" />
                    )}
                    <div className="absolute left-0 top-1 h-6 w-6 rounded-full border-4 border-white bg-amber-500 shadow-sm" />
                    
                    <div className="rounded-2xl border border-stone-900/5 bg-stone-50/30 p-5 group transition-colors hover:bg-white">
                       <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                         <p className="text-sm font-bold text-stone-900">
                           {describeAuditEvent(event.eventType, event.metadataJson as Prisma.JsonValue | null)}
                         </p>
                         <time className="text-[10px] font-bold tracking-widest text-stone-400 uppercase tabular-nums">
                            {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(event.createdAt)}
                         </time>
                       </div>
                       
                       <div className="mt-3 flex flex-wrap items-center gap-3">
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">{event.eventType}</span>
                          {event.actorUserId && (
                             <>
                               <span className="h-1 w-1 rounded-full bg-stone-200" />
                               <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">By AI Agent</span>
                             </>
                          )}
                       </div>

                       {describeAuditMetadata(event.metadataJson as Prisma.JsonValue | null) && (
                          <div className="mt-4 rounded-xl bg-white/50 p-3 border border-stone-900/5 text-xs text-stone-600 leading-relaxed italic shadow-sm">
                             {describeAuditMetadata(event.metadataJson as Prisma.JsonValue | null)}
                          </div>
                       )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <LeadRetryActions
            leadId={lead.id}
            showEnrichmentRetry={showEnrichmentRetry}
            showScoringRetry={showScoringRetry}
          />
        </div>

        <aside className="space-y-10">
          {latestScore ? (
            <section className="h-fit sticky top-6 space-y-8 rounded-[2.5rem] border border-stone-900/10 bg-stone-900 p-8 text-stone-50 shadow-2xl shadow-stone-900/20">
              <div className="flex items-start justify-between">
                 <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
                       <Zap className="h-3 w-3 text-amber-500 fill-amber-500" />
                       Intelligence
                    </div>
                    <h3 className="text-5xl font-bold tracking-tighter tabular-nums">
                       {latestScore.numericScore}
                    </h3>
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-widest">Aggregate Lead Score</p>
                 </div>
                 <div className={[
                   "rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest",
                   latestScore.fitLabel === "high_fit" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                 ].join(" ")}>
                   {latestScore.fitLabel.replace("_", " ")}
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="rounded-[1.5rem] border border-white/5 bg-white/[0.03] p-6 space-y-4">
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">Confidence Interval</span>
                       <span className="text-xs font-bold tabular-nums text-white">{Math.round(latestScore.confidenceScore * 100)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                       <div 
                         className="h-full bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]" 
                         style={{ width: `${Math.round(latestScore.confidenceScore * 100)}%` }} 
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <p className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">Strategic Rationale</p>
                    <p className="text-sm leading-relaxed text-stone-300">
                       {latestScore.reasoning}
                    </p>
                 </div>

                 <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
                    <div>
                       <p className="text-[9px] font-bold tracking-widest text-stone-500 uppercase">Analyst Model</p>
                       <p className="mt-1 text-[11px] font-bold text-stone-400 truncate">{latestScore.modelUsed}</p>
                    </div>
                    <div>
                       <p className="text-[9px] font-bold tracking-widest text-stone-500 uppercase">Runtime Version</p>
                       <p className="mt-1 text-[11px] font-bold text-stone-400 truncate">v{latestScore.promptVersion}</p>
                    </div>
                 </div>
              </div>
            </section>
          ) : (
            <LeadPlaceholderPanel
              eyebrow="Intelligence"
              title="Awaiting analysis"
              description="This lead is currently in the enrichment queue. Once processing is complete, a strategic score and fit rationale will appear here."
            />
          )}

          {latestEnrichment ? (
            <section className="rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5 transition-all hover:shadow-stone-900/10">
              <div className="flex items-start justify-between border-b border-stone-900/5 pb-6">
                 <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
                       <BarChart3 className="h-3 w-3" />
                       Enrichment
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-stone-900 truncate">Firmographic Data</h3>
                 </div>
                 <div className="rounded-lg bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-500 uppercase">
                    {latestEnrichment.provider}
                 </div>
              </div>

              <div className="mt-6 space-y-6">
                 <div className="space-y-2">
                    <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Institutional Overview</p>
                    <p className="text-xs leading-relaxed text-stone-600 line-clamp-4">
                       {latestEnrichment.normalizedData.companyDescription ?? "No institutional data available for this entity."}
                    </p>
                 </div>

                 <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="p-3 rounded-2xl bg-stone-50">
                       <p className="text-[9px] font-bold tracking-widest text-stone-400 uppercase">Est. Founded</p>
                       <p className="mt-1 text-xs font-bold text-stone-900">{latestEnrichment.normalizedData.foundedYear ?? "—"}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-stone-50">
                       <p className="text-[9px] font-bold tracking-widest text-stone-400 uppercase">Domain Link</p>
                       {latestEnrichment.normalizedData.website ? (
                         <a href={latestEnrichment.normalizedData.website} target="_blank" className="mt-1 block text-xs font-bold text-amber-600 hover:underline truncate">
                           {latestEnrichment.normalizedData.website.replace(/^https?:\/\//, '')}
                         </a>
                       ) : <p className="mt-1 text-xs font-bold text-stone-400">—</p>}
                    </div>
                 </div>

                 <div className="space-y-3 pt-2">
                    <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Tech Stack Identified</p>
                    <div className="flex flex-wrap gap-1.5">
                       {latestEnrichment.normalizedData.technologies.slice(0, 6).map(tech => (
                         <span key={tech} className="rounded-full border border-stone-900/5 bg-white px-2.5 py-1 text-[10px] font-bold text-stone-600 uppercase">
                            {tech}
                         </span>
                       ))}
                       {latestEnrichment.normalizedData.technologies.length > 6 && (
                         <span className="text-[10px] font-bold text-stone-400 px-2 py-1">+{latestEnrichment.normalizedData.technologies.length - 6} more</span>
                       )}
                    </div>
                 </div>
              </div>
            </section>
          ) : (
            <LeadPlaceholderPanel
              eyebrow="Firmographics"
              title="Manual Review Only"
              description="No automated enrichment records found. Analysis may have been skipped or failed due to domain validation issues."
            />
          )}

          <div className="rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5">
             <div className="flex items-center gap-2 mb-8 border-b border-stone-900/5 pb-6">
                <Bot className="h-5 w-5 text-amber-500" />
                <h3 className="text-xl font-bold tracking-tight text-stone-900">AI Sales Agent</h3>
             </div>
             <SalesAssistPanel
               leadId={lead.id}
               isReady={!!latestScore}
               cards={salesAssistCards}
             />
          </div>

          <div className="rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5">
             <div className="flex items-center gap-2 mb-8 border-b border-stone-900/5 pb-6">
                <TrendingUp className="h-5 w-5 text-amber-500" />
                <h3 className="text-xl font-bold tracking-tight text-stone-900">CRM Synchronization</h3>
             </div>
             <HubSpotSyncPanel
               leadId={lead.id}
               leadStatus={lead.status}
               workspaceConnected={hubSpotConnectionState.isConnected}
               syncRecord={latestHubSpotSync ? {
                 syncStatus: latestHubSpotSync.syncStatus,
                 externalContactId: latestHubSpotSync.externalContactId,
                 errorMessage: latestHubSpotSync.errorMessage,
                 contactUrl: latestHubSpotSync.contactUrl,
                 lastSyncedAt: latestHubSpotSync.lastSyncedAt?.toLocaleString() ?? null,
                 retryCount: latestHubSpotSync.retryCount,
               } : null}
             />
          </div>
        </aside>
      </div>
    </div>
  );
}
