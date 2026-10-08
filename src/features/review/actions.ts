"use server";

import { revalidatePath } from "next/cache";
import { getHubSpotConnectionState } from "@/features/hubspot/connection";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { enqueueHubSpotSync } from "@/lib/trigger";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";
import type { ReviewActionState } from "./state";

function getOverrideEntries(formData: FormData) {
  return Array.from(formData.entries())
    .filter(([key]) => key.startsWith("field:"))
    .map(([key, value]) => ({
      fieldId: key.replace("field:", ""),
      value: typeof value === "string" ? value.trim() : "",
    }));
}

async function requireReviewActor() {
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    throw new Error("Sign in to review extracted records.");
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    throw new Error("The active organization is not linked to a workspace.");
  }

  return {
    userId,
    workspaceId: workspace.id,
  };
}

function parseMissingFields(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function submitDocumentReview(
  _previousState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  try {
    const { userId, workspaceId } = await requireReviewActor();
    const reviewTaskId = String(formData.get("reviewTaskId") ?? "").trim();
    const intent = String(formData.get("intent") ?? "").trim();

    if (!reviewTaskId) {
      return {
        status: "error",
        message: "Review task id is missing.",
      };
    }

    if (!["approve", "reject", "edit_approve"].includes(intent)) {
      return {
        status: "error",
        message: "Unknown review action.",
      };
    }

    const reviewTask = await prisma.reviewTask.findFirst({
      where: {
        id: reviewTaskId,
        workspaceId,
        entityType: "document",
      },
    });

    if (!reviewTask) {
      return {
        status: "error",
        message: "That review task could not be found in the active workspace.",
      };
    }

    if (reviewTask.status !== "pending") {
      return {
        status: "error",
        message: "This review task has already been resolved.",
      };
    }

    const document = await prisma.document.findFirst({
      where: {
        id: reviewTask.entityId,
        workspaceId,
      },
      include: {
        extractedRecords: {
          orderBy: {
            extractedAt: "desc",
          },
          take: 1,
          include: {
            fields: {
              orderBy: {
                fieldName: "asc",
              },
            },
          },
        },
      },
    });

    const extractedRecord = document?.extractedRecords[0] ?? null;

    if (!document || !extractedRecord) {
      return {
        status: "error",
        message: "The document no longer has an extracted record to review.",
      };
    }

    const overrideEntries = getOverrideEntries(formData);
    const fieldLookup = new Map(
      extractedRecord.fields.map((field) => [
        field.id,
        {
          fieldName: field.fieldName,
          baseValue: field.fieldValue ?? "",
          currentValue: field.isOverridden
            ? field.reviewerOverrideValue ?? ""
            : field.fieldValue ?? "",
        },
      ])
    );

    const changedFields = overrideEntries
      .map((entry) => {
        const original = fieldLookup.get(entry.fieldId);

        if (!original) {
          return null;
        }

        return {
          fieldId: entry.fieldId,
          fieldName: original.fieldName,
          previousValue: original.currentValue,
          baseValue: original.baseValue,
          nextValue: entry.value,
        };
      })
      .filter(
        (
          change
        ): change is {
          fieldId: string;
          fieldName: string;
          previousValue: string;
          baseValue: string;
          nextValue: string;
        } => Boolean(change)
      )
      .filter((change) => change.previousValue !== change.nextValue);

    const resolutionStatus = intent === "reject" ? "rejected" : "approved";

    const approvalAction = await prisma.$transaction(async (tx) => {
      if (intent === "edit_approve") {
        for (const change of changedFields) {
          await tx.extractedField.update({
            where: {
              id: change.fieldId,
            },
            data: {
              reviewerOverrideValue:
                change.nextValue !== change.baseValue ? change.nextValue : null,
              isOverridden: change.nextValue !== change.baseValue,
            },
          });
        }
      }

      await tx.reviewTask.update({
        where: {
          id: reviewTask.id,
        },
        data: {
          status: resolutionStatus,
          assignedToUserId: null,
          resolvedByUserId: userId,
          resolvedAt: new Date(),
        },
      });

      await tx.document.update({
        where: {
          id: document.id,
        },
        data: {
          processingStatus: resolutionStatus === "approved" ? "approved" : "rejected",
          processingError: null,
        },
      });

      return tx.approvalAction.create({
        data: {
          reviewTaskId: reviewTask.id,
          workspaceId,
          action: intent as "approve" | "reject" | "edit_approve",
          actorUserId: userId,
          changesJson:
            intent === "edit_approve"
              ? {
                  changedFields,
                }
              : undefined,
        },
      });
    });

    await createAuditLog({
      workspaceId,
      actorUserId: userId,
      eventType:
        intent === "approve"
          ? "document.review.approved"
          : intent === "reject"
            ? "document.review.rejected"
            : "document.review.edit_approved",
      entityType: "document",
      entityId: document.id,
      metadataJson: {
        reviewTaskId: reviewTask.id,
        approvalActionId: approvalAction.id,
        action: intent,
        changedFieldCount: changedFields.length,
        changedFields,
      },
    });

    revalidatePath("/review-queue");
    revalidatePath(`/review-queue/${reviewTask.id}`);
    revalidatePath(`/documents/${document.id}`);
    revalidatePath("/documents");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message:
        intent === "approve"
          ? "Document approved and removed from the pending queue."
          : intent === "reject"
            ? "Document rejected and the review task was closed."
            : "Edits were saved and the document was approved.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "The review action could not be completed.",
    };
  }
}

