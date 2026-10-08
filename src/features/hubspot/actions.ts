"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  HUBSPOT_CONNECTION_MODE,
  HUBSPOT_PROVIDER,
  fetchHubSpotAccountDetails,
  getHubSpotConnectionState,
  isHubSpotPrivateAppConfigured,
} from "@/features/hubspot/connection";
import {
  initialHubSpotConnectionActionState,
  initialHubSpotSyncActionState,
  type HubSpotConnectionActionState,
  type HubSpotSyncActionState,
} from "@/features/hubspot/state";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { enqueueHubSpotSync } from "@/lib/trigger";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";

const prismaIntegrationConnection = (prisma as typeof prisma & {
  integrationConnection: {
    upsert: (args: {
      where: {
        workspaceId_provider: {
          workspaceId: string;
          provider: "hubspot";
        };
      };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}).integrationConnection;

const retryHubSpotSyncSchema = z.object({
  leadId: z.string().trim().min(1, "Lead ID is required."),
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

export async function connectHubSpotPrivateApp(
  previousState: HubSpotConnectionActionState
) {
  void previousState;
  const context = await requireWorkspace();

  if (!context) {
    return {
      ...initialHubSpotConnectionActionState,
      status: "error" as const,
      message: "Sign in to a workspace before connecting HubSpot.",
    };
  }

  if (!isHubSpotPrivateAppConfigured()) {
    return {
      ...initialHubSpotConnectionActionState,
      status: "error" as const,
      message: "Add HUBSPOT_PRIVATE_APP_TOKEN to .env.local before connecting this workspace.",
    };
  }

  const accountDetails = await fetchHubSpotAccountDetails();

  await prismaIntegrationConnection.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: context.workspace.id,
        provider: HUBSPOT_PROVIDER,
      },
    },
    create: {
      workspaceId: context.workspace.id,
      provider: HUBSPOT_PROVIDER,
      status: "connected",
      connectedAt: new Date(),
      metadata: {
        mode: HUBSPOT_CONNECTION_MODE,
        portalId: accountDetails.portalId,
        accountName: accountDetails.accountName,
      },
    },
    update: {
      status: "connected",
      connectedAt: new Date(),
      disconnectedAt: null,
      metadata: {
        mode: HUBSPOT_CONNECTION_MODE,
        portalId: accountDetails.portalId,
        accountName: accountDetails.accountName,
      },
    },
  });

  await createAuditLog({
    workspaceId: context.workspace.id,
    actorUserId: context.userId,
    eventType: "integration.hubspot.connected",
    entityType: "integration_connection",
    entityId: context.workspace.id,
    metadataJson: {
      provider: HUBSPOT_PROVIDER,
      mode: HUBSPOT_CONNECTION_MODE,
      portalId: accountDetails.portalId,
      accountName: accountDetails.accountName,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/leads");

  return {
    status: "success" as const,
    message: accountDetails.accountName
      ? `HubSpot is connected for ${accountDetails.accountName}.`
      : "HubSpot is connected for this workspace.",
  };
}

export async function disconnectHubSpotConnection(
  previousState: HubSpotConnectionActionState
) {
  void previousState;
  const context = await requireWorkspace();

  if (!context) {
    return {
      ...initialHubSpotConnectionActionState,
      status: "error" as const,
      message: "Sign in to a workspace before disconnecting HubSpot.",
    };
  }

  await prismaIntegrationConnection.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: context.workspace.id,
        provider: HUBSPOT_PROVIDER,
      },
    },
    create: {
      workspaceId: context.workspace.id,
      provider: HUBSPOT_PROVIDER,
      status: "disconnected",
      disconnectedAt: new Date(),
      metadata: {
        mode: HUBSPOT_CONNECTION_MODE,
      },
    },
    update: {
      status: "disconnected",
      disconnectedAt: new Date(),
    },
  });

  await createAuditLog({
    workspaceId: context.workspace.id,
    actorUserId: context.userId,
    eventType: "integration.hubspot.disconnected",
    entityType: "integration_connection",
    entityId: context.workspace.id,
    metadataJson: {
      provider: HUBSPOT_PROVIDER,
      mode: HUBSPOT_CONNECTION_MODE,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/leads");

  return {
    status: "success" as const,
    message: "HubSpot has been disconnected for this workspace.",
  };
}

export async function retryHubSpotSync(
  previousState: HubSpotSyncActionState,
  formData: FormData
) {
  void previousState;
  const context = await requireWorkspace();

  if (!context) {
    return {
      ...initialHubSpotSyncActionState,
      status: "error" as const,
      message: "Sign in to a workspace before retrying HubSpot sync.",
    };
  }

  const parsed = retryHubSpotSyncSchema.safeParse({
    leadId: formData.get("leadId"),
  });

  if (!parsed.success) {
    return {
      ...initialHubSpotSyncActionState,
      status: "error" as const,
      message:
        parsed.error.issues[0]?.message ??
        "The HubSpot sync retry request is invalid.",
    };
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: parsed.data.leadId,
      workspaceId: context.workspace.id,
    },
    select: {
      id: true,
      fullName: true,
      status: true,
    },
  });

  if (!lead) {
    return {
      ...initialHubSpotSyncActionState,
      status: "error" as const,
      message: "That lead could not be found in the active workspace.",
    };
  }

  const connectionState = await getHubSpotConnectionState(context.workspace.id);

  if (!connectionState.isConnected) {
    return {
      ...initialHubSpotSyncActionState,
      status: "error" as const,
      message: "Connect HubSpot in Settings before retrying lead syncs.",
    };
  }

  const enqueueResult = await enqueueHubSpotSync({
    workspaceId: context.workspace.id,
    entityId: lead.id,
    entityType: "lead",
    actorUserId: context.userId,
    force: true,
  });

  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");

  if (!enqueueResult.ok) {
    return {
      ...initialHubSpotSyncActionState,
      status: "error" as const,
      message: enqueueResult.error,
    };
  }

  return {
    status: "success" as const,
    message: `${lead.fullName} has been re-queued for HubSpot sync.`,
  };
}
