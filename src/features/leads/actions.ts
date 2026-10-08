"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CSV_IMPORT_FIELDS,
  type CsvImportField,
  type CsvImportPayload,
} from "@/features/leads/csv";
import { generateSalesAssistArtifact } from "@/features/leads/sales-assist-client";
import {
  salesAssistArtifactTypeSchema,
  type SalesAssistArtifactType,
} from "@/features/leads/sales-assist";
import {
  initialLeadRetryActionState,
  initialLeadCsvImportState,
  initialLeadIntakeState,
  initialSalesAssistActionState,
  type LeadCsvImportState,
  type LeadCsvImportSummary,
  type LeadCsvImportResult,
  type LeadIntakeFieldName,
  type LeadRetryActionState,
  type SalesAssistActionState,
} from "@/features/leads/state";
import {
  createCsvLeadSource,
  ensureDefaultFormLeadSource,
} from "@/features/leads/sources";
import { consumeLeadSubmissionRateLimit } from "@/features/leads/rate-limit";
import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  enqueueLeadEnrichment,
  enqueueLeadProcessing,
  enqueueLeadScoring,
} from "@/lib/trigger";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";

const optionalTextField = z
  .string()
  .trim()
  .max(200, "Keep this field under 200 characters.")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const leadInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required.")
    .max(120, "Full name must be 120 characters or fewer."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  phone: optionalTextField,
  companyName: z
    .string()
    .trim()
    .min(1, "Company name is required.")
    .max(160, "Company name must be 160 characters or fewer."),
  companyDomain: z
    .string()
    .trim()
    .max(120, "Keep the domain under 120 characters.")
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }

      const normalized = value
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "");
      return normalized.length > 0 ? normalized.toLowerCase() : undefined;
    })
    .refine(
      (value) =>
        value === undefined ||
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
          value
        ),
      "Enter a valid company domain."
    ),
  jobTitle: optionalTextField,
  industry: optionalTextField,
  message: z
    .string()
    .trim()
    .max(2000, "Keep the message under 2000 characters.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export type CreateLeadInput = z.infer<typeof leadInputSchema>;

const csvImportPayloadSchema = z.object({
  fileName: z.string().trim().min(1, "Choose a CSV file to import."),
  delimiter: z.string().trim().min(1),
  encoding: z.string().trim().min(1),
  mapping: z.partialRecord(z.enum(CSV_IMPORT_FIELDS), z.string()),
  rows: z
    .array(z.record(z.string(), z.string()))
    .min(1, "The CSV has no data rows."),
});

type CsvImportPayloadInput = z.infer<typeof csvImportPayloadSchema>;

const generateSalesAssistSchema = z.object({
  leadId: z.string().trim().min(1, "Lead ID is required."),
  artifactType: salesAssistArtifactTypeSchema,
});

const retryLeadTaskSchema = z.object({
  leadId: z.string().trim().min(1, "Lead ID is required."),
});

function toFieldErrors(error: z.ZodError<CreateLeadInput>) {
  return error.issues.reduce<Partial<Record<LeadIntakeFieldName, string>>>(
    (accumulator, issue) => {
      const field = issue.path[0];

      if (typeof field === "string" && !(field in accumulator)) {
        accumulator[field as LeadIntakeFieldName] = issue.message;
      }

      return accumulator;
    },
    {}
  );
}

function formatRowValidationErrors(error: z.ZodError<CreateLeadInput>) {
  return error.issues.map((issue) => issue.message).join(" ");
}

function mapCsvRowToLeadInput(
  row: Record<string, string>,
  mapping: Partial<Record<CsvImportField, string>>
): CreateLeadInput {
  return {
    fullName: mapping.fullName ? row[mapping.fullName] ?? "" : "",
    email: mapping.email ? row[mapping.email] ?? "" : "",
    phone: mapping.phone ? row[mapping.phone] ?? "" : "",
    companyName: mapping.companyName ? row[mapping.companyName] ?? "" : "",
    companyDomain: mapping.companyDomain ? row[mapping.companyDomain] ?? "" : "",
    jobTitle: mapping.jobTitle ? row[mapping.jobTitle] ?? "" : "",
    industry: mapping.industry ? row[mapping.industry] ?? "" : "",
    message: undefined,
  };
}

export async function createLead(workspaceId: string, data: CreateLeadInput) {
  const leadSource = await ensureDefaultFormLeadSource(workspaceId);

  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      leadSourceId: leadSource.id,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      companyName: data.companyName,
      companyDomain: data.companyDomain,
      jobTitle: data.jobTitle,
      industry: data.industry,
      rawPayloadJson: {
        submittedVia: "hosted-form",
        message: data.message ?? null,
      },
    },
  });

  return {
    lead,
    leadSource,
  };
}

