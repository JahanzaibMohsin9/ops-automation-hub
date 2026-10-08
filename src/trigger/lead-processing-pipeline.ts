import type { Prisma } from "@/generated/prisma/client";
import { HUBSPOT_PROVIDER } from "@/features/hubspot/connection";
import type {
  LeadEnrichResult,
  LeadHubSpotSyncResult,
  LeadProcessResult,
  LeadScoreResult,
  LeadTaskPayload,
} from "@/trigger/lead-processing";
import type { SendSlackNotificationPayload } from "@/trigger/notifications";

type LeadSummary = {
  fullName: string;
  companyName: string;
};

type LeadProcessingPipelineDependencies = {
  enrichLead: (payload: LeadTaskPayload) => Promise<LeadEnrichResult>;
  scoreLead: (payload: LeadTaskPayload) => Promise<LeadScoreResult>;
  syncLeadToHubSpot: (payload: LeadTaskPayload) => Promise<LeadHubSpotSyncResult>;
  getScoredLead: (payload: LeadTaskPayload) => Promise<LeadSummary | null>;
  getHubSpotConnectionState: (
    workspaceId: string
  ) => Promise<{ isConnected: boolean }>;
  triggerSlackNotification: (
    payload: SendSlackNotificationPayload
  ) => Promise<void>;
  createAuditLog: (input: {
    workspaceId: string;
    eventType: string;
    entityType: LeadTaskPayload["entityType"];
    entityId: string;
    metadataJson: Prisma.InputJsonValue;
  }) => Promise<unknown>;
  buildLeadDetailUrl: (leadId: string) => string;
  buildReviewQueueUrl: () => string;
};

export async function runLeadProcessingPipeline(
  payload: LeadTaskPayload,
  deps: LeadProcessingPipelineDependencies
): Promise<LeadProcessResult> {
  const enrichmentResult = await deps.enrichLead(payload);
  const scoringResult = await deps.scoreLead(payload);
  const scoredLead = await deps.getScoredLead(payload);

  if (scoredLead && scoringResult.finalStatus === "qualified") {
    await deps.triggerSlackNotification({
      workspaceId: payload.workspaceId,
      entityId: payload.entityId,
      entityType: "lead",
      notificationType: "qualified_lead",
      title: `${scoredLead.fullName} qualified for follow-up`,
      body: "Lead scoring marked this record as ready for revenue team action.",
      fields: [
        { label: "Lead", value: scoredLead.fullName },
        { label: "Company", value: scoredLead.companyName },
        { label: "Score", value: String(scoringResult.numericScore) },
        { label: "Fit label", value: scoringResult.fitLabel },
      ],
      linkUrl: deps.buildLeadDetailUrl(payload.entityId),
      linkLabel: "Open lead",
    });
  }

  if (scoredLead && scoringResult.finalStatus === "review_needed") {
    await deps.triggerSlackNotification({
      workspaceId: payload.workspaceId,
      entityId: payload.entityId,
      entityType: "lead",
      notificationType: "review_needed",
      title: `${scoredLead.fullName} needs review`,
      body: "Lead scoring confidence fell below the auto-qualification threshold.",
      fields: [
        { label: "Lead", value: scoredLead.fullName },
        { label: "Company", value: scoredLead.companyName },
        { label: "Score", value: String(scoringResult.numericScore) },
        {
          label: "Confidence",
          value: `${Math.round(scoringResult.confidenceScore * 100)}%`,
        },
      ],
      linkUrl: deps.buildReviewQueueUrl(),
      linkLabel: "Open review queue",
    });
  }

  let syncMessage = "HubSpot sync skipped because the lead is not qualified.";

  if (scoringResult.finalStatus === "qualified") {
    const connectionState = await deps.getHubSpotConnectionState(payload.workspaceId);

    if (connectionState.isConnected) {
      const syncResult = await deps.syncLeadToHubSpot(payload);
      syncMessage = syncResult.message;
    } else {
      syncMessage = "HubSpot sync skipped because this workspace is not connected yet.";

      await deps.createAuditLog({
        workspaceId: payload.workspaceId,
        eventType: "lead.hubspot_sync.skipped",
        entityType: payload.entityType,
        entityId: payload.entityId,
        metadataJson: {
          reason: "workspace_not_connected",
          provider: HUBSPOT_PROVIDER,
        },
      });
    }
  }

  return {
    leadId: payload.entityId,
    acknowledged: true,
    message: `${enrichmentResult.message} ${scoringResult.message} ${syncMessage}`,
    enrichmentStatus: enrichmentResult.status,
    fitLabel: scoringResult.fitLabel,
    finalStatus: scoringResult.finalStatus,
  };
}
