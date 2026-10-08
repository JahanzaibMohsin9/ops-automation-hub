import { AbortTaskRunError, logger, task, tasks } from "@trigger.dev/sdk";
import type { Prisma } from "@/generated/prisma/client";
import { extractDocumentText } from "@/features/documents/extraction-client";
import { extractStructuredDocumentData, toPrismaJson } from "@/features/documents/structured-extraction-client";
import {
  DOCUMENT_FIELD_REVIEW_THRESHOLD,
  DOCUMENT_OVERALL_REVIEW_THRESHOLD,
} from "@/features/documents/structured-extraction";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  getSlackNotificationIdempotencyKey,
  SEND_SLACK_NOTIFICATION_TASK_ID,
  type SendSlackNotificationPayload,
  type sendSlackNotificationTask,
} from "@/trigger/notifications";

export const DOCUMENT_EXTRACT_TEXT_TASK_ID = "document.extractText";
export const DOCUMENT_EXTRACT_STRUCTURED_TASK_ID = "document.extractStructured";

export type DocumentTaskPayload = {
  workspaceId: string;
  entityId: string;
  entityType: "document";
};

export type DocumentExtractTextResult = {
  documentId: string;
  acknowledged: true;
  message: string;
  totalPages: number;
  extractionMethod: string;
  ocrUsed: boolean;
};

export type DocumentExtractStructuredResult = {
  documentId: string;
  extractedRecordId: string;
  reviewTaskId: string | null;
  acknowledged: true;
  message: string;
  confidenceScore: number;
  requiresReview: boolean;
  fieldCount: number;
};

export function getDocumentTaskIdempotencyKey(payload: DocumentTaskPayload, taskId: string) {
  return [payload.entityType, payload.entityId, taskId].join(":");
}

export function getDocumentExtractTextIdempotencyKey(payload: DocumentTaskPayload) {
  return getDocumentTaskIdempotencyKey(payload, DOCUMENT_EXTRACT_TEXT_TASK_ID);
}

export function getDocumentExtractStructuredIdempotencyKey(payload: DocumentTaskPayload) {
  return getDocumentTaskIdempotencyKey(payload, DOCUMENT_EXTRACT_STRUCTURED_TASK_ID);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Trigger.dev task failure.";
}

const OCR_UNAVAILABLE_MESSAGE = "Tesseract is unavailable";

export function isOcrRequiredDocumentError(error: unknown, mimeType?: string | null) {
  const message = toErrorMessage(error);
  return Boolean(mimeType?.startsWith("image/")) && message.includes(OCR_UNAVAILABLE_MESSAGE);
}

function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function buildDocumentDetailUrl(documentId: string) {
  return `${getAppBaseUrl()}/documents/${documentId}`;
}

async function triggerSlackNotification(payload: SendSlackNotificationPayload) {
  await tasks.trigger<typeof sendSlackNotificationTask>(
    SEND_SLACK_NOTIFICATION_TASK_ID,
    payload,
    {
      idempotencyKey: getSlackNotificationIdempotencyKey(payload),
      maxAttempts: 3,
    }
  );
}

function isValidEmail(value: string | null) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isParseableDate(value: string | null) {
  return !value || !Number.isNaN(Date.parse(value));
}

function isInvoiceTotalConsistent(extraction: unknown) {
  if (!extraction || typeof extraction !== "object" || Array.isArray(extraction)) {
    return true;
  }

  const record = extraction as Record<string, unknown>;
  const subtotal = typeof record.subtotal === "number" ? record.subtotal : null;
  const tax = typeof record.tax === "number" ? record.tax : null;
  const total = typeof record.total === "number" ? record.total : null;

  if (subtotal == null || tax == null || total == null) {
    return true;
  }

  return Math.abs(subtotal + tax - total) <= 0.05;
}

function hasDeterministicValidationRisk(
  schemaType: string,
  extraction: unknown
) {
  if (!extraction || typeof extraction !== "object" || Array.isArray(extraction)) {
    return true;
  }

  const record = extraction as Record<string, unknown>;
  const dateFields =
    schemaType === "invoice"
      ? ["invoice_date", "due_date"]
      : schemaType === "onboarding_form"
        ? ["start_date"]
        : ["effective_date", "expiration_date"];
  const invalidDate = dateFields.some((field) => {
    const value = record[field];
    return typeof value === "string" ? !isParseableDate(value) : false;
  });

  if (schemaType === "onboarding_form") {
    const email = record.email;
    if (typeof email === "string" && !isValidEmail(email)) {
      return true;
    }
  }

  if (schemaType === "invoice" && !isInvoiceTotalConsistent(extraction)) {
    return true;
  }

  return invalidDate;
}

