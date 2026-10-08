import { logger, task } from "@trigger.dev/sdk";
import { createAuditLog } from "@/lib/audit-log";
import {
  getSlackConnectionState,
  postSlackWebhook,
  type SlackNotificationType,
} from "@/features/slack/connection";
import { buildSlackBlocks, type SlackField } from "@/features/slack/templates";

export const SEND_SLACK_NOTIFICATION_TASK_ID = "notification.sendSlack";

export type SendSlackNotificationPayload = {
  workspaceId: string;
  entityId: string;
  entityType: "lead" | "document" | "review_task" | "integration_connection";
  notificationType: SlackNotificationType;
  title: string;
  fields: SlackField[];
  linkUrl?: string | null;
  linkLabel?: string | null;
  body?: string | null;
};

export type SendSlackNotificationResult = {
  delivered: boolean;
  skippedReason: string | null;
  notificationType: SlackNotificationType;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Slack notification error.";
}

export function getSlackNotificationIdempotencyKey(
  payload: SendSlackNotificationPayload
) {
  return [
    "slack",
    payload.workspaceId,
    payload.entityType,
    payload.entityId,
    payload.notificationType,
  ].join(":");
}

export const sendSlackNotificationTask = task<
  typeof SEND_SLACK_NOTIFICATION_TASK_ID,
  SendSlackNotificationPayload,
  SendSlackNotificationResult
>({
  id: SEND_SLACK_NOTIFICATION_TASK_ID,
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
      eventType: "notification.slack.started",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        triggerRunId: ctx.run.id,
        notificationType: payload.notificationType,
      },
    });
  },
  onSuccess: async ({ payload, output, ctx }) => {
    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: output.delivered
        ? "notification.slack.sent"
        : "notification.slack.skipped",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        triggerRunId: ctx.run.id,
        notificationType: payload.notificationType,
        skippedReason: output.skippedReason,
      },
    });
  },
  catchError: async ({ payload, error, ctx, retryAt, retryDelayInMs }) => {
    const errorMessage = toErrorMessage(error);

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType:
        ctx.attempt.number >= (ctx.run.maxAttempts ?? 3)
          ? "notification.slack.failed"
          : "notification.slack.retry_scheduled",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts ?? 3,
        triggerRunId: ctx.run.id,
        notificationType: payload.notificationType,
        error: errorMessage,
        retryAt: retryAt?.toISOString() ?? null,
        retryDelayInMs: retryDelayInMs ?? null,
      },
    });

    logger.error("notification.sendSlack failed", {
      workspaceId: payload.workspaceId,
      entityType: payload.entityType,
      entityId: payload.entityId,
      notificationType: payload.notificationType,
      error: errorMessage,
    });

    throw error;
  },
  run: async (payload) => {
    const connectionState = await getSlackConnectionState(payload.workspaceId);

    if (!connectionState.isConnected || !connectionState.webhookUrl) {
      return {
        delivered: false,
        skippedReason: "slack_not_connected",
        notificationType: payload.notificationType,
      };
    }

    if (!connectionState.preferences[payload.notificationType]) {
      return {
        delivered: false,
        skippedReason: "notification_disabled",
        notificationType: payload.notificationType,
      };
    }

    const blocks = buildSlackBlocks({
      type: payload.notificationType,
      title: payload.title,
      fields: payload.fields,
      linkUrl: payload.linkUrl,
      linkLabel: payload.linkLabel,
      body: payload.body,
      channelName: connectionState.channelName,
    });

    await postSlackWebhook(connectionState.webhookUrl, {
      text: payload.title,
      blocks,
    });

    return {
      delivered: true,
      skippedReason: null,
      notificationType: payload.notificationType,
    };
  },
});
