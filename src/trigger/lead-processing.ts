import { logger, task, tasks } from "@trigger.dev/sdk";
import type { Prisma } from "@/generated/prisma/client";
import {
  HUBSPOT_CONNECTION_MODE,
  HUBSPOT_PROVIDER,
  buildHubSpotContactProperties,
  buildHubSpotContactUrl,
  createHubSpotContact,
  fetchHubSpotAccountDetails,
  findHubSpotContactByEmail,
  getHubSpotConnectionState,
  updateHubSpotContact,
} from "@/features/hubspot/connection";
import { mockEnrichmentProvider } from "@/features/leads/enrichment";
import { scoreLead } from "@/features/leads/score-client";
import { resolveLeadStatusFromScore } from "@/features/leads/scoring";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { runLeadProcessingPipeline } from "@/trigger/lead-processing-pipeline";
import {
  getSlackNotificationIdempotencyKey,
  SEND_SLACK_NOTIFICATION_TASK_ID,
  type SendSlackNotificationPayload,
  type sendSlackNotificationTask,
} from "@/trigger/notifications";

export const LEAD_PROCESS_TASK_ID = "lead.process";
export const LEAD_ENRICH_TASK_ID = "lead.enrich";
export const LEAD_SCORE_TASK_ID = "lead.score";
export const LEAD_HUBSPOT_SYNC_TASK_ID = "lead.syncToHubSpot";

type LeadEnrichmentStatus = "pending" | "success" | "failed" | "partial";
type LeadFitLabel = "high_fit" | "medium_fit" | "low_fit";
type LeadStatusValue =
  | "new"
  | "enriching"
  | "enriched"
  | "scored"
  | "review_needed"
  | "qualified"
  | "low_priority"
  | "enrichment_failed"
  | "sync_failed";

type HubSpotSyncStatus = "pending" | "synced" | "failed" | "retrying";

type EnrichmentRecord = {
  provider: string;
  status: LeadEnrichmentStatus;
  rawPayloadJson: Prisma.JsonValue | null;
  normalizedData: Prisma.JsonValue | null;
};

export type LeadTaskPayload = {
  workspaceId: string;
  entityId: string;
  entityType: "lead";
};

export type LeadProcessResult = {
  leadId: string;
  acknowledged: true;
  message: string;
  enrichmentStatus: LeadEnrichmentStatus;
  fitLabel: LeadFitLabel;
  finalStatus: LeadStatusValue;
};

export type LeadEnrichResult = {
  leadId: string;
  provider: string;
  status: LeadEnrichmentStatus;
  message: string;
};

export type LeadScoreResult = {
  leadId: string;
  fitLabel: LeadFitLabel;
  finalStatus: LeadStatusValue;
  numericScore: number;
  confidenceScore: number;
  message: string;
};

export type LeadHubSpotSyncResult = {
  leadId: string;
  syncStatus: HubSpotSyncStatus;
  externalContactId: string;
  contactUrl: string | null;
  message: string;
};

export function getLeadTaskIdempotencyKey(
  payload: LeadTaskPayload,
  taskId: string
) {
  return [payload.entityType, payload.entityId, taskId].join(":");
}

export function getLeadProcessingIdempotencyKey(payload: LeadTaskPayload) {
  return getLeadTaskIdempotencyKey(payload, LEAD_PROCESS_TASK_ID);
}

export function getLeadEnrichmentIdempotencyKey(payload: LeadTaskPayload) {
  return getLeadTaskIdempotencyKey(payload, LEAD_ENRICH_TASK_ID);
}

export function getLeadScoringIdempotencyKey(payload: LeadTaskPayload) {
  return getLeadTaskIdempotencyKey(payload, LEAD_SCORE_TASK_ID);
}

export function getLeadHubSpotSyncIdempotencyKey(payload: LeadTaskPayload) {
  return getLeadTaskIdempotencyKey(payload, LEAD_HUBSPOT_SYNC_TASK_ID);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Trigger.dev task failure.";
}

