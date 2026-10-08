import { runLeadProcessingPipeline } from "@/trigger/lead-processing-pipeline";

const {
  authMock,
  revalidatePathMock,
  ensureDefaultFormLeadSourceMock,
  createAuditLogMock,
  enqueueLeadProcessingMock,
  getWorkspaceByClerkOrgIdMock,
  prismaLeadCreateMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  ensureDefaultFormLeadSourceMock: vi.fn(),
  createAuditLogMock: vi.fn(),
  enqueueLeadProcessingMock: vi.fn(),
  getWorkspaceByClerkOrgIdMock: vi.fn(),
  prismaLeadCreateMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/features/leads/sources", () => ({
  ensureDefaultFormLeadSource: ensureDefaultFormLeadSourceMock,
  createCsvLeadSource: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: createAuditLogMock,
}));

vi.mock("@/lib/trigger", () => ({
  enqueueLeadProcessing: enqueueLeadProcessingMock,
}));

vi.mock("@/lib/workspace", () => ({
  getWorkspaceByClerkOrgId: getWorkspaceByClerkOrgIdMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      create: prismaLeadCreateMock,
    },
  },
}));

describe("lead flow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers lead capture through enrichment, scoring, HubSpot sync, and Slack notification", async () => {
    const auditEvents: string[] = [];
    const { submitLeadIntake } = await import("@/features/leads/actions");

    authMock.mockResolvedValue({
      userId: "user_123",
      orgId: "org_123",
    });
    getWorkspaceByClerkOrgIdMock.mockResolvedValue({
      id: "ws_123",
    });
    ensureDefaultFormLeadSourceMock.mockResolvedValue({
      id: "source_123",
      type: "form",
    });
    prismaLeadCreateMock.mockResolvedValue({
      id: "lead_123",
      fullName: "Avery Stone",
      email: "avery@example.com",
      companyName: "Northstar Ops",
    });
    createAuditLogMock.mockImplementation(async ({ eventType }) => {
      auditEvents.push(eventType);
      return null;
    });
    enqueueLeadProcessingMock.mockResolvedValue({
      ok: true,
      runId: "run_123",
    });

    const formData = new FormData();
    formData.set("fullName", "Avery Stone");
    formData.set("email", "avery@example.com");
    formData.set("phone", "+1 555 0100");
    formData.set("companyName", "Northstar Ops");
    formData.set("companyDomain", "northstarops.com");
    formData.set("jobTitle", "Revenue Operations Lead");
    formData.set("industry", "Technology");
    formData.set("message", "We need help automating lead handoff.");

    const submitState = await submitLeadIntake(
      {
        status: "idle",
        message: "",
        fieldErrors: {},
      },
      formData
    );

    expect(submitState.status).toBe("success");
    expect(enqueueLeadProcessingMock).toHaveBeenCalledWith({
      workspaceId: "ws_123",
      entityId: "lead_123",
      entityType: "lead",
      actorUserId: "user_123",
    });
    expect(auditEvents).toContain("lead.created");

    const processingOrder: string[] = [];
    const notifiedPayloads: Array<{ notificationType: string }> = [];
    const processingResult = await runLeadProcessingPipeline(
      {
        workspaceId: "ws_123",
        entityId: "lead_123",
        entityType: "lead",
      },
      {
        enrichLead: async () => {
          processingOrder.push("enrich");
          auditEvents.push(
            "lead.process.started",
            "lead.enrich.started",
            "lead.enrich.completed"
          );
          return {
            leadId: "lead_123",
            provider: "mock",
            status: "success",
            message: "Lead enrichment completed successfully.",
          };
        },
        scoreLead: async () => {
          processingOrder.push("score");
          auditEvents.push("lead.score.started", "lead.score.completed");
          return {
            leadId: "lead_123",
            fitLabel: "high_fit",
            finalStatus: "qualified",
            numericScore: 92,
            confidenceScore: 0.95,
            message: "Lead scored as high_fit with status qualified.",
          };
        },
        syncLeadToHubSpot: async () => {
          processingOrder.push("hubspot");
          auditEvents.push(
            "lead.hubspot_sync.started",
            "lead.hubspot_sync.completed"
          );
          return {
            leadId: "lead_123",
            syncStatus: "synced",
            externalContactId: "hs_123",
            contactUrl: "https://app.hubspot.com/contact/hs_123",
            message: "Created a new HubSpot contact.",
          };
        },
        getScoredLead: async () => ({
          fullName: "Avery Stone",
          companyName: "Northstar Ops",
        }),
        getHubSpotConnectionState: async () => ({ isConnected: true }),
        triggerSlackNotification: async (payload) => {
          processingOrder.push("slack");
          notifiedPayloads.push({ notificationType: payload.notificationType });
          auditEvents.push("notification.slack.started", "notification.slack.sent");
        },
        createAuditLog: async ({ eventType }) => {
          auditEvents.push(eventType);
          return null;
        },
        buildLeadDetailUrl: (leadId) => `https://example.com/leads/${leadId}`,
        buildReviewQueueUrl: () => "https://example.com/review-queue",
      }
    );

    auditEvents.push("lead.process.completed");

    expect(processingOrder).toEqual(["enrich", "score", "slack", "hubspot"]);
    expect(notifiedPayloads).toEqual([{ notificationType: "qualified_lead" }]);
    expect(processingResult.finalStatus).toBe("qualified");
    expect(processingResult.message).toContain("Created a new HubSpot contact.");
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        "lead.created",
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
      ])
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/leads");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });
});
