import type { ReviewTaskStatus } from "@/generated/prisma/client";
import { formatDocumentType } from "@/features/documents/config";
import { prisma } from "@/lib/prisma";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";
import {
  getEffectiveFieldValue,
  serializeCsv,
  toPlainValue,
  type ReviewExportRecord,
} from "./export-serialization";

type ExportFormat = "csv" | "json";

async function requireExportWorkspace() {
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    throw new Error("Unauthorized");
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  return workspace;
}

async function buildDocumentExportRecord(reviewTaskId: string, workspaceId: string) {
  const reviewTask = await prisma.reviewTask.findFirst({
    where: {
      id: reviewTaskId,
      workspaceId,
      entityType: "document",
      status: "approved",
    },
    include: {
      approvalActions: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!reviewTask) {
    return null;
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
    return null;
  }

  const record: ReviewExportRecord = {
    review_task_id: reviewTask.id,
    document_id: document.id,
    file_name: document.fileName,
    document_type: formatDocumentType(document.documentType),
    review_status: reviewTask.status,
    resolved_at: reviewTask.resolvedAt?.toISOString() ?? "",
    extracted_at: extractedRecord.extractedAt.toISOString(),
    confidence_score: String(extractedRecord.confidenceScore),
    prompt_version: extractedRecord.promptVersion,
    model_used: extractedRecord.modelUsed,
  };

  Object.entries(extractedRecord.extractionJson as Record<string, unknown>).forEach(
    ([key, value]) => {
      record[`raw_${key}`] = toPlainValue(value);
    }
  );

  extractedRecord.fields.forEach((field) => {
    record[field.fieldName] = getEffectiveFieldValue(field);
  });

  const latestAction = reviewTask.approvalActions[0] ?? null;
  if (latestAction) {
    record.review_action = latestAction.action;
    record.review_actor = latestAction.actorUserId;
  }

  return record;
}

async function buildBatchDocumentExportRecords(
  workspaceId: string,
  status: ReviewTaskStatus = "approved"
) {
  const reviewTasks = await prisma.reviewTask.findMany({
    where: {
      workspaceId,
      entityType: "document",
      status,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  const records = await Promise.all(
    reviewTasks.map((reviewTask) =>
      buildDocumentExportRecord(reviewTask.id, workspaceId)
    )
  );

  return records.filter((record): record is ReviewExportRecord => record !== null);
}

export async function exportSingleApprovedReviewTask(reviewTaskId: string, format: ExportFormat) {
  const workspace = await requireExportWorkspace();
  const record = await buildDocumentExportRecord(reviewTaskId, workspace.id);

  if (!record) {
    return null;
  }

  if (format === "json") {
    return {
      body: JSON.stringify(record, null, 2),
      contentType: "application/json; charset=utf-8",
      fileName: `review-task-${reviewTaskId}.json`,
    };
  }

  return {
    body: serializeCsv([record]),
    contentType: "text/csv; charset=utf-8",
    fileName: `review-task-${reviewTaskId}.csv`,
  };
}

export async function exportApprovedReviewTasks(format: ExportFormat) {
  const workspace = await requireExportWorkspace();
  const records = await buildBatchDocumentExportRecords(workspace.id, "approved");

  if (format === "json") {
    return {
      body: JSON.stringify(records, null, 2),
      contentType: "application/json; charset=utf-8",
      fileName: `approved-review-records-${workspace.slug}.json`,
    };
  }

  return {
    body: serializeCsv(records),
    contentType: "text/csv; charset=utf-8",
    fileName: `approved-review-records-${workspace.slug}.csv`,
  };
}
