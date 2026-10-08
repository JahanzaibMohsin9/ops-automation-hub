import { tasks } from "@trigger.dev/sdk";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  DOCUMENT_EXTRACT_TEXT_TASK_ID,
  getDocumentExtractTextIdempotencyKey,
  type documentExtractTextTask,
  type DocumentTaskPayload,
} from "@/trigger/document-processing";
import {
  getLeadEnrichmentIdempotencyKey,
  getLeadHubSpotSyncIdempotencyKey,
  getLeadProcessingIdempotencyKey,
  getLeadScoringIdempotencyKey,
  LEAD_ENRICH_TASK_ID,
  LEAD_HUBSPOT_SYNC_TASK_ID,
  LEAD_PROCESS_TASK_ID,
  LEAD_SCORE_TASK_ID,
  type LeadTaskPayload,
  type leadEnrichTask,
  type leadSyncToHubSpotTask,
  type leadScoreTask,
} from "@/trigger/lead-processing";
import type { leadProcessTask } from "@/trigger/lead-processing";
import {
  getSlackNotificationIdempotencyKey,
  SEND_SLACK_NOTIFICATION_TASK_ID,
  type SendSlackNotificationPayload,
  type sendSlackNotificationTask,
} from "@/trigger/notifications";

type EnqueueLeadProcessingInput = LeadTaskPayload & {
  actorUserId?: string | null;
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Trigger.dev enqueue failure.";
}

type EnqueueDocumentExtractionInput = DocumentTaskPayload & {
  actorUserId?: string | null;
  force?: boolean;
};

export async function enqueueDocumentExtraction({
  workspaceId,
  entityId,
  entityType,
  actorUserId,
  force = false,
}: EnqueueDocumentExtractionInput) {
  const idempotencyKey = force
    ? `${getDocumentExtractTextIdempotencyKey({
        workspaceId,
        entityId,
        entityType,
      })}:${Date.now()}`
    : getDocumentExtractTextIdempotencyKey({
        workspaceId,
        entityId,
        entityType,
      });

  try {
    const handle = await tasks.trigger<typeof documentExtractTextTask>(
      DOCUMENT_EXTRACT_TEXT_TASK_ID,
      {
        workspaceId,
        entityId,
        entityType,
      },
      {
        idempotencyKey,
        maxAttempts: 3,
      }
    );

    await prisma.document.update({
      where: {
        id: entityId,
      },
      data: {
        processingRunId: handle.id,
        processingError: null,
      },
    });

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "document.extract_text.enqueued",
      entityType,
      entityId,
      metadataJson: {
        triggerRunId: handle.id,
        idempotencyKey,
        taskId: DOCUMENT_EXTRACT_TEXT_TASK_ID,
        forced: force,
      },
    });

    return {
      ok: true as const,
      runId: handle.id,
    };
  } catch (error) {
    const message = toErrorMessage(error);

    await prisma.document.update({
      where: {
        id: entityId,
      },
      data: {
        processingStatus: "failed",
        processingError: message,
      },
    });

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "document.extract_text.enqueue_failed",
      entityType,
      entityId,
      metadataJson: {
        idempotencyKey,
        taskId: DOCUMENT_EXTRACT_TEXT_TASK_ID,
        forced: force,
        error: message,
      },
    });

    return {
      ok: false as const,
      error: message,
    };
  }
}

type EnqueueLeadEnrichmentInput = LeadTaskPayload & {
  actorUserId?: string | null;
  force?: boolean;
};

export async function enqueueLeadEnrichment({
  workspaceId,
  entityId,
  entityType,
  actorUserId,
  force = false,
}: EnqueueLeadEnrichmentInput) {
  const idempotencyKey = force
    ? `${getLeadEnrichmentIdempotencyKey({
        workspaceId,
        entityId,
        entityType,
      })}:${Date.now()}`
    : getLeadEnrichmentIdempotencyKey({
        workspaceId,
        entityId,
        entityType,
      });

  try {
    const handle = await tasks.trigger<typeof leadEnrichTask>(
      LEAD_ENRICH_TASK_ID,
      {
        workspaceId,
        entityId,
        entityType,
      },
      {
        idempotencyKey,
        maxAttempts: 3,
      }
    );

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "lead.enrich.enqueued",
      entityType,
      entityId,
      metadataJson: {
        triggerRunId: handle.id,
        idempotencyKey,
        taskId: LEAD_ENRICH_TASK_ID,
        forced: force,
      },
    });

    return {
      ok: true as const,
      runId: handle.id,
    };
  } catch (error) {
    const message = toErrorMessage(error);

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "lead.enrich.enqueue_failed",
      entityType,
      entityId,
      metadataJson: {
        idempotencyKey,
        taskId: LEAD_ENRICH_TASK_ID,
        forced: force,
        error: message,
      },
    });

    return {
      ok: false as const,
      error: message,
    };
  }
}

type EnqueueLeadScoringInput = LeadTaskPayload & {
  actorUserId?: string | null;
  force?: boolean;
};

