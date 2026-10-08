import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import {
  LOCAL_QA_AUTH_COOKIE,
  LOCAL_QA_AUTH_HEADER,
  normalizeQaWorkspaceSlug,
} from "@/lib/local-qa-auth";
import { prisma } from "@/lib/prisma";
import type { Workspace } from "../generated/prisma/client";

const LOCAL_QA_USER_ID = "local-qa-user";

export type WorkspaceContext = {
  userId: string;
  clerkOrgId: string | null;
  workspaceId: string | null;
  workspace: Workspace | null;
};

export type ResolvedWorkspaceContext = {
  userId: string;
  clerkOrgId: string;
  workspaceId: string;
  workspace: Workspace;
};

export type RequestAuthContext = {
  userId: string | null;
  orgId: string | null;
  isLocalQaBypass: boolean;
};

function isLocalQaBypassEnabled() {
  return process.env.NODE_ENV === "development";
}

async function getLocalQaWorkspaceSlug() {
  if (!isLocalQaBypassEnabled()) {
    return null;
  }

  const requestHeaders = await headers();
  const headerWorkspaceSlug = normalizeQaWorkspaceSlug(
    requestHeaders.get(LOCAL_QA_AUTH_HEADER)
  );

  if (headerWorkspaceSlug) {
    return headerWorkspaceSlug;
  }

  const cookieStore = await cookies();
  return normalizeQaWorkspaceSlug(cookieStore.get(LOCAL_QA_AUTH_COOKIE)?.value);
}

const getWorkspaceBySlug = cache(async function getWorkspaceBySlug(slug: string) {
  return prisma.workspace.findUnique({
    where: { slug },
  });
});

export async function getAuthContext(): Promise<RequestAuthContext> {
  const authState = await auth();

  if (authState.userId) {
    return {
      userId: authState.userId,
      orgId: authState.orgId ?? null,
      isLocalQaBypass: false,
    };
  }

  const qaWorkspaceSlug = await getLocalQaWorkspaceSlug();

  if (!qaWorkspaceSlug) {
    return {
      userId: authState.userId ?? null,
      orgId: authState.orgId ?? null,
      isLocalQaBypass: false,
    };
  }

  const workspace = await getWorkspaceBySlug(qaWorkspaceSlug);

  if (!workspace?.clerkOrgId) {
    return {
      userId: authState.userId ?? null,
      orgId: authState.orgId ?? null,
      isLocalQaBypass: false,
    };
  }

  return {
    userId: LOCAL_QA_USER_ID,
    orgId: workspace.clerkOrgId,
    isLocalQaBypass: true,
  };
}

export const getWorkspaceByClerkOrgId = cache(async function getWorkspaceByClerkOrgId(
  clerkOrgId: string
) {
  return prisma.workspace.findUnique({
    where: { clerkOrgId },
  });
});

export const getCurrentWorkspaceContext = cache(
  async function getCurrentWorkspaceContext(): Promise<WorkspaceContext | null> {
  const { userId, orgId } = await getAuthContext();

  if (!userId) {
    return null;
  }

  if (!orgId) {
    return {
      userId,
      clerkOrgId: null,
      workspaceId: null,
      workspace: null,
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  return {
    userId,
    clerkOrgId: orgId,
    workspaceId: workspace?.id ?? null,
    workspace,
  };
});

export async function requireWorkspaceContext(): Promise<ResolvedWorkspaceContext> {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    redirect("/sign-in");
  }

  if (!context.clerkOrgId || !context.workspaceId || !context.workspace) {
    redirect("/setup");
  }

  return {
    userId: context.userId,
    clerkOrgId: context.clerkOrgId,
    workspaceId: context.workspaceId,
    workspace: context.workspace,
  };
}
