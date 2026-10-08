"use server";

import { clerkClient, currentUser } from "@clerk/nextjs/server";
import slugify from "slugify";
import { z } from "zod";
import {
  type InviteState,
  type WorkspaceProvisionState,
  initialWorkspaceProvisionState,
} from "@/features/workspaces/state";
import { ensureDefaultFormLeadSource } from "@/features/leads/sources";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["org:member", "org:admin"]),
});

export async function provisionWorkspace(
  previousState: WorkspaceProvisionState
) {
  void previousState;
  const { userId, orgId, isLocalQaBypass } = await getAuthContext();

  if (!userId) {
    return {
      ...initialWorkspaceProvisionState,
      status: "error" as const,
      message: "Sign in before creating a workspace.",
    };
  }

  if (isLocalQaBypass) {
    return {
      ...initialWorkspaceProvisionState,
      status: "error" as const,
      message: "Local QA bypass cannot create or provision Clerk workspaces.",
    };
  }

  if (orgId) {
    const existingWorkspace = await getWorkspaceByClerkOrgId(orgId);

    if (existingWorkspace) {
      return {
        status: "success" as const,
        message: "Workspace already provisioned.",
        organizationId: orgId,
      };
    }
  }

  const user = await currentUser();
  const client = await clerkClient();
  const workspaceName =
    user?.firstName?.trim() ||
    user?.username?.trim() ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Ops Workspace";
  const baseSlug = slugify(workspaceName, {
    lower: true,
    strict: true,
    trim: true,
  });
  const suffix = userId.slice(-6).toLowerCase();
  const slug = baseSlug ? `${baseSlug}-${suffix}` : `workspace-${suffix}`;

  const organization =
    orgId != null
      ? await client.organizations.getOrganization({ organizationId: orgId })
      : await client.organizations.createOrganization({
          name: workspaceName,
          slug,
          createdBy: userId,
        });

  const workspace = await prisma.workspace.upsert({
    where: { clerkOrgId: organization.id },
    update: {
      name: organization.name,
      slug: organization.slug ?? slug,
    },
    create: {
      clerkOrgId: organization.id,
      name: organization.name,
      slug: organization.slug ?? slug,
      plan: "free",
    },
  });

  await ensureDefaultFormLeadSource(workspace.id);

  await createAuditLog({
    workspaceId: workspace.id,
    actorUserId: userId,
    eventType: "workspace.created",
    entityType: "workspace",
    entityId: workspace.id,
    metadataJson: {
      clerkOrgId: organization.id,
      source: "setup-flow",
    },
  });

  return {
    status: "success" as const,
    message: "Workspace created successfully.",
    organizationId: organization.id,
  };
}

export async function inviteWorkspaceMember(
  previousState: InviteState,
  formData: FormData
) {
  void previousState;
  const { userId, orgId, isLocalQaBypass } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      status: "error" as const,
      message: "An active workspace is required before sending invites.",
    };
  }

  if (isLocalQaBypass) {
    return {
      status: "error" as const,
      message: "Local QA bypass cannot send Clerk organization invites.",
    };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Enter a valid email address and role.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      status: "error" as const,
      message:
        "The current Clerk organization is not linked to a workspace row yet.",
    };
  }

  const client = await clerkClient();
  await client.organizations.createOrganizationInvitation({
    organizationId: orgId,
    emailAddress: parsed.data.email,
    role: parsed.data.role,
    inviterUserId: userId,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard`,
  });

  await createAuditLog({
    workspaceId: workspace.id,
    actorUserId: userId,
    eventType: "workspace.invite.sent",
    entityType: "workspace",
    entityId: workspace.id,
    metadataJson: {
      emailAddress: parsed.data.email,
      role: parsed.data.role,
    },
  });

  return {
    status: "success" as const,
    message: `Invitation sent to ${parsed.data.email}.`,
  };
}