export async function submitLeadReview(
  _previousState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  try {
    const { userId, workspaceId } = await requireReviewActor();
    const reviewTaskId = String(formData.get("reviewTaskId") ?? "").trim();
    const intent = String(formData.get("intent") ?? "").trim();
    const numericScoreRaw = String(formData.get("numericScore") ?? "").trim();
    const fitLabel = String(formData.get("fitLabel") ?? "").trim();
    const reasoning = String(formData.get("reasoning") ?? "").trim();
    const missingFieldsRaw = String(formData.get("missingFields") ?? "").trim();

    if (!reviewTaskId) {
      return {
        status: "error",
        message: "Review task id is missing.",
      };
    }

    if (!["approve", "reject"].includes(intent)) {
      return {
        status: "error",
        message: "Unknown review action.",
      };
    }

    const numericScore = Number.parseInt(numericScoreRaw, 10);
    if (Number.isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
      return {
        status: "error",
        message: "Score must be a whole number between 0 and 100.",
      };
    }

    if (!["high_fit", "medium_fit", "low_fit"].includes(fitLabel)) {
      return {
        status: "error",
        message: "Choose a valid fit label.",
      };
    }

    if (!reasoning) {
      return {
        status: "error",
        message: "Reasoning is required before resolving a lead review.",
      };
    }

    const reviewTask = await prisma.reviewTask.findFirst({
      where: {
        id: reviewTaskId,
        workspaceId,
        entityType: "lead",
      },
    });

    if (!reviewTask) {
      return {
        status: "error",
        message: "That review task could not be found in the active workspace.",
      };
    }

    if (reviewTask.status !== "pending") {
      return {
        status: "error",
        message: "This review task has already been resolved.",
      };
    }

    const lead = await prisma.lead.findFirst({
      where: {
        id: reviewTask.entityId,
        workspaceId,
      },
      include: {
        score: true,
      },
    });

    if (!lead || !lead.score) {
      return {
        status: "error",
        message: "The reviewed lead no longer has a score to validate.",
      };
    }

    const missingFields = parseMissingFields(missingFieldsRaw);
    const changedFields = [
      lead.score.numericScore !== numericScore
        ? {
            fieldName: "numericScore",
            previousValue: String(lead.score.numericScore),
            nextValue: String(numericScore),
          }
        : null,
      lead.score.fitLabel !== fitLabel
        ? {
            fieldName: "fitLabel",
            previousValue: lead.score.fitLabel,
            nextValue: fitLabel,
          }
        : null,
      lead.score.reasoning !== reasoning
        ? {
            fieldName: "reasoning",
            previousValue: lead.score.reasoning,
            nextValue: reasoning,
          }
        : null,
      JSON.stringify(Array.isArray(lead.score.missingDataJson) ? lead.score.missingDataJson : []) !==
      JSON.stringify(missingFields)
        ? {
            fieldName: "missingFields",
            previousValue: Array.isArray(lead.score.missingDataJson)
              ? lead.score.missingDataJson.join(", ")
              : "",
            nextValue: missingFields.join(", "),
          }
        : null,
    ].filter(
      (
        change
      ): change is {
        fieldName: string;
        previousValue: string;
        nextValue: string;
      } => Boolean(change)
    );

    const resolutionStatus = intent === "approve" ? "qualified" : "low_priority";
    const reviewStatus = intent === "approve" ? "approved" : "rejected";

    const approvalAction = await prisma.$transaction(async (tx) => {
      await tx.leadScore.update({
        where: {
          leadId: lead.id,
        },
        data: {
          numericScore,
          fitLabel: fitLabel as "high_fit" | "medium_fit" | "low_fit",
          reasoning,
          missingDataJson: missingFields,
        },
      });

      await tx.reviewTask.update({
        where: {
          id: reviewTask.id,
        },
        data: {
          status: reviewStatus,
          assignedToUserId: null,
          resolvedByUserId: userId,
          resolvedAt: new Date(),
        },
      });

      await tx.lead.update({
        where: {
          id: lead.id,
        },
        data: {
          status: resolutionStatus as "qualified" | "low_priority",
          processingError: null,
        },
      });

      return tx.approvalAction.create({
        data: {
          reviewTaskId: reviewTask.id,
          workspaceId,
          action:
            intent === "approve" && changedFields.length > 0
              ? "edit_approve"
              : (intent as "approve" | "reject"),
          actorUserId: userId,
          changesJson: {
            resolutionStatus,
            changedFields,
          },
        },
      });
    });

    await createAuditLog({
      workspaceId,
      actorUserId: userId,
      eventType:
        intent === "approve" && changedFields.length > 0
          ? "lead.review.edit_approved"
          : intent === "approve"
            ? "lead.review.approved"
            : "lead.review.rejected",
      entityType: "lead",
      entityId: lead.id,
      metadataJson: {
        reviewTaskId: reviewTask.id,
        approvalActionId: approvalAction.id,
        action: intent,
        resolutionStatus,
        changedFieldCount: changedFields.length,
        changedFields,
      },
    });

    let syncMessage = "";
    if (resolutionStatus === "qualified") {
      const connectionState = await getHubSpotConnectionState(workspaceId);
      if (connectionState.isConnected) {
        const syncResult = await enqueueHubSpotSync({
          workspaceId,
          entityId: lead.id,
          entityType: "lead",
          actorUserId: userId,
          force: true,
        });

        syncMessage = syncResult.ok
          ? " HubSpot sync was queued."
          : ` HubSpot sync could not be queued: ${syncResult.error}`;
      } else {
        await createAuditLog({
          workspaceId,
          actorUserId: userId,
          eventType: "lead.hubspot_sync.skipped",
          entityType: "lead",
          entityId: lead.id,
          metadataJson: {
            reason: "workspace_not_connected",
            provider: "hubspot",
            source: "lead_review",
          },
        });
      }
    }

    revalidatePath("/review-queue");
    revalidatePath(`/review-queue/${reviewTask.id}`);
    revalidatePath(`/leads/${lead.id}`);
    revalidatePath("/leads");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message:
        resolutionStatus === "qualified"
          ? `Lead approved for follow-up.${syncMessage}`
          : "Lead marked low priority and removed from the review queue.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "The lead review action could not be completed.",
    };
  }
}
