"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";
import {
  buildSlackConnectionMetadata,
  getSlackConnectionState,
  SLACK_PROVIDER,
} from "./connection";
import {
  initialSlackConnectionActionState,
  type SlackConnectionActionState,
} from "./state";

const slackSettingsSchema = z.object({
  webhookUrl: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .refine(
      (value) =>
        value === undefined ||
        /^https:\/\/hooks\.slack(?:-gov)?\.com\/services\/.+/i.test(value),
      "Enter a valid Slack incoming webhook URL."
    ),
  channelName: z
    .string()
    .trim()
    .max(80, "Keep the channel name under 80 characters.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  qualifiedLead: z.boolean(),
  reviewNeeded: z.boolean(),
  crmSyncFailure: z.boolean(),
  documentProcessingFailure: z.boolean(),
});

async function requireWorkspace() {
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return null;
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return null;
  }

  return {
    userId,
    workspace,
  };
}

export async function saveSlackSettings(
  previousState: SlackConnectionActionState,
  formData: FormData
) {
  void previousState;
  const context = await requireWorkspace();

  if (!context) {
    return {
      ...initialSlackConnectionActionState,
      status: "error" as const,
      message: "Sign in to a workspace before saving Slack settings.",
    };
  }

  const parsed = slackSettingsSchema.safeParse({
    webhookUrl: formData.get("webhookUrl"),
    channelName: formData.get("channelName"),
    qualifiedLead: formData.get("qualifiedLead") === "on",
    reviewNeeded: formData.get("reviewNeeded") === "on",
    crmSyncFailure: formData.get("crmSyncFailure") === "on",
    documentProcessingFailure: formData.get("documentProcessingFailure") === "on",
  });

  if (!parsed.success) {
    return {
      ...initialSlackConnectionActionState,
      status: "error" as const,
      message:
        parsed.error.issues[0]?.message ??
        "The Slack settings payload is invalid.",
    };
  }

  const currentState = await getSlackConnectionState(context.workspace.id);
  const webhookUrl = parsed.data.webhookUrl ?? currentState.webhookUrl;

  if (!webhookUrl) {
    return {
      ...initialSlackConnectionActionState,
      status: "error" as const,
      message:
        "Add a Slack incoming webhook URL or set SLACK_WEBHOOK_URL in .env.local before connecting this workspace.",
    };
  }

  const preferences = {
    qualified_lead: parsed.data.qualifiedLead,
    review_needed: parsed.data.reviewNeeded,
    crm_sync_failure: parsed.data.crmSyncFailure,
    document_processing_failure: parsed.data.documentProcessingFailure,
  };

  await prisma.integrationConnection.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: context.workspace.id,
        provider: SLACK_PROVIDER,
      },
    },
    create: {
      workspaceId: context.workspace.id,
      provider: SLACK_PROVIDER,
      accessToken: parsed.data.webhookUrl ?? null,
      status: "connected",
      connectedAt: new Date(),
      metadata: buildSlackConnectionMetadata({
        channelName: parsed.data.channelName ?? currentState.channelName,
        preferences,
      }),
    },
    update: {
      accessToken: parsed.data.webhookUrl ?? currentState.record?.accessToken ?? null,
      status: "connected",
      connectedAt: currentState.record?.connectedAt ?? new Date(),
      disconnectedAt: null,
      metadata: buildSlackConnectionMetadata({
        channelName: parsed.data.channelName ?? currentState.channelName,
        preferences,
      }),
    },
  });

  await createAuditLog({
    workspaceId: context.workspace.id,
    actorUserId: context.userId,
    eventType: "integration.slack.updated",
    entityType: "integration_connection",
    entityId: context.workspace.id,
    metadataJson: {
      provider: SLACK_PROVIDER,
      channelName: parsed.data.channelName ?? currentState.channelName ?? null,
      usingEnvWebhook: !parsed.data.webhookUrl,
      preferences,
    },
  });

  revalidatePath("/settings");

  return {
    status: "success" as const,
    message: "Slack alerts are connected for this workspace.",
  };
}

export async function disconnectSlackConnection(
  previousState: SlackConnectionActionState
) {
  void previousState;
  const context = await requireWorkspace();

  if (!context) {
    return {
      ...initialSlackConnectionActionState,
      status: "error" as const,
      message: "Sign in to a workspace before disconnecting Slack.",
    };
  }

  const currentState = await getSlackConnectionState(context.workspace.id);

  await prisma.integrationConnection.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: context.workspace.id,
        provider: SLACK_PROVIDER,
      },
    },
    create: {
      workspaceId: context.workspace.id,
      provider: SLACK_PROVIDER,
      status: "disconnected",
      disconnectedAt: new Date(),
      metadata: buildSlackConnectionMetadata({
        channelName: currentState.channelName,
        preferences: currentState.preferences,
      }),
    },
    update: {
      status: "disconnected",
      disconnectedAt: new Date(),
      metadata: buildSlackConnectionMetadata({
        channelName: currentState.channelName,
        preferences: currentState.preferences,
      }),
    },
  });

  await createAuditLog({
    workspaceId: context.workspace.id,
    actorUserId: context.userId,
    eventType: "integration.slack.disconnected",
    entityType: "integration_connection",
    entityId: context.workspace.id,
    metadataJson: {
      provider: SLACK_PROVIDER,
    },
  });

  revalidatePath("/settings");

  return {
    status: "success" as const,
    message: "Slack alerts have been disconnected for this workspace.",
  };
}