async function importLeadRows(
  workspaceId: string,
  actorUserId: string,
  payload: CsvImportPayloadInput
): Promise<LeadCsvImportSummary> {
  const requiredMappings: CsvImportField[] = ["fullName", "email", "companyName"];
  const missingMappings = requiredMappings.filter((field) => !payload.mapping[field]);

  if (missingMappings.length > 0) {
    throw new Error(
      `Map ${missingMappings
        .map((field) => field.replace(/([A-Z])/g, " $1").toLowerCase())
        .join(", ")} before importing.`
    );
  }

  const csvLeadSource = await createCsvLeadSource(workspaceId, payload.fileName, {
    delimiter: payload.delimiter,
    encoding: payload.encoding,
    rowCount: payload.rows.length,
    mapping: payload.mapping,
    importedAt: new Date().toISOString(),
  });

  await createAuditLog({
    workspaceId,
    actorUserId,
    eventType: "lead.import.started",
    entityType: "lead_source",
    entityId: csvLeadSource.id,
    metadataJson: {
      fileName: payload.fileName,
      delimiter: payload.delimiter,
      encoding: payload.encoding,
      totalRows: payload.rows.length,
    },
  });

  const results: LeadCsvImportResult[] = [];
  const normalizedEmails = payload.rows
    .map((row) =>
      payload.mapping.email ? (row[payload.mapping.email] ?? "").trim().toLowerCase() : ""
    )
    .filter((email) => email.length > 0);
  const existingLeads = await prisma.lead.findMany({
    where: {
      workspaceId,
      email: {
        in: normalizedEmails,
      },
    },
    select: {
      email: true,
    },
  });
  const seenEmails = new Set(existingLeads.map((lead) => lead.email.toLowerCase()));
  const importedLeadIds: string[] = [];

  for (const [index, row] of payload.rows.entries()) {
    const rowNumber = index + 2;
    const candidate = mapCsvRowToLeadInput(row, payload.mapping);
    const parsed = leadInputSchema.safeParse(candidate);
    const rawEmail = candidate.email.trim().toLowerCase();

    if (!parsed.success) {
      results.push({
        rowNumber,
        status: "error",
        email: rawEmail,
        message: formatRowValidationErrors(parsed.error),
      });
      continue;
    }

    if (seenEmails.has(parsed.data.email)) {
      results.push({
        rowNumber,
        status: "skipped",
        email: parsed.data.email,
        message: "Duplicate email already exists in this workspace or this import file.",
      });
      continue;
    }

    const lead = await prisma.lead.create({
      data: {
        workspaceId,
        leadSourceId: csvLeadSource.id,
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        companyName: parsed.data.companyName,
        companyDomain: parsed.data.companyDomain,
        jobTitle: parsed.data.jobTitle,
        industry: parsed.data.industry,
        rawPayloadJson: {
          submittedVia: "csv-import",
          fileName: payload.fileName,
          rowNumber,
          sourceRow: row,
        },
      },
    });

    seenEmails.add(parsed.data.email);
    importedLeadIds.push(lead.id);
    results.push({
      rowNumber,
      status: "success",
      email: parsed.data.email,
      message: `Imported ${lead.fullName} from ${parsed.data.companyName}.`,
    });
  }

  const summary: LeadCsvImportSummary = {
    fileName: payload.fileName,
    totalRows: payload.rows.length,
    importedCount: results.filter((result) => result.status === "success").length,
    skippedCount: results.filter((result) => result.status === "skipped").length,
    errorCount: results.filter((result) => result.status === "error").length,
    results,
  };

  await createAuditLog({
    workspaceId,
    actorUserId,
    eventType: "lead.import.completed",
    entityType: "lead_source",
    entityId: csvLeadSource.id,
    metadataJson: {
      fileName: payload.fileName,
      totalRows: summary.totalRows,
      importedCount: summary.importedCount,
      skippedCount: summary.skippedCount,
      errorCount: summary.errorCount,
      importedLeadIds,
    },
  });

  for (const leadId of importedLeadIds) {
    await enqueueLeadProcessing({
      workspaceId,
      entityId: leadId,
      entityType: "lead",
      actorUserId,
    });
  }

  return summary;
}