function getMinimumFieldConfidence(fields: Array<{ confidenceScore: number }>) {
  return fields.reduce(
    (minimum, field) => Math.min(minimum, field.confidenceScore),
    1
  );
}

async function syncDocumentReviewTask(
  tx: Prisma.TransactionClient,
  payload: DocumentTaskPayload,
  requiresReview: boolean
) {
  if (requiresReview) {
    const existingPendingTask = await tx.reviewTask.findFirst({
      where: {
        workspaceId: payload.workspaceId,
        entityType: "document",
        entityId: payload.entityId,
        status: "pending",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });

    if (existingPendingTask) {
      return existingPendingTask;
    }

    return tx.reviewTask.create({
      data: {
        workspaceId: payload.workspaceId,
        entityType: "document",
        entityId: payload.entityId,
        status: "pending",
      },
      select: {
        id: true,
      },
    });
  }

  await tx.reviewTask.updateMany({
    where: {
      workspaceId: payload.workspaceId,
      entityType: "document",
      entityId: payload.entityId,
      status: "pending",
    },
    data: {
      status: "approved",
      resolvedAt: new Date(),
      resolvedByUserId: null,
      assignedToUserId: null,
    },
  });

  return null;
}

export const documentExtractTextTask = task<
  typeof DOCUMENT_EXTRACT_TEXT_TASK_ID,
  DocumentTaskPayload,
  DocumentExtractTextResult
>({
  id: DOCUMENT_EXTRACT_TEXT_TASK_ID,
  retry: {
    maxAttempts: 3,
    factor: 6,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 300_000,
    randomize: false,
  },
  onStartAttempt: async ({ payload, ctx }) => {
    await prisma.document.update({
      where: {
        id: payload.entityId,
      },
      data: {
        processingStatus: "extracting_text",
        processingRunId: ctx.run.id,
        processingError: null,
      },
    });

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "document.extract_text.started",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts ?? 3,
        triggerRunId: ctx.run.id,
      },
    });
  },
  onSuccess: async ({ payload, output, ctx }) => {
    await prisma.document.update({
      where: {
        id: payload.entityId,
      },
      data: {
        processingStatus: "extracting_structured",
        processingRunId: ctx.run.id,
        processingError: null,
      },
    });

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "document.extract_text.completed",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        triggerRunId: ctx.run.id,
        result: output.message,
        totalPages: output.totalPages,
        extractionMethod: output.extractionMethod,
        ocrUsed: output.ocrUsed,
      },
    });

    await tasks.trigger<typeof documentExtractStructuredTask>(
      DOCUMENT_EXTRACT_STRUCTURED_TASK_ID,
      payload,
      {
        idempotencyKey: getDocumentExtractStructuredIdempotencyKey(payload),
        maxAttempts: 3,
      }
    );
  },
  catchError: async ({ payload, error, ctx, retryAt, retryDelayInMs }) => {
    const errorMessage = toErrorMessage(error);
    const maxAttempts = ctx.run.maxAttempts ?? 3;
    const isFinalAttempt = ctx.attempt.number >= maxAttempts;
    const document = await prisma.document.findFirst({
      where: {
        id: payload.entityId,
        workspaceId: payload.workspaceId,
      },
      select: {
        fileName: true,
        documentType: true,
        mimeType: true,
      },
    });
    const requiresOcr = isOcrRequiredDocumentError(error, document?.mimeType);

    if (requiresOcr) {
      await prisma.document.update({
        where: {
          id: payload.entityId,
        },
        data: {
          uploadStatus: "uploaded",
          processingStatus: "ocr_required",
          processingError:
            "Image OCR is required for this file, but Tesseract is unavailable in the document processor.",
          processingRunId: ctx.run.id,
        },
      });
    } else if (isFinalAttempt) {
      await prisma.document.update({
        where: {
          id: payload.entityId,
        },
        data: {
          uploadStatus: "uploaded",
          processingStatus: "failed",
          processingError: errorMessage,
          processingRunId: ctx.run.id,
        },
      });
    }

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: requiresOcr
        ? "document.extract_text.ocr_required"
        : isFinalAttempt
          ? "document.extract_text.failed"
          : "document.extract_text.retry_scheduled",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts,
        triggerRunId: ctx.run.id,
        error: errorMessage,
        retryDelayInMs: retryDelayInMs ?? null,
        retryAt: retryAt?.toISOString() ?? null,
      },
    });

    logger.error("document.extractText failed", {
      workspaceId: payload.workspaceId,
      documentId: payload.entityId,
      attempt: ctx.attempt.number,
      maxAttempts,
      triggerRunId: ctx.run.id,
      error: errorMessage,
    });

    if (isFinalAttempt && !requiresOcr) {
      if (document) {
        await triggerSlackNotification({
          workspaceId: payload.workspaceId,
          entityId: payload.entityId,
          entityType: "document",
          notificationType: "document_processing_failure",
          title: `${document.fileName} failed text extraction`,
          body: "Document extraction exhausted its retries and needs manual attention.",
          fields: [
            { label: "Document", value: document.fileName },
            { label: "Type", value: document.documentType.replace(/_/g, " ") },
            { label: "Error", value: errorMessage },
          ],
          linkUrl: buildDocumentDetailUrl(payload.entityId),
          linkLabel: "Open document",
        });
      }
    }

    throw error;
  },
  run: async (payload) => {
    const document = await prisma.document.findFirst({
      where: {
        id: payload.entityId,
        workspaceId: payload.workspaceId,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        storageKey: true,
      },
    });

    if (!document) {
      throw new Error(`Document ${payload.entityId} was not found for workspace ${payload.workspaceId}.`);
    }

    logger.info("Processing document extraction pipeline", {
      workspaceId: payload.workspaceId,
      documentId: payload.entityId,
      fileName: document.fileName,
    });

    let extraction;

    try {
      extraction = await extractDocumentText({
        storageKey: document.storageKey,
        mimeType: document.mimeType,
      });
    } catch (error) {
      if (isOcrRequiredDocumentError(error, document.mimeType)) {
        throw new AbortTaskRunError(
          "Image OCR is required for this file, but Tesseract is unavailable in the document processor."
        );
      }

      throw error;
    }

    if (extraction.pages.length === 0) {
      throw new Error("The extractor returned zero pages for this document.");
    }

    const ocrUsed = extraction.pages.some((page) => page.ocr_used);

    await prisma.$transaction(async (tx) => {
      await tx.documentPage.deleteMany({
        where: {
          documentId: payload.entityId,
          workspaceId: payload.workspaceId,
        },
      });

      await tx.documentPage.createMany({
        data: extraction.pages.map((page) => ({
          documentId: payload.entityId,
          workspaceId: payload.workspaceId,
          pageNumber: page.page_number,
          rawText: page.text,
          ocrUsed: page.ocr_used,
          metadata: {
            ...(page.metadata as Prisma.InputJsonObject),
            extractionMethod: extraction.extraction_method,
          },
        })),
      });
    });

    return {
      documentId: document.id,
      acknowledged: true,
      message: `Extracted text from ${extraction.total_pages} page${extraction.total_pages === 1 ? "" : "s"}.`,
      totalPages: extraction.total_pages,
      extractionMethod: extraction.extraction_method,
      ocrUsed,
    };
  },
});

