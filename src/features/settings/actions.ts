"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";
import {
  initialLeadScoringSettingsActionState,
  type LeadScoringSettingsActionState,
} from "./state";

const prismaWorkspace = (prisma as typeof prisma & {
  workspace: {
    update: (args: {
      where: {
        id: string;
      };
      data: {
        leadScoringCriteria: string | null;
      };
    }) => Promise<unknown>;
  };
}).workspace;

const leadScoringSettingsSchema = z.object({
  criteria: z
    .string()
    .trim()
    .max(4_000, "Keep the ICP guidance under 4,000 characters."),
});

export async function saveLeadScoringSettings(
  previousState: LeadScoringSettingsActionState,
  formData: FormData
) {
  void previousState;
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      ...initialLeadScoringSettingsActionState,
      status: "error" as const,
      message: "Sign in to a workspace before saving lead scoring settings.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      ...initialLeadScoringSettingsActionState,
      status: "error" as const,
      message: "The active organization is not linked to a workspace yet.",
    };
  }

  const parsed = leadScoringSettingsSchema.safeParse({
    criteria: formData.get("criteria"),
  });

  if (!parsed.success) {
    return {
      ...initialLeadScoringSettingsActionState,
      status: "error" as const,
      message:
        parsed.error.issues[0]?.message ??
        "The lead scoring settings payload is invalid.",
    };
  }

  const criteria = parsed.data.criteria.length > 0 ? parsed.data.criteria : null;

  await prismaWorkspace.update({
    where: {
      id: workspace.id,
    },
    data: {
      leadScoringCriteria: criteria,
    },
  });

  await createAuditLog({
    workspaceId: workspace.id,
    actorUserId: userId,
    eventType: "workspace.lead_scoring.updated",
    entityType: "workspace",
    entityId: workspace.id,
    metadataJson: {
      hasCustomCriteria: Boolean(criteria),
      criteriaLength: criteria?.length ?? 0,
    },
  });

  revalidatePath("/settings");

  return {
    status: "success" as const,
    message: criteria
      ? "Lead scoring guidance was saved for this workspace."
      : "Custom lead scoring guidance was cleared.",
  };
}
