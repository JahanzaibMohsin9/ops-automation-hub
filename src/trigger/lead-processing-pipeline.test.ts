import type { LeadTaskPayload } from "@/trigger/lead-processing";
import { runLeadProcessingPipeline } from "@/trigger/lead-processing-pipeline";

function createPayload(): LeadTaskPayload {
  return {
    workspaceId: "ws_123",
    entityId: "lead_123",
    entityType: "lead",
  };
}

describe("runLeadProcessingPipeline", () => {
  it("runs enrichment, scoring, HubSpot sync, and qualified-lead notification in order", async () => {
    const events: string[] = [];
    const payload = createPayload();
    const triggerSlackNotification = vi.fn(async () => {
      events.push("notify");
    });
    const syncLeadToHubSpot = vi.fn(async () => {
      events.push("sync");
      return {
        leadId: payload.entityId,
        syncStatus: "synced" as const,
        externalContactId: "hs_123",
        contactUrl: "https://app.hubspot.com/contact/hs_123",
        message: "Created a new HubSpot contact.",
      };
    });

    const result = await runLeadProcessingPipeline(payload, {
      enrichLead: async () => {
        events.push("enrich");
        return {
          leadId: payload.entityId,
          provider: "mock",
          status: "success",
          message: "Lead enrichment completed successfully.",
        };
      },
      scoreLead: async () => {
        events.push("score");
        return {
          leadId: payload.entityId,
          fitLabel: "high_fit",
          finalStatus: "qualified",
          numericScore: 91,
          confidenceScore: 0.95,
          message: "Lead scored as high_fit with status qualified.",
        };
      },
      syncLeadToHubSpot,
      getScoredLead: async () => ({
        fullName: "Avery Stone",
        companyName: "Northstar Ops",
      }),
      getHubSpotConnectionState: async () => ({ isConnected: true }),
      triggerSlackNotification,
      createAuditLog: vi.fn(),
      buildLeadDetailUrl: (leadId) => `https://example.com/leads/${leadId}`,
      buildReviewQueueUrl: () => "https://example.com/review-queue",
    });

    expect(events).toEqual(["enrich", "score", "notify", "sync"]);
    expect(triggerSlackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: "qualified_lead",
        entityId: payload.entityId,
      })
    );
    expect(syncLeadToHubSpot).toHaveBeenCalledWith(payload);
    expect(result.finalStatus).toBe("qualified");
    expect(result.message).toContain("Created a new HubSpot contact.");
  });

  it("records a skipped audit event when the lead qualifies but HubSpot is not connected", async () => {
    const createAuditLog = vi.fn();
    const payload = createPayload();

    const result = await runLeadProcessingPipeline(payload, {
      enrichLead: async () => ({
        leadId: payload.entityId,
        provider: "mock",
        status: "success",
        message: "Lead enrichment completed successfully.",
      }),
      scoreLead: async () => ({
        leadId: payload.entityId,
        fitLabel: "high_fit",
        finalStatus: "qualified",
        numericScore: 88,
        confidenceScore: 0.91,
        message: "Lead scored as high_fit with status qualified.",
      }),
      syncLeadToHubSpot: vi.fn(),
      getScoredLead: async () => ({
        fullName: "Avery Stone",
        companyName: "Northstar Ops",
      }),
      getHubSpotConnectionState: async () => ({ isConnected: false }),
      triggerSlackNotification: vi.fn(),
      createAuditLog,
      buildLeadDetailUrl: (leadId) => `https://example.com/leads/${leadId}`,
      buildReviewQueueUrl: () => "https://example.com/review-queue",
    });

    expect(createAuditLog).toHaveBeenCalledWith({
      workspaceId: payload.workspaceId,
      eventType: "lead.hubspot_sync.skipped",
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadataJson: {
        reason: "workspace_not_connected",
        provider: "hubspot",
      },
    });
    expect(result.message).toContain("workspace is not connected yet");
  });
});
