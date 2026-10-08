import { Prisma } from "@/generated/prisma/client";

function getObjectValue(
  value: Prisma.JsonValue | null
): Record<string, Prisma.JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Prisma.JsonValue>;
}

function getStringValue(
  value: Record<string, Prisma.JsonValue> | null,
  key: string
) {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : undefined;
}

export function describeAuditEvent(
  eventType: string,
  metadataJson: Prisma.JsonValue | null
) {
  switch (eventType) {
    case "workspace.created":
      return "Workspace provisioned successfully.";
    case "workspace.invite.sent":
      return "A workspace invitation email was sent.";
    case "lead.created": {
      const metadata = getObjectValue(metadataJson);
      const sourceType = getStringValue(metadata, "sourceType") ?? "form";
      return `Lead captured via ${sourceType}.`;
    }
    case "lead.import.started":
      return "CSV lead import started.";
    case "lead.import.completed":
      return "CSV lead import completed.";
    case "lead.process.enqueued":
      return "Lead processing was queued.";
    case "lead.process.enqueue_failed":
      return "Lead processing could not be queued.";
    case "lead.process.started":
      return "Lead processing started.";
    case "lead.process.completed":
      return "Lead processing completed successfully.";
    case "lead.process.failed":
      return "Lead processing failed after all retries.";
    case "lead.process.retry_scheduled":
      return "Lead processing failed and was scheduled to retry.";
    case "lead.enrich.enqueued":
      return "Lead enrichment was queued.";
    case "lead.enrich.enqueue_failed":
      return "Lead enrichment could not be queued.";
    case "lead.enrich.started":
      return "Lead enrichment started.";
    case "lead.enrich.completed":
      return "Lead enrichment completed successfully.";
    case "lead.enrich.partial":
      return "Lead enrichment completed with partial data.";
    case "lead.enrich.failed":
      return "Lead enrichment failed after all retries.";
    case "lead.enrich.retry_scheduled":
      return "Lead enrichment failed and was scheduled to retry.";
    case "lead.score.enqueued":
      return "Lead scoring was queued.";
    case "lead.score.enqueue_failed":
      return "Lead scoring could not be queued.";
    case "lead.score.started":
      return "Lead scoring started.";
    case "lead.score.completed": {
      const metadata = getObjectValue(metadataJson);
      const finalStatus = getStringValue(metadata, "finalStatus");

      if (finalStatus === "qualified") {
        return "Lead scoring completed and marked the lead qualified.";
      }

      if (finalStatus === "review_needed") {
        return "Lead scoring completed and routed the lead to review.";
      }

      if (finalStatus === "low_priority") {
        return "Lead scoring completed and marked the lead low priority.";
      }

      return "Lead scoring completed.";
    }
    case "lead.score.failed":
      return "Lead scoring failed after all retries.";
    case "lead.score.retry_scheduled":
      return "Lead scoring failed and was scheduled to retry.";
    case "lead.sales_assist.generated":
      return "A new sales assist artifact was generated.";
    case "lead.hubspot_sync.enqueued":
      return "HubSpot sync was queued.";
    case "lead.hubspot_sync.enqueue_failed":
      return "HubSpot sync could not be queued.";
    case "lead.hubspot_sync.started":
      return "HubSpot sync started.";
    case "lead.hubspot_sync.completed":
      return "HubSpot sync completed successfully.";
    case "lead.hubspot_sync.failed":
      return "HubSpot sync failed after all retries.";
    case "lead.hubspot_sync.retry_scheduled":
      return "HubSpot sync failed and was scheduled to retry.";
    case "lead.hubspot_sync.skipped":
      return "HubSpot sync was skipped.";
    case "lead.review.approved":
      return "Lead review was approved.";
    case "lead.review.edit_approved":
      return "Lead review was approved with manual edits.";
    case "lead.review.rejected":
      return "Lead review was rejected.";
    case "document.upload.completed":
      return "Document upload completed.";
    case "document.upload.failed":
      return "Document upload failed.";
    case "document.deleted":
      return "Document and extracted data were deleted.";
    case "document.extract_text.enqueued":
      return "Document text extraction was queued.";
    case "document.extract_text.enqueue_failed":
      return "Document text extraction could not be queued.";
    case "document.extract_text.started":
      return "Document text extraction started.";
    case "document.extract_text.completed":
      return "Document text extraction completed.";
    case "document.extract_text.failed":
      return "Document text extraction failed after all retries.";
    case "document.extract_text.retry_scheduled":
      return "Document text extraction failed and was scheduled to retry.";
    case "document.extract_text.ocr_required":
      return "Document requires OCR, but OCR is unavailable.";
    case "document.extract_structured.started":
      return "Structured document extraction started.";
    case "document.extract_structured.completed":
      return "Structured document extraction completed.";
    case "document.extract_structured.review_needed":
      return "Structured extraction completed and created a review task.";
    case "document.extract_structured.failed":
      return "Structured document extraction failed after all retries.";
    case "document.extract_structured.retry_scheduled":
      return "Structured extraction failed and was scheduled to retry.";
    case "document.review.approved":
      return "Document review was approved.";
    case "document.review.edit_approved":
      return "Document review was approved with manual edits.";
    case "document.review.rejected":
      return "Document review was rejected.";
    case "integration.hubspot.connected":
      return "HubSpot was connected for this workspace.";
    case "integration.hubspot.disconnected":
      return "HubSpot was disconnected for this workspace.";
    case "integration.slack.updated":
      return "Slack notification settings were updated.";
    case "integration.slack.disconnected":
      return "Slack was disconnected for this workspace.";
    case "notification.slack.enqueued":
      return "Slack notification was queued.";
    case "notification.slack.started":
      return "Slack notification delivery started.";
    case "notification.slack.sent":
      return "Slack notification was sent.";
    case "notification.slack.skipped":
      return "Slack notification was skipped.";
    case "notification.slack.failed":
      return "Slack notification failed after all retries.";
    case "notification.slack.retry_scheduled":
      return "Slack notification failed and was scheduled to retry.";
    default:
      return eventType.replace(/\./g, " ");
  }
}

export function describeAuditMetadata(metadataJson: Prisma.JsonValue | null) {
  const metadata = getObjectValue(metadataJson);

  if (!metadata) {
    return null;
  }

  const highlights = [
    getStringValue(metadata, "provider"),
    getStringValue(metadata, "notificationType"),
    getStringValue(metadata, "fitLabel"),
    getStringValue(metadata, "finalStatus"),
    getStringValue(metadata, "syncStatus"),
    getStringValue(metadata, "artifactType"),
    getStringValue(metadata, "reason"),
    getStringValue(metadata, "error"),
  ].filter((value): value is string => Boolean(value));

  return highlights.length > 0 ? highlights.join(" · ") : null;
}

