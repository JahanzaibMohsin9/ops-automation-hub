const QUALIFIED_LEAD_FLOW_REQUIREMENTS = [
  {
    label: "lead captured",
    eventTypes: ["lead.created"],
  },
  {
    label: "processing queued",
    eventTypes: ["lead.process.enqueued"],
  },
  {
    label: "processing started",
    eventTypes: ["lead.process.started"],
  },
  {
    label: "enrichment started",
    eventTypes: ["lead.enrich.started"],
  },
  {
    label: "enrichment completed",
    eventTypes: ["lead.enrich.completed", "lead.enrich.partial"],
  },
  {
    label: "scoring started",
    eventTypes: ["lead.score.started"],
  },
  {
    label: "scoring completed",
    eventTypes: ["lead.score.completed"],
  },
  {
    label: "Slack notification started",
    eventTypes: ["notification.slack.started"],
  },
  {
    label: "Slack notification finished",
    eventTypes: ["notification.slack.sent", "notification.slack.skipped"],
  },
  {
    label: "HubSpot sync started",
    eventTypes: ["lead.hubspot_sync.started"],
  },
  {
    label: "HubSpot sync completed",
    eventTypes: ["lead.hubspot_sync.completed"],
  },
  {
    label: "processing completed",
    eventTypes: ["lead.process.completed"],
  },
] as const;

export function evaluateQualifiedLeadFlowAudit(eventTypes: string[]) {
  const observed = new Set(eventTypes);
  const steps = QUALIFIED_LEAD_FLOW_REQUIREMENTS.map((requirement) => ({
    label: requirement.label,
    completed: requirement.eventTypes.some((eventType) => observed.has(eventType)),
  }));
  const missingSteps = steps
    .filter((step) => !step.completed)
    .map((step) => step.label);

  return {
    totalSteps: steps.length,
    completedSteps: steps.length - missingSteps.length,
    isComplete: missingSteps.length === 0,
    missingSteps,
  };
}
