import { evaluateQualifiedLeadFlowAudit } from "@/features/leads/audit-flow";

describe("evaluateQualifiedLeadFlowAudit", () => {
  it("marks the qualified lead flow complete when all required audit events are present", () => {
    const result = evaluateQualifiedLeadFlowAudit([
      "lead.created",
      "lead.process.enqueued",
      "lead.process.started",
      "lead.enrich.started",
      "lead.enrich.completed",
      "lead.score.started",
      "lead.score.completed",
      "notification.slack.started",
      "notification.slack.sent",
      "lead.hubspot_sync.started",
      "lead.hubspot_sync.completed",
      "lead.process.completed",
    ]);

    expect(result.isComplete).toBe(true);
    expect(result.missingSteps).toEqual([]);
  });

  it("reports the missing steps when the audit history is incomplete", () => {
    const result = evaluateQualifiedLeadFlowAudit([
      "lead.created",
      "lead.process.enqueued",
      "lead.process.started",
      "lead.score.completed",
    ]);

    expect(result.isComplete).toBe(false);
    expect(result.missingSteps).toContain("enrichment started");
    expect(result.missingSteps).toContain("HubSpot sync completed");
  });
});