export async function enqueueLeadScoring({
  workspaceId,
  entityId,
  entityType,
  actorUserId,
  force = false,
}: EnqueueLeadScoringInput) {
  const idempotencyKey = force
    ? `${getLeadScoringIdempotencyKey({
        workspaceId,
        entityId,
        entityType,
      })}:${Date.now()}`
    : getLeadScoringIdempotencyKey({
        workspaceId,
        entityId,
        entityType,
      });

  try {
    const handle = await tasks.trigger<typeof leadScoreTask>(
      LEAD_SCORE_TASK_ID,
      {
        workspaceId,
        entityId,
        entityType,
      },
      {
        idempotencyKey,
        maxAttempts: 3,
      }
    );

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "lead.score.enqueued",
      entityType,
      entityId,
      metadataJson: {
        triggerRunId: handle.id,
        idempotencyKey,
        taskId: LEAD_SCORE_TASK_ID,
        forced: force,
      },
    });

    return {
      ok: true as const,
      runId: handle.id,
    };
  } catch (error) {
    const message = toErrorMessage(error);

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "lead.score.enqueue_failed",
      entityType,
      entityId,
      metadataJson: {
        idempotencyKey,
        taskId: LEAD_SCORE_TASK_ID,
        forced: force,
        error: message,
      },
    });

    return {
      ok: false as const,
      error: message,
    };
  }
}

export async function enqueueLeadProcessing({
  workspaceId,
  entityId,
  entityType,
  actorUserId,
}: EnqueueLeadProcessingInput) {
  const idempotencyKey = getLeadProcessingIdempotencyKey({
    workspaceId,
    entityId,
    entityType,
  });

  try {
    const handle = await tasks.trigger<typeof leadProcessTask>(
      LEAD_PROCESS_TASK_ID,
      {
        workspaceId,
        entityId,
        entityType,
      },
      {
        idempotencyKey,
        maxAttempts: 3,
      }
    );

    await prisma.lead.update({
      where: {
        id: entityId,
      },
      data: {
        processingStatus: "queued",
        processingRunId: handle.id,
        processingError: null,
      },
    });

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "lead.process.enqueued",
      entityType,
      entityId,
      metadataJson: {
        triggerRunId: handle.id,
        idempotencyKey,
        taskId: LEAD_PROCESS_TASK_ID,
      },
    });

    return {
      ok: true as const,
      runId: handle.id,
    };
  } catch (error) {
    const message = toErrorMessage(error);

    await prisma.lead.update({
      where: {
        id: entityId,
      },
      data: {
        processingStatus: "processing_failed",
        processingError: message,
      },
    });

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "lead.process.enqueue_failed",
      entityType,
      entityId,
      metadataJson: {
        idempotencyKey,
        taskId: LEAD_PROCESS_TASK_ID,
        error: message,
      },
    });

    return {
      ok: false as const,
      error: message,
    };
  }
}

type EnqueueHubSpotSyncInput = LeadTaskPayload & {
  actorUserId?: string | null;
  force?: boolean;
};

export async function enqueueHubSpotSync({
  workspaceId,
  entityId,
  entityType,
  actorUserId,
  force = false,
}: EnqueueHubSpotSyncInput) {
  const idempotencyKey = force
    ? `${getLeadHubSpotSyncIdempotencyKey({
        workspaceId,
        entityId,
        entityType,
      })}:${Date.now()}`
    : getLeadHubSpotSyncIdempotencyKey({
        workspaceId,
        entityId,
        entityType,
      });

  try {
    const handle = await tasks.trigger<typeof leadSyncToHubSpotTask>(
      LEAD_HUBSPOT_SYNC_TASK_ID,
      {
        workspaceId,
        entityId,
        entityType,
      },
      {
        idempotencyKey,
        maxAttempts: 3,
      }
    );

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "lead.hubspot_sync.enqueued",
      entityType,
      entityId,
      metadataJson: {
        triggerRunId: handle.id,
        idempotencyKey,
        taskId: LEAD_HUBSPOT_SYNC_TASK_ID,
        forced: force,
      },
    });

    return {
      ok: true as const,
      runId: handle.id,
    };
  } catch (error) {
    const message = toErrorMessage(error);

    await createAuditLog({
      workspaceId,
      actorUserId,
      eventType: "lead.hubspot_sync.enqueue_failed",
      entityType,
      entityId,
      metadataJson: {
        idempotencyKey,
        taskId: LEAD_HUBSPOT_SYNC_TASK_ID,
        forced: force,
        error: message,
      },
    });

    return {
      ok: false as const,
      error: message,
    };
  }
}

type EnqueueSlackNotificationInput = SendSlackNotificationPayload & {
  actorUserId?: string | null;
  force?: boolean;
};

export async function enqueueSlackNotification({
  actorUserId,
  force = false,
  ...payload
}: EnqueueSlackNotificationInput) {
  const idempotencyKey = force
    ? `${getSlackNotificationIdempotencyKey(payload)}:${Date.now()}`
    : getSlackNotificationIdempotencyKey(payload);

  try {
    const handle = await tasks.trigger<typeof sendSlackNotificationTask>(
      SEND_SLACK_NOTIFICATION_TASK_ID,
      payload,
      {
        idempotencyKey,
        maxAttempts: 3,
      }
    );

    await createAuditLog({
      workspaceId: payload.workspaceId,
      actorUserId,
      eventType: "notification.slack.enqueued",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        triggerRunId: handle.id,
        idempotencyKey,
        taskId: SEND_SLACK_NOTIFICATION_TASK_ID,
        notificationType: payload.notificationType,
        forced: force,
      },
    });

    return {
      ok: true as const,
      runId: handle.id,
    };
  } catch (error) {
    const message = toErrorMessage(error);

    await createAuditLog({
      workspaceId: payload.workspaceId,
      actorUserId,
      eventType: "notification.slack.enqueue_failed",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        idempotencyKey,
        taskId: SEND_SLACK_NOTIFICATION_TASK_ID,
        notificationType: payload.notificationType,
        forced: force,
        error: message,
      },
    });

    return {
      ok: false as const,
      error: message,
    };
  }
}