export async function submitLeadIntake(
  previousState: typeof initialLeadIntakeState,
  formData: FormData
) {
  void previousState;
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      ...initialLeadIntakeState,
      status: "error" as const,
      message: "Sign in to a workspace before submitting a lead.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      ...initialLeadIntakeState,
      status: "error" as const,
      message: "The active organization is not linked to a workspace yet.",
    };
  }

  const rateLimit = await consumeLeadSubmissionRateLimit(workspace.id);

  if (!rateLimit.allowed) {
    await createAuditLog({
      workspaceId: workspace.id,
      actorUserId: userId,
      eventType: "lead.form.rate_limited",
      entityType: "lead",
      entityId: null,
      metadataJson: {
        ipAddress: rateLimit.ipAddress,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });

    return {
      ...initialLeadIntakeState,
      status: "error" as const,
      message: `Too many lead form submissions from this IP. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
    };
  }

  const parsed = leadInputSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    companyName: formData.get("companyName"),
    companyDomain: formData.get("companyDomain"),
    jobTitle: formData.get("jobTitle"),
    industry: formData.get("industry"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return {
      ...initialLeadIntakeState,
      status: "error" as const,
      message: "Fix the highlighted fields and submit again.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { lead, leadSource } = await createLead(workspace.id, parsed.data);

  await createAuditLog({
    workspaceId: workspace.id,
    actorUserId: userId,
    eventType: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    metadataJson: {
      sourceId: leadSource.id,
      sourceType: leadSource.type,
      email: lead.email,
      companyName: lead.companyName,
    },
  });

  const enqueueResult = await enqueueLeadProcessing({
    workspaceId: workspace.id,
    entityId: lead.id,
    entityType: "lead",
    actorUserId: userId,
  });

  revalidatePath("/leads");
  revalidatePath("/dashboard");

  return {
    ...initialLeadIntakeState,
    status: "success" as const,
    message: enqueueResult.ok
      ? `${lead.fullName} has been captured and queued for background processing.`
      : `${lead.fullName} has been captured, but background processing could not be queued: ${enqueueResult.error}`,
    leadId: lead.id,
  };
}

export async function importLeadsFromCsv(
  previousState: LeadCsvImportState,
  formData: FormData
) {
  void previousState;
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      ...initialLeadCsvImportState,
      status: "error" as const,
      message: "Sign in to a workspace before importing leads.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      ...initialLeadCsvImportState,
      status: "error" as const,
      message: "The active organization is not linked to a workspace yet.",
    };
  }

  const payloadValue = formData.get("payload");

  if (typeof payloadValue !== "string" || payloadValue.trim().length === 0) {
    return {
      ...initialLeadCsvImportState,
      status: "error" as const,
      message: "Choose a CSV file, map the fields, and try again.",
    };
  }

  let parsedPayload: CsvImportPayload;

  try {
    parsedPayload = JSON.parse(payloadValue) as CsvImportPayload;
  } catch {
    return {
      ...initialLeadCsvImportState,
      status: "error" as const,
      message: "The CSV payload could not be read. Re-upload the file and try again.",
    };
  }

  const validatedPayload = csvImportPayloadSchema.safeParse(parsedPayload);

  if (!validatedPayload.success) {
    return {
      ...initialLeadCsvImportState,
      status: "error" as const,
      message:
        validatedPayload.error.issues[0]?.message ??
        "The CSV import payload is invalid.",
    };
  }

  try {
    const summary = await importLeadRows(workspace.id, userId, validatedPayload.data);

    revalidatePath("/leads");
    revalidatePath("/dashboard");

    return {
      status: "success" as const,
      message: `Imported ${summary.importedCount} of ${summary.totalRows} rows from ${summary.fileName}.`,
      summary,
    };
  } catch (error) {
    return {
      ...initialLeadCsvImportState,
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "The CSV import could not be completed.",
    };
  }
}

async function generateSalesAssist(
  previousState: SalesAssistActionState,
  formData: FormData,
  artifactType: SalesAssistArtifactType
) {
  void previousState;
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      ...initialSalesAssistActionState,
      status: "error" as const,
      message: "Sign in to a workspace before generating sales assist content.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      ...initialSalesAssistActionState,
      status: "error" as const,
      message: "The active organization is not linked to a workspace yet.",
    };
  }

  const parsed = generateSalesAssistSchema.safeParse({
    leadId: formData.get("leadId"),
    artifactType,
  });

  if (!parsed.success) {
    return {
      ...initialSalesAssistActionState,
      status: "error" as const,
      message:
        parsed.error.issues[0]?.message ??
        "The sales assist request could not be validated.",
    };
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: parsed.data.leadId,
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      companyName: true,
      companyDomain: true,
      jobTitle: true,
      industry: true,
      employeeRange: true,
      rawPayloadJson: true,
      score: {
        select: {
          numericScore: true,
          fitLabel: true,
          reasoning: true,
          missingDataJson: true,
          confidenceScore: true,
        },
      },
      enrichments: {
        orderBy: {
          enrichedAt: "desc",
        },
        take: 1,
        select: {
          normalizedData: true,
        },
      },
    },
  });

  if (!lead) {
    return {
      ...initialSalesAssistActionState,
      status: "error" as const,
      message: "That lead could not be found in the active workspace.",
    };
  }

  if (!lead.score) {
    return {
      ...initialSalesAssistActionState,
      status: "error" as const,
      message: "Score the lead before generating sales assist content.",
    };
  }

  const latestEnrichment = lead.enrichments[0]?.normalizedData;
  const enrichmentData =
    latestEnrichment && typeof latestEnrichment === "object" && !Array.isArray(latestEnrichment)
      ? latestEnrichment
      : null;

  try {
    const generation = await generateSalesAssistArtifact(parsed.data.artifactType, {
      lead: {
        fullName: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        companyName: lead.companyName,
        companyDomain: lead.companyDomain,
        jobTitle: lead.jobTitle,
        industry: lead.industry,
        employeeRange: lead.employeeRange,
        rawPayloadJson: lead.rawPayloadJson,
      },
      enrichment: enrichmentData
        ? {
            companyDescription:
              typeof enrichmentData.companyDescription === "string"
                ? enrichmentData.companyDescription
                : undefined,
            industry:
              typeof enrichmentData.industry === "string"
                ? enrichmentData.industry
                : undefined,
            employeeRange:
              typeof enrichmentData.employeeRange === "string"
                ? enrichmentData.employeeRange
                : undefined,
            website:
              typeof enrichmentData.website === "string"
                ? enrichmentData.website
                : undefined,
            linkedInUrl:
              typeof enrichmentData.linkedInUrl === "string"
                ? enrichmentData.linkedInUrl
                : undefined,
            technologies: Array.isArray(enrichmentData.technologies)
              ? enrichmentData.technologies.filter(
                  (item): item is string => typeof item === "string"
                )
              : [],
            foundedYear:
              typeof enrichmentData.foundedYear === "number"
                ? enrichmentData.foundedYear
                : undefined,
          }
        : null,
      score: {
        numericScore: lead.score.numericScore,
        fitLabel: lead.score.fitLabel,
        reasoning: lead.score.reasoning,
        missingFields: Array.isArray(lead.score.missingDataJson)
          ? lead.score.missingDataJson.filter(
              (item): item is string => typeof item === "string"
            )
          : [],
        confidenceScore: lead.score.confidenceScore,
      },
    });

    const artifact = await (
      prisma as typeof prisma & {
        salesAssistArtifact: {
          create: (args: {
            data: {
              leadId: string;
              workspaceId: string;
              type: SalesAssistArtifactType;
              content: string;
              modelUsed: string;
              promptVersion: string;
              tokenUsage: number | null;
              latencyMs: number;
            };
          }) => Promise<{ id: string }>;
        };
      }
    ).salesAssistArtifact.create({
      data: {
        leadId: lead.id,
        workspaceId: workspace.id,
        type: parsed.data.artifactType,
        content: generation.content,
        modelUsed: generation.modelUsed,
        promptVersion: generation.promptVersion,
        tokenUsage:
          typeof generation.tokenUsage === "number"
            ? Math.round(generation.tokenUsage)
            : null,
        latencyMs: generation.latencyMs,
      },
    });

    await createAuditLog({
      workspaceId: workspace.id,
      actorUserId: userId,
      eventType: "lead.sales_assist.generated",
      entityType: "lead",
      entityId: lead.id,
      metadataJson: {
        artifactId: artifact.id,
        artifactType: parsed.data.artifactType,
        modelUsed: generation.modelUsed,
        promptVersion: generation.promptVersion,
        latencyMs: generation.latencyMs,
      },
    });

    revalidatePath(`/leads/${lead.id}`);

    return {
      status: "success" as const,
      message: `Generated ${parsed.data.artifactType === "followup" ? "the follow-up draft" : `the ${parsed.data.artifactType}`} for ${lead.fullName}.`,
      artifactId: artifact.id,
    };
  } catch (error) {
    return {
      ...initialSalesAssistActionState,
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "The sales assist artifact could not be generated.",
    };
  }
}

export async function generateLeadSummary(
  previousState: SalesAssistActionState,
  formData: FormData
) {
  return generateSalesAssist(previousState, formData, "summary");
}

export async function generateFollowUpDraft(
  previousState: SalesAssistActionState,
  formData: FormData
) {
  return generateSalesAssist(previousState, formData, "followup");
}

export async function generateMeetingBrief(
  previousState: SalesAssistActionState,
  formData: FormData
) {
  return generateSalesAssist(previousState, formData, "brief");
}

export async function retryLeadEnrichment(
  previousState: LeadRetryActionState,
  formData: FormData
) {
  void previousState;
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "Sign in to a workspace before retrying enrichment.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "The active organization is not linked to a workspace yet.",
    };
  }

  const parsed = retryLeadTaskSchema.safeParse({
    leadId: formData.get("leadId"),
  });

  if (!parsed.success) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message:
        parsed.error.issues[0]?.message ??
        "The lead enrichment retry request is invalid.",
    };
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: parsed.data.leadId,
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      fullName: true,
      status: true,
    },
  });

  if (!lead) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "That lead could not be found in the active workspace.",
    };
  }

  if (lead.status === "enriching") {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "Enrichment is already running for this lead.",
    };
  }

  const enqueueResult = await enqueueLeadEnrichment({
    workspaceId: workspace.id,
    entityId: lead.id,
    entityType: "lead",
    actorUserId: userId,
    force: true,
  });

  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/review-queue");

  if (!enqueueResult.ok) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: enqueueResult.error,
    };
  }

  return {
    status: "success" as const,
    message: `${lead.fullName} has been re-queued for enrichment.`,
  };
}

export async function retryLeadScoring(
  previousState: LeadRetryActionState,
  formData: FormData
) {
  void previousState;
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "Sign in to a workspace before retrying scoring.",
    };
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "The active organization is not linked to a workspace yet.",
    };
  }

  const parsed = retryLeadTaskSchema.safeParse({
    leadId: formData.get("leadId"),
  });

  if (!parsed.success) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message:
        parsed.error.issues[0]?.message ??
        "The lead scoring retry request is invalid.",
    };
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: parsed.data.leadId,
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      fullName: true,
      status: true,
      score: {
        select: {
          id: true,
        },
      },
      enrichments: {
        orderBy: {
          enrichedAt: "desc",
        },
        take: 1,
        select: {
          status: true,
        },
      },
    },
  });

  if (!lead) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "That lead could not be found in the active workspace.",
    };
  }

  if (lead.score) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "This lead already has a saved score.",
    };
  }

  const latestEnrichment = lead.enrichments[0];

  if (!latestEnrichment || latestEnrichment.status === "failed") {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: "Run enrichment successfully before retrying scoring.",
    };
  }

  const enqueueResult = await enqueueLeadScoring({
    workspaceId: workspace.id,
    entityId: lead.id,
    entityType: "lead",
    actorUserId: userId,
    force: true,
  });

  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/review-queue");

  if (!enqueueResult.ok) {
    return {
      ...initialLeadRetryActionState,
      status: "error" as const,
      message: enqueueResult.error,
    };
  }

  return {
    status: "success" as const,
    message: `${lead.fullName} has been re-queued for scoring.`,
  };
}
