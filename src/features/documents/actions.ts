"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { deleteDocumentFromR2 } from "@/lib/r2";
import { enqueueDocumentExtraction } from "@/lib/trigger";
import { validateDocumentFile } from "@/lib/r2";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";
import {
  initialDocumentRetryActionState,
  type DocumentRetryActionState,
} from "./state";

const finalizeDocumentUploadSchema = z.object({
  fileName: z.string().trim().min(1, "File name is required."),
  mimeType: z.string().trim().min(1, "Mime type is required."),
  fileSize: z.number().int().positive("File size must be greater than zero."),
  storageKey: z.string().trim().min(1, "Storage key is required."),
  documentType: z.enum(["invoice", "onboarding_form", "agreement"]),
});

const deleteDocumentSchema = z.object({
  documentId: z.string().trim().min(1, "Document ID is required."),
});

const retryDocumentSchema = z.object({
  documentId: z.string().trim().min(1, "Document ID is required."),
});

export type DeleteDocumentActionState = {
  error: string | null;
};

export async function finalizeDocumentUpload(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  documentType: "invoice" | "onboarding_form" | "agreement";
}) {
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    throw new Error("Sign in to a workspace before uploading documents.");
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    throw new Error("The active organization is not linked to a workspace yet.");
  }

  const parsed = finalizeDocumentUploadSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "The upload payload is invalid.");
  }

  validateDocumentFile(parsed.data);

  const document = await prisma.document.upsert({
    where: {
      workspaceId_storageKey: {
        workspaceId: workspace.id,
        storageKey: parsed.data.storageKey,
      },
    },
    create: {
      workspaceId: workspace.id,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      fileSize: parsed.data.fileSize,
      storageKey: parsed.data.storageKey,
      documentType: parsed.data.documentType,
      uploadStatus: "uploaded",
      processingStatus: "pending",
      processingError: null,
    },
    update: {
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      fileSize: parsed.data.fileSize,
      documentType: parsed.data.documentType,
      uploadStatus: "uploaded",
      processingStatus: "pending",
      processingError: null,
    },
  });

  await createAuditLog({
    workspaceId: workspace.id,
    actorUserId: userId,
    eventType: "document.upload.completed",
    entityType: "document",
    entityId: document.id,
    metadataJson: {
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      storageKey: document.storageKey,
      documentType: document.documentType,
    },
  });

  const enqueueResult = await enqueueDocumentExtraction({
    workspaceId: workspace.id,
    entityId: document.id,
    entityType: "document",
    actorUserId: userId,
  });

  revalidatePath("/documents");
  revalidatePath("/dashboard");

  return {
    ok: true as const,
    documentId: document.id,
    queued: enqueueResult.ok,
    queueError: enqueueResult.ok ? null : enqueueResult.error,
  };
}

export async function markDocumentUploadFailed(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey?: string | null;
  documentType: "invoice" | "onboarding_form" | "agreement";
  errorMessage: string;
}) {
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return;
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return;
  }

  await createAuditLog({
    workspaceId: workspace.id,
    actorUserId: userId,
    eventType: "document.upload.failed",
    entityType: "document",
    entityId: null,
    metadataJson: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      storageKey: input.storageKey?.trim() || null,
      documentType: input.documentType,
      error: input.errorMessage,
    },
  });

  revalidatePath("/documents");
  revalidatePath("/dashboard");
}

export async function deleteDocumentAction(
  _previousState: DeleteDocumentActionState,
  formData: FormData
): Promise<DeleteDocumentActionState> {
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      error: "Sign in to a workspace before deleting documents.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      error: "The active organization is not linked to a workspace yet.",
    };
  }

  const parsed = deleteDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "The delete request is invalid.",
    };
  }

  const document = await prisma.document.findFirst({
    where: {
      id: parsed.data.documentId,
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      fileName: true,
      documentType: true,
      mimeType: true,
      fileSize: true,
      storageKey: true,
    },
  });

  if (!document) {
    return {
      error: "That document no longer exists in this workspace.",
    };
  }

  try {
    await deleteDocumentFromR2(document.storageKey);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Could not delete the file from Cloudflare R2: ${error.message}`
          : "Could not delete the file from Cloudflare R2.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.reviewTask.deleteMany({
      where: {
        workspaceId: workspace.id,
        entityType: "document",
        entityId: document.id,
      },
    });

    await tx.document.delete({
      where: {
        id: document.id,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: userId,
        eventType: "document.deleted",
        entityType: "document",
        entityId: document.id,
        metadataJson: {
          fileName: document.fileName,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
          storageKey: document.storageKey,
          documentType: document.documentType,
        },
      },
    });
  });

  revalidatePath("/documents");
  revalidatePath("/dashboard");
  revalidatePath("/review-queue");
  redirect("/documents");
}

export async function retryDocumentProcessing(
  previousState: DocumentRetryActionState,
  formData: FormData
): Promise<DocumentRetryActionState> {
  void previousState;
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      ...initialDocumentRetryActionState,
      status: "error",
      message: "Sign in to a workspace before reprocessing documents.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      ...initialDocumentRetryActionState,
      status: "error",
      message: "The active organization is not linked to a workspace yet.",
    };
  }

  const parsed = retryDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
  });

  if (!parsed.success) {
    return {
      ...initialDocumentRetryActionState,
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "The document reprocess request is invalid.",
    };
  }

  const document = await prisma.document.findFirst({
    where: {
      id: parsed.data.documentId,
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      fileName: true,
      uploadStatus: true,
      processingStatus: true,
    },
  });

  if (!document) {
    return {
      ...initialDocumentRetryActionState,
      status: "error",
      message: "That document could not be found in the active workspace.",
    };
  }

  if (document.uploadStatus !== "uploaded") {
    return {
      ...initialDocumentRetryActionState,
      status: "error",
      message: "This document cannot be reprocessed until the upload succeeds.",
    };
  }

  if (
    document.processingStatus === "extracting_text" ||
    document.processingStatus === "extracting_structured"
  ) {
    return {
      ...initialDocumentRetryActionState,
      status: "error",
      message: "This document is already being processed.",
    };
  }

  const enqueueResult = await enqueueDocumentExtraction({
    workspaceId: workspace.id,
    entityId: document.id,
    entityType: "document",
    actorUserId: userId,
    force: true,
  });

  revalidatePath(`/documents/${document.id}`);
  revalidatePath("/documents");
  revalidatePath("/dashboard");
  revalidatePath("/review-queue");

  if (!enqueueResult.ok) {
    return {
      ...initialDocumentRetryActionState,
      status: "error",
      message: enqueueResult.error,
    };
  }

  return {
    status: "success",
    message: `${document.fileName} has been re-queued for processing.`,
  };
}