function getNormalizedWebsiteHost(website?: string) {
  if (!website) {
    return undefined;
  }

  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function toLeadStatusForEnrichment(status: LeadEnrichmentStatus): LeadStatusValue {
  switch (status) {
    case "success":
    case "partial":
      return "enriched";
    case "failed":
      return "enrichment_failed";
    case "pending":
    default:
      return "enriching";
  }
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

async function syncLeadReviewTask(
  tx: Prisma.TransactionClient,
  payload: LeadTaskPayload,
  requiresReview: boolean
) {
  if (requiresReview) {
    const existingPendingTask = await tx.reviewTask.findFirst({
      where: {
        workspaceId: payload.workspaceId,
        entityType: "lead",
        entityId: payload.entityId,
        status: "pending",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });

    if (existingPendingTask) {
      return existingPendingTask;
    }

    return tx.reviewTask.create({
      data: {
        workspaceId: payload.workspaceId,
        entityType: "lead",
        entityId: payload.entityId,
        status: "pending",
      },
      select: {
        id: true,
      },
    });
  }

  await tx.reviewTask.updateMany({
    where: {
      workspaceId: payload.workspaceId,
      entityType: "lead",
      entityId: payload.entityId,
      status: "pending",
    },
    data: {
      status: "approved",
      resolvedAt: new Date(),
      resolvedByUserId: null,
      assignedToUserId: null,
    },
  });

  return null;
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

function parseEnrichmentRecord(record: EnrichmentRecord | null) {
  if (!record) {
    return null;
  }

  const normalized = getObjectValue(record.normalizedData);

  return {
    provider: record.provider,
    status: record.status,
    companyDescription: getStringValue(normalized, "companyDescription"),
    industry: getStringValue(normalized, "industry"),
    employeeRange: getStringValue(normalized, "employeeRange"),
    website: getStringValue(normalized, "website"),
    linkedInUrl: getStringValue(normalized, "linkedInUrl"),
    technologies: getStringArrayValue(normalized, "technologies"),
    foundedYear: getNumberValue(normalized, "foundedYear"),
  };
}

const prismaLeadEnrichment = (prisma as typeof prisma & {
  leadEnrichment: {
    create(args: Prisma.LeadEnrichmentCreateArgs): Promise<unknown>;
  };
}).leadEnrichment;

const prismaCrmContactSync = (prisma as typeof prisma & {
  cRMContactSync: {
    findUnique(args: Prisma.CRMContactSyncFindUniqueArgs): Promise<{
      retryCount: number;
    } | null>;
    upsert(args: Prisma.CRMContactSyncUpsertArgs): Promise<unknown>;
  };
}).cRMContactSync;

function getSyncRetryCount(currentRetryCount: number | null | undefined) {
  return typeof currentRetryCount === "number" ? currentRetryCount + 1 : 1;
}

function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function buildLeadDetailUrl(leadId: string) {
  return `${getAppBaseUrl()}/leads/${leadId}`;
}

function buildReviewQueueUrl() {
  return `${getAppBaseUrl()}/review-queue`;
}

async function triggerSlackNotification(payload: SendSlackNotificationPayload) {
  await tasks.trigger<typeof sendSlackNotificationTask>(
    SEND_SLACK_NOTIFICATION_TASK_ID,
    payload,
    {
      idempotencyKey: getSlackNotificationIdempotencyKey(payload),
      maxAttempts: 3,
    }
  );
}

export const leadEnrichTask = task<
  typeof LEAD_ENRICH_TASK_ID,
  LeadTaskPayload,
  LeadEnrichResult
>({
  id: LEAD_ENRICH_TASK_ID,
  retry: {
    maxAttempts: 3,
    factor: 6,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 300_000,
    randomize: false,
  },
  onStartAttempt: async ({ payload, ctx }) => {
    await prisma.lead.update({
      where: {
        id: payload.entityId,
      },
      data: {
        status: "enriching" as never,
      },
    });

    await prismaLeadEnrichment.create({
      data: {
        leadId: payload.entityId,
        workspaceId: payload.workspaceId,
        provider: mockEnrichmentProvider.name,
        status: "pending",
        rawPayloadJson: {
          triggerRunId: ctx.run.id,
          attempt: ctx.attempt.number,
        },
      },
    });

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "lead.enrich.started",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts ?? 3,
        triggerRunId: ctx.run.id,
        provider: mockEnrichmentProvider.name,
      },
    });
  },
  onSuccess: async ({ payload, output, ctx }) => {
    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType:
        output.status === "partial"
          ? "lead.enrich.partial"
          : "lead.enrich.completed",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        triggerRunId: ctx.run.id,
        provider: output.provider,
        enrichmentStatus: output.status,
      },
    });
  },
  catchError: async ({ payload, error, ctx, retryAt, retryDelayInMs }) => {
    const errorMessage = toErrorMessage(error);
    const maxAttempts = ctx.run.maxAttempts ?? 3;
    const isFinalAttempt = ctx.attempt.number >= maxAttempts;

    await prisma.lead.update({
      where: {
        id: payload.entityId,
      },
      data: {
        status: (isFinalAttempt ? "enrichment_failed" : "enriching") as never,
      },
    });

    await prismaLeadEnrichment.create({
      data: {
        leadId: payload.entityId,
        workspaceId: payload.workspaceId,
        provider: mockEnrichmentProvider.name,
        status: "failed",
        rawPayloadJson: {
          triggerRunId: ctx.run.id,
          attempt: ctx.attempt.number,
          error: errorMessage,
          retryDelayInMs: retryDelayInMs ?? null,
          retryAt: retryAt?.toISOString() ?? null,
        },
      },
    });

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: isFinalAttempt ? "lead.enrich.failed" : "lead.enrich.retry_scheduled",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts,
        triggerRunId: ctx.run.id,
        provider: mockEnrichmentProvider.name,
        error: errorMessage,
        retryDelayInMs: retryDelayInMs ?? null,
        retryAt: retryAt?.toISOString() ?? null,
      },
    });

    logger.error("lead.enrich failed", {
      workspaceId: payload.workspaceId,
      leadId: payload.entityId,
      attempt: ctx.attempt.number,
      maxAttempts,
      triggerRunId: ctx.run.id,
      error: errorMessage,
    });

    throw error;
  },
  run: async (payload) => {
    const lead = await prisma.lead.findFirst({
      where: {
        id: payload.entityId,
        workspaceId: payload.workspaceId,
      },
      select: {
        id: true,
        companyName: true,
        companyDomain: true,
        industry: true,
        employeeRange: true,
        workspace: {
          select: {
            leadScoringCriteria: true,
          },
        },
      },
    });

    if (!lead) {
      throw new Error(`Lead ${payload.entityId} was not found for workspace ${payload.workspaceId}.`);
    }

    const result = await mockEnrichmentProvider.enrich(lead);
    const websiteHost = getNormalizedWebsiteHost(result.normalizedData.website);
    const leadStatus = toLeadStatusForEnrichment(result.status);

    await prisma.$transaction(async (tx) => {
      await (
        tx as typeof tx & {
          leadEnrichment: {
            create(args: Prisma.LeadEnrichmentCreateArgs): Promise<unknown>;
          };
        }
      ).leadEnrichment.create({
        data: {
          leadId: payload.entityId,
          workspaceId: payload.workspaceId,
          provider: result.provider,
          rawPayloadJson: result.rawPayload,
          normalizedData: result.normalizedData,
          status: result.status,
        },
      });

      await tx.lead.update({
        where: {
          id: payload.entityId,
        },
        data: {
          status: leadStatus as never,
          industry: result.normalizedData.industry ?? lead.industry,
          employeeRange:
            result.normalizedData.employeeRange ?? lead.employeeRange,
          companyDomain: lead.companyDomain ?? websiteHost,
        },
      });
    });

    return {
      leadId: lead.id,
      provider: result.provider,
      status: result.status,
      message:
        result.status === "partial"
          ? "Lead enrichment completed with partial data."
          : "Lead enrichment completed successfully.",
    };
  },
});