export const documentExtractStructuredTask = task<
  typeof DOCUMENT_EXTRACT_STRUCTURED_TASK_ID,
  DocumentTaskPayload,
  DocumentExtractStructuredResult
>({
  id: DOCUMENT_EXTRACT_STRUCTURED_TASK_ID,
  retry: {
    maxAttempts: 3,
    factor: 6,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 300_000,
    randomize: false,
  },
  onStartAttempt: async ({ payload, ctx }) => {
    await prisma.document.update({
      where: {
        id: payload.entityId,
      },
      data: {
        processingStatus: "extracting_structured",
        processingRunId: ctx.run.id,
        processingError: null,
      },
    });

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: "document.extract_structured.started",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts ?? 3,
        triggerRunId: ctx.run.id,
      },
    });
  },
  onSuccess: async ({ payload, output, ctx }) => {
    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: output.requiresReview
        ? "document.extract_structured.review_needed"
        : "document.extract_structured.completed",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        triggerRunId: ctx.run.id,
        extractedRecordId: output.extractedRecordId,
        reviewTaskId: output.reviewTaskId,
        confidenceScore: output.confidenceScore,
        requiresReview: output.requiresReview,
        fieldCount: output.fieldCount,
      },
    });
  },
  catchError: async ({ payload, error, ctx, retryAt, retryDelayInMs }) => {
    const errorMessage = toErrorMessage(error);
    const maxAttempts = ctx.run.maxAttempts ?? 3;
    const isFinalAttempt = ctx.attempt.number >= maxAttempts;

    if (isFinalAttempt) {
      await prisma.document.update({
        where: {
          id: payload.entityId,
        },
        data: {
          processingStatus: "failed",
          processingError: errorMessage,
          processingRunId: ctx.run.id,
        },
      });
    }

    await createAuditLog({
      workspaceId: payload.workspaceId,
      eventType: isFinalAttempt
        ? "document.extract_structured.failed"
        : "document.extract_structured.retry_scheduled",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        attempt: ctx.attempt.number,
        maxAttempts,
        triggerRunId: ctx.run.id,
        error: errorMessage,
        retryDelayInMs: retryDelayInMs ?? null,
        retryAt: retryAt?.toISOString() ?? null,
      },
    });

    logger.error("document.extractStructured failed", {
      workspaceId: payload.workspaceId,
      documentId: payload.entityId,
      attempt: ctx.attempt.number,
      maxAttempts,
      triggerRunId: ctx.run.id,
      error: errorMessage,
    });

    throw error;
  },
  run: async (payload) => {
    const document = await prisma.document.findFirst({
      where: {
        id: payload.entityId,
        workspaceId: payload.workspaceId,
      },
      include: {
        pages: {
          orderBy: {
            pageNumber: "asc",
          },
        },
      },
    });

    if (!document) {
      throw new Error(`Document ${payload.entityId} was not found for workspace ${payload.workspaceId}.`);
    }

    const pages = document.pages
      .map((page) => ({
        pageNumber: page.pageNumber,
        rawText: page.rawText?.trim() ?? "",
        ocrUsed: page.ocrUsed,
      }))
      .filter((page) => page.rawText.length > 0);

    if (pages.length === 0) {
      throw new Error("Structured extraction requires extracted page text, but no usable text was found.");
    }

    const extraction = await extractStructuredDocumentData({
      documentType: document.documentType,
      fileName: document.fileName,
      pages,
    });
    const validationRisk = hasDeterministicValidationRisk(
      extraction.result.schemaType,
      extraction.result.extraction
    );
    const minimumFieldConfidence = getMinimumFieldConfidence(extraction.result.fields);
    const requiresReview =
      validationRisk ||
      extraction.result.confidenceScore < DOCUMENT_OVERALL_REVIEW_THRESHOLD ||
      minimumFieldConfidence < DOCUMENT_FIELD_REVIEW_THRESHOLD;
    const finalStatus = requiresReview ? "review_needed" : "approved";

    const result = await prisma.$transaction(async (tx) => {
      await (
        tx as typeof tx & {
          extractedRecord: {
            deleteMany(args: Prisma.ExtractedRecordDeleteManyArgs): Promise<unknown>;
            create(args: Prisma.ExtractedRecordCreateArgs): Promise<{
              id: string;
            }>;
          };
        }
      ).extractedRecord.deleteMany({
        where: {
          documentId: payload.entityId,
          workspaceId: payload.workspaceId,
        },
      });

      const createdRecord = await (
        tx as typeof tx & {
          extractedRecord: {
            create(args: Prisma.ExtractedRecordCreateArgs): Promise<{
              id: string;
            }>;
          };
        }
      ).extractedRecord.create({
        data: {
          workspaceId: payload.workspaceId,
          documentId: payload.entityId,
          schemaType: extraction.result.schemaType,
          extractionJson: toPrismaJson(extraction.result.extraction),
          confidenceScore: extraction.result.confidenceScore,
          requiresReview,
          modelUsed: extraction.modelUsed,
          promptVersion: extraction.promptVersion,
          tokenUsage:
            typeof extraction.tokenUsage === "number"
              ? Math.round(extraction.tokenUsage)
              : null,
          latencyMs: extraction.latencyMs,
          fields: {
            create: extraction.result.fields.map((field) => ({
              workspaceId: payload.workspaceId,
              fieldName: field.fieldName,
              fieldValue: field.fieldValue,
              confidenceScore: field.confidenceScore,
              sourceSnippet: field.sourceSnippet,
            })),
          },
        },
        select: {
          id: true,
        },
      });

      await tx.document.update({
        where: {
          id: payload.entityId,
        },
        data: {
          processingStatus: finalStatus as never,
          processingError: null,
        },
      });

      const reviewTask = await syncDocumentReviewTask(tx, payload, requiresReview);

      return {
        extractedRecordId: createdRecord.id,
        reviewTaskId: reviewTask?.id ?? null,
      };
    });

    return {
      documentId: payload.entityId,
      extractedRecordId: result.extractedRecordId,
      reviewTaskId: result.reviewTaskId,
      acknowledged: true,
      message: requiresReview
        ? "Structured extraction completed and needs human review."
        : "Structured extraction completed with enough confidence for approval.",
      confidenceScore: extraction.result.confidenceScore,
      requiresReview,
      fieldCount: extraction.result.fields.length,
    };
  },
});
