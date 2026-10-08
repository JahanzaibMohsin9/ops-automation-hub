import { prisma } from "@/lib/prisma";

export const SLACK_PROVIDER = "slack";
export const SLACK_CONNECTION_MODE = "incoming_webhook";

export const SLACK_NOTIFICATION_TYPES = [
  "qualified_lead",
  "review_needed",
  "crm_sync_failure",
  "document_processing_failure",
] as const;

export type SlackNotificationType = (typeof SLACK_NOTIFICATION_TYPES)[number];

export type SlackNotificationPreferences = Record<SlackNotificationType, boolean>;

export type SlackConnectionMetadata = {
  mode: typeof SLACK_CONNECTION_MODE;
  channelName: string | null;
  preferences: SlackNotificationPreferences;
};

const defaultSlackNotificationPreferences: SlackNotificationPreferences = {
  qualified_lead: true,
  review_needed: true,
  crm_sync_failure: true,
  document_processing_failure: true,
};

function getEnvSlackWebhookUrl() {
  const value = process.env.SLACK_WEBHOOK_URL?.trim();
  return value && value.length > 0 ? value : null;
}

export function getDefaultSlackNotificationPreferences(): SlackNotificationPreferences {
  return { ...defaultSlackNotificationPreferences };
}

export function isSlackWebhookConfiguredInEnv() {
  return Boolean(getEnvSlackWebhookUrl());
}

export async function getSlackConnectionRecord(workspaceId: string) {
  return prisma.integrationConnection.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: SLACK_PROVIDER,
      },
    },
  });
}

export function getSlackNotificationPreferences(
  metadata: unknown
): SlackNotificationPreferences {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return getDefaultSlackNotificationPreferences();
  }

  const candidate = metadata as {
    preferences?: Partial<Record<SlackNotificationType, unknown>>;
  };

  return {
    qualified_lead:
      typeof candidate.preferences?.qualified_lead === "boolean"
        ? candidate.preferences.qualified_lead
        : defaultSlackNotificationPreferences.qualified_lead,
    review_needed:
      typeof candidate.preferences?.review_needed === "boolean"
        ? candidate.preferences.review_needed
        : defaultSlackNotificationPreferences.review_needed,
    crm_sync_failure:
      typeof candidate.preferences?.crm_sync_failure === "boolean"
        ? candidate.preferences.crm_sync_failure
        : defaultSlackNotificationPreferences.crm_sync_failure,
    document_processing_failure:
      typeof candidate.preferences?.document_processing_failure === "boolean"
        ? candidate.preferences.document_processing_failure
        : defaultSlackNotificationPreferences.document_processing_failure,
  };
}

export function getSlackChannelName(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const candidate = metadata as { channelName?: unknown };
  return typeof candidate.channelName === "string" && candidate.channelName.trim()
    ? candidate.channelName.trim()
    : null;
}

export async function getSlackConnectionState(workspaceId: string) {
  const record = await getSlackConnectionRecord(workspaceId);
  const envConfigured = isSlackWebhookConfiguredInEnv();
  const storedWebhookConfigured =
    typeof record?.accessToken === "string" && record.accessToken.trim().length > 0;
  const isConnected =
    record?.status === "connected" && (storedWebhookConfigured || envConfigured);

  return {
    envConfigured,
    storedWebhookConfigured,
    isConnected,
    record,
    webhookUrl: storedWebhookConfigured ? record?.accessToken ?? null : getEnvSlackWebhookUrl(),
    channelName: getSlackChannelName(record?.metadata),
    preferences: getSlackNotificationPreferences(record?.metadata),
  };
}

export function buildSlackConnectionMetadata(input: {
  channelName?: string | null;
  preferences?: Partial<SlackNotificationPreferences>;
}): SlackConnectionMetadata {
  return {
    mode: SLACK_CONNECTION_MODE,
    channelName: input.channelName?.trim() ? input.channelName.trim() : null,
    preferences: {
      ...defaultSlackNotificationPreferences,
      ...(input.preferences ?? {}),
    },
  };
}

export function maskSlackWebhookUrl(value: string | null | undefined) {
  if (!value) {
    return "Not configured";
  }

  if (value.length <= 12) {
    return "Configured";
  }

  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}

export async function postSlackWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Slack webhook request failed (${response.status} ${response.statusText})${details ? `: ${details}` : "."}`
    );
  }
}