export const leadScoreTask = task<
  typeof LEAD_SCORE_TASK_ID,
  LeadTaskPayload,
  LeadScoreResult
>({
  id: LEAD_SCORE_TASK_ID,
  retry: {
    maxAttempts: 3,
    factor: 6,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 300_000,
    randomize: false,
  },
  onStartAttempt: async ({ payload, ctx }) => {
    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "lead.score.started",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts ?? 3,
        triggerRunId: ctx.run.id,
      },
    });
  },
  onSuccess: async ({ payload, output, ctx }) => {
    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "lead.score.completed",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        triggerRunId: ctx.run.id,
        fitLabel: output.fitLabel,
        finalStatus: output.finalStatus,
        numericScore: output.numericScore,
        confidenceScore: output.confidenceScore,
      },
    });
  },
  catchError: async ({ payload, error, ctx, retryAt, retryDelayInMs }) => {
    const errorMessage = toErrorMessage(error);
    const maxAttempts = ctx.run.maxAttempts ?? 3;
    const isFinalAttempt = ctx.attempt.number >= maxAttempts;

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: isFinalAttempt ? "lead.score.failed" : "lead.score.retry_scheduled",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts,
        triggerRunId: ctx.run.id,
        error: errorMessage,
        retryDelayInMs: retryDelayInMs ?? null,
        retryAt: retryAt?.toISOString() ?? null,
      },
    });

    logger.error("lead.score failed", {
      workspaceId: payload.workspaceId,
      leadId: payload.entityId,
      attempt: ctx.attempt.number,
      maxAttempts,
      triggerRunId: ctx.run.id,
      error: errorMessage,
    });

    throw error;
  },
  run: async (payload) => {
    const lead = await prisma.lead.findFirst({
      where: {
        id: payload.entityId,
        workspaceId: payload.workspaceId,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        companyName: true,
        companyDomain: true,
        jobTitle: true,
        industry: true,
        employeeRange: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${payload.entityId} was not found for workspace ${payload.workspaceId}.`);
    }

    const enrichmentRows = await prisma.$queryRaw<EnrichmentRecord[]>`
      SELECT "provider", "status"::text AS "status", "rawPayloadJson", "normalizedData"
      FROM "LeadEnrichment"
      WHERE "leadId" = ${payload.entityId} AND "workspaceId" = ${payload.workspaceId}
      ORDER BY "enrichedAt" DESC
      LIMIT 1
    `;
    const enrichment = parseEnrichmentRecord(enrichmentRows[0] ?? null);
    const workspace = await prisma.workspace.findUnique({
      where: {
        id: payload.workspaceId,
      },
      select: {
        leadScoringCriteria: true,
      },
    });

    if (!enrichment) {
      throw new Error("Lead scoring requires enrichment data, but no enrichment record was found.");
    }

    const scoring = await scoreLead({
      lead,
      enrichment,
      workspaceLeadScoringCriteria: workspace?.leadScoringCriteria ?? null,
    });
    const finalStatus = resolveLeadStatusFromScore(scoring.result);
    const requiresReview = finalStatus === "review_needed";

    await prisma.$transaction(async (tx) => {
      await (
        tx as typeof tx & {
          leadScore: {
            upsert(args: Prisma.LeadScoreUpsertArgs): Promise<unknown>;
          };
        }
      ).leadScore.upsert({
        where: {
          leadId: payload.entityId,
        },
        create: {
          leadId: payload.entityId,
          workspaceId: payload.workspaceId,
          numericScore: scoring.result.numericScore,
          fitLabel: scoring.result.fitLabel,
          reasoning: scoring.result.reasoning,
          missingDataJson: scoring.result.missingFields,
          confidenceScore: scoring.result.confidenceScore,
          modelUsed: scoring.modelUsed,
          promptVersion: scoring.promptVersion,
          tokenUsage:
            typeof scoring.tokenUsage === "number"
              ? Math.round(scoring.tokenUsage)
              : null,
          latencyMs: scoring.latencyMs,
          scoredAt: new Date(),
        },
        update: {
          workspaceId: payload.workspaceId,
          numericScore: scoring.result.numericScore,
          fitLabel: scoring.result.fitLabel,
          reasoning: scoring.result.reasoning,
          missingDataJson: scoring.result.missingFields,
          confidenceScore: scoring.result.confidenceScore,
          modelUsed: scoring.modelUsed,
          promptVersion: scoring.promptVersion,
          tokenUsage:
            typeof scoring.tokenUsage === "number"
              ? Math.round(scoring.tokenUsage)
              : null,
          latencyMs: scoring.latencyMs,
          scoredAt: new Date(),
        },
      });

      await tx.lead.update({
        where: {
          id: payload.entityId,
        },
        data: {
          status: finalStatus as never,
        },
      });

      await syncLeadReviewTask(tx, payload, requiresReview);
    });

    return {
      leadId: payload.entityId,
      fitLabel: scoring.result.fitLabel,
      finalStatus,
      numericScore: scoring.result.numericScore,
      confidenceScore: scoring.result.confidenceScore,
      message: `Lead scored as ${scoring.result.fitLabel} with status ${finalStatus}.`,
    };
  },
});

export const leadSyncToHubSpotTask = task<
  typeof LEAD_HUBSPOT_SYNC_TASK_ID,
  LeadTaskPayload,
  LeadHubSpotSyncResult
>({
  id: LEAD_HUBSPOT_SYNC_TASK_ID,
  retry: {
    maxAttempts: 3,
    factor: 6,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 300_000,
    randomize: false,
  },
  onStartAttempt: async ({ payload, ctx }) => {
    const existingSync = await prismaCrmContactSync.findUnique({
      where: {
        leadId_provider: {
          leadId: payload.entityId,
          provider: HUBSPOT_PROVIDER,
        },
      },
      select: {
        retryCount: true,
      },
    });

    await prismaCrmContactSync.upsert({
      where: {
        leadId_provider: {
          leadId: payload.entityId,
          provider: HUBSPOT_PROVIDER,
        },
      },
      create: {
        leadId: payload.entityId,
        workspaceId: payload.workspaceId,
        provider: HUBSPOT_PROVIDER,
        syncStatus: "pending",
        retryCount: 0,
      },
      update: {
        workspaceId: payload.workspaceId,
        syncStatus: ctx.attempt.number > 1 ? "retrying" : "pending",
        errorMessage: null,
        retryCount:
          ctx.attempt.number > 1
            ? getSyncRetryCount(existingSync?.retryCount)
            : existingSync?.retryCount ?? 0,
      },
    });

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "lead.hubspot_sync.started",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts ?? 3,
        triggerRunId: ctx.run.id,
        provider: HUBSPOT_PROVIDER,
      },
    });
  },
  onSuccess: async ({ payload, output, ctx }) => {
    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "lead.hubspot_sync.completed",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        triggerRunId: ctx.run.id,
        provider: HUBSPOT_PROVIDER,
        syncStatus: output.syncStatus,
        externalContactId: output.externalContactId,
        contactUrl: output.contactUrl,
      },
    });
  },
  catchError: async ({ payload, error, ctx, retryAt, retryDelayInMs }) => {
    const errorMessage = toErrorMessage(error);
    const maxAttempts = ctx.run.maxAttempts ?? 3;
    const isFinalAttempt = ctx.attempt.number >= maxAttempts;
    const existingSync = await prismaCrmContactSync.findUnique({
      where: {
        leadId_provider: {
          leadId: payload.entityId,
          provider: HUBSPOT_PROVIDER,
        },
      },
      select: {
        retryCount: true,
      },
    });

    await prismaCrmContactSync.upsert({
      where: {
        leadId_provider: {
          leadId: payload.entityId,
          provider: HUBSPOT_PROVIDER,
        },
      },
      create: {
        leadId: payload.entityId,
        workspaceId: payload.workspaceId,
        provider: HUBSPOT_PROVIDER,
        syncStatus: isFinalAttempt ? "failed" : "retrying",
        errorMessage: errorMessage,
        retryCount: 1,
      },
      update: {
        workspaceId: payload.workspaceId,
        syncStatus: isFinalAttempt ? "failed" : "retrying",
        errorMessage: errorMessage,
        retryCount: getSyncRetryCount(existingSync?.retryCount),
      },
    });

    if (isFinalAttempt) {
      await prisma.lead.update({
        where: {
          id: payload.entityId,
        },
        data: {
          status: "sync_failed" as never,
        },
      });
    }

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: isFinalAttempt
        ? "lead.hubspot_sync.failed"
        : "lead.hubspot_sync.retry_scheduled",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts,
        triggerRunId: ctx.run.id,
        provider: HUBSPOT_PROVIDER,
        error: errorMessage,
        retryDelayInMs: retryDelayInMs ?? null,
        retryAt: retryAt?.toISOString() ?? null,
      },
    });

    logger.error("lead.syncToHubSpot failed", {
      workspaceId: payload.workspaceId,
      leadId: payload.entityId,
      attempt: ctx.attempt.number,
      maxAttempts,
      triggerRunId: ctx.run.id,
      error: errorMessage,
    });

    if (isFinalAttempt) {
      const lead = await prisma.lead.findFirst({
        where: {
          id: payload.entityId,
          workspaceId: payload.workspaceId,
        },
        select: {
          fullName: true,
          companyName: true,
        },
      });

      if (lead) {
        await triggerSlackNotification({
          workspaceId: payload.workspaceId,
          entityId: payload.entityId,
          entityType: "lead",
          notificationType: "crm_sync_failure",
          title: `${lead.fullName} failed HubSpot sync`,
          body: "HubSpot sync exhausted its retries and needs manual attention.",
          fields: [
            { label: "Lead", value: lead.fullName },
            { label: "Company", value: lead.companyName },
            { label: "Error", value: errorMessage },
          ],
          linkUrl: buildLeadDetailUrl(payload.entityId),
          linkLabel: "Open lead",
        });
      }
    }

    throw error;
  },
  run: async (payload) => {
    const connectionState = await getHubSpotConnectionState(payload.workspaceId);

    if (!connectionState.isConnected) {
      throw new Error(
        "HubSpot is not connected for this workspace. Connect it in Settings before syncing qualified leads."
      );
    }

    const lead = await prisma.lead.findFirst({
      where: {
        id: payload.entityId,
        workspaceId: payload.workspaceId,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        companyName: true,
        companyDomain: true,
        jobTitle: true,
        status: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${payload.entityId} was not found for workspace ${payload.workspaceId}.`);
    }

    if (lead.status !== "qualified" && lead.status !== "sync_failed") {
      throw new Error(
        `Lead ${payload.entityId} is not eligible for HubSpot sync because its status is ${lead.status}.`
      );
    }

    const existingContact = await findHubSpotContactByEmail(lead.email);
    const properties = buildHubSpotContactProperties(lead);
    const accountDetails = await fetchHubSpotAccountDetails();
    const contact =
      existingContact != null
        ? await updateHubSpotContact(existingContact.id, properties)
        : await createHubSpotContact(properties);
    const contactUrl = buildHubSpotContactUrl(accountDetails.portalId, contact.id);

    await prisma.$transaction(async (tx) => {
      await (
        tx as typeof tx & {
          cRMContactSync: {
            upsert(args: Prisma.CRMContactSyncUpsertArgs): Promise<unknown>;
          };
        }
      ).cRMContactSync.upsert({
        where: {
          leadId_provider: {
            leadId: payload.entityId,
            provider: HUBSPOT_PROVIDER,
          },
        },
        create: {
          leadId: payload.entityId,
          workspaceId: payload.workspaceId,
          provider: HUBSPOT_PROVIDER,
          externalContactId: contact.id,
          syncStatus: "synced",
          errorMessage: null,
          contactUrl,
          lastSyncedAt: new Date(),
          retryCount: 0,
        },
        update: {
          workspaceId: payload.workspaceId,
          externalContactId: contact.id,
          syncStatus: "synced",
          errorMessage: null,
          contactUrl,
          lastSyncedAt: new Date(),
        },
      });

      await (
        tx as typeof tx & {
          integrationConnection: {
            update(args: Prisma.IntegrationConnectionUpdateArgs): Promise<unknown>;
          };
        }
      ).integrationConnection.update({
        where: {
          workspaceId_provider: {
            workspaceId: payload.workspaceId,
            provider: HUBSPOT_PROVIDER,
          },
        },
        data: {
          status: "connected",
          connectedAt: connectionState.record?.connectedAt ?? new Date(),
          disconnectedAt: null,
          metadata: {
            mode: HUBSPOT_CONNECTION_MODE,
            portalId: accountDetails.portalId,
            accountName: accountDetails.accountName,
          },
        },
      });

      await tx.lead.update({
        where: {
          id: payload.entityId,
        },
        data: {
          status: "qualified" as never,
        },
      });
    });

    return {
      leadId: payload.entityId,
      syncStatus: "synced",
      externalContactId: contact.id,
      contactUrl,
      message: existingContact
        ? "Updated the existing HubSpot contact."
        : "Created a new HubSpot contact.",
    };
  },
});

export const leadProcessTask = task<
  typeof LEAD_PROCESS_TASK_ID,
  LeadTaskPayload,
  LeadProcessResult
>({
  id: LEAD_PROCESS_TASK_ID,
  retry: {
    maxAttempts: 3,
    factor: 6,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 300_000,
    randomize: false,
  },
  onStartAttempt: async ({ payload, ctx }) => {
    await prisma.lead.update({
      where: {
        id: payload.entityId,
      },
      data: {
        processingStatus: "running",
        processingRunId: ctx.run.id,
        processingError: null,
      },
    });

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "lead.process.started",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts ?? 3,
        triggerRunId: ctx.run.id,
      },
    });
  },
  onSuccess: async ({ payload, output, ctx }) => {
    await prisma.lead.update({
      where: {
        id: payload.entityId,
      },
      data: {
        processingStatus: "completed",
        processedAt: new Date(),
        processingError: null,
        processingRunId: ctx.run.id,
      },
    });

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "lead.process.completed",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        triggerRunId: ctx.run.id,
        result: output.message,
        enrichmentStatus: output.enrichmentStatus,
        fitLabel: output.fitLabel,
        finalStatus: output.finalStatus,
      },
    });
  },
  catchError: async ({ payload, error, ctx, retryAt, retryDelayInMs }) => {
    const errorMessage = toErrorMessage(error);
    const maxAttempts = ctx.run.maxAttempts ?? 3;
    const isFinalAttempt = ctx.attempt.number >= maxAttempts;

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: isFinalAttempt ? "lead.process.failed" : "lead.process.retry_scheduled",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts,
        triggerRunId: ctx.run.id,
        error: errorMessage,
        retryDelayInMs: retryDelayInMs ?? null,
        retryAt: retryAt?.toISOString() ?? null,
      },
    });

    if (isFinalAttempt) {
      await prisma.lead.update({
        where: {
          id: payload.entityId,
        },
        data: {
          processingStatus: "processing_failed",
          processingError: errorMessage,
          processingRunId: ctx.run.id,
        },
      });
    }

    logger.error("lead.process failed", {
      workspaceId: payload.workspaceId,
      leadId: payload.entityId,
      attempt: ctx.attempt.number,
      maxAttempts,
      triggerRunId: ctx.run.id,
      error: errorMessage,
      retryDelayInMs: retryDelayInMs ?? null,
    });

    throw error;
  },
  run: async (payload) => {
    logger.info("Processing lead pipeline", {
      workspaceId: payload.workspaceId,
      leadId: payload.entityId,
    });

    const lead = await prisma.lead.findFirst({
      where: {
        id: payload.entityId,
        workspaceId: payload.workspaceId,
      },
      select: {
        id: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${payload.entityId} was not found for workspace ${payload.workspaceId}.`);
    }

    return runLeadProcessingPipeline(payload, {
      enrichLead: (taskPayload) =>
        leadEnrichTask
          .triggerAndWait(taskPayload, {
            idempotencyKey: getLeadEnrichmentIdempotencyKey(taskPayload),
            maxAttempts: 3,
          })
          .unwrap(),
      scoreLead: (taskPayload) =>
        leadScoreTask
          .triggerAndWait(taskPayload, {
            idempotencyKey: getLeadScoringIdempotencyKey(taskPayload),
            maxAttempts: 3,
          })
          .unwrap(),
      syncLeadToHubSpot: (taskPayload) =>
        leadSyncToHubSpotTask
          .triggerAndWait(taskPayload, {
            idempotencyKey: getLeadHubSpotSyncIdempotencyKey(taskPayload),
            maxAttempts: 3,
          })
          .unwrap(),
      getScoredLead: (taskPayload) =>
        prisma.lead.findFirst({
          where: {
            id: taskPayload.entityId,
            workspaceId: taskPayload.workspaceId,
          },
          select: {
            fullName: true,
            companyName: true,
          },
        }),
      getHubSpotConnectionState,
      triggerSlackNotification,
      createAuditLog: (input) => createAuditLog(input),
      buildLeadDetailUrl,
      buildReviewQueueUrl,
    });
  },
});
