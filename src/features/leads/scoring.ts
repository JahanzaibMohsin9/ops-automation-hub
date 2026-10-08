import { z } from "zod";

export const LEAD_SCORING_PROMPT_VERSION = "day23-v1";
export const LEAD_SCORING_MODEL = "gpt-5-mini";
export const LEAD_REVIEW_CONFIDENCE_THRESHOLD = 0.82;
export const DEFAULT_LEAD_SCORING_CRITERIA = [
  "Prioritize B2B services, software, finance, healthcare, and operations-heavy companies.",
  "Prefer leads who own revenue operations, sales operations, customer operations, or cross-functional process improvement.",
  "Reward explicit workflow automation, CRM process, document operations, or AI-assisted handoff signals.",
  "De-prioritize tiny businesses, generic inboxes, and leads without enough company context to justify follow-up.",
].join("\n");

export const leadScoringResponseSchema = z.object({
  numericScore: z.number().int().min(0).max(100),
  fitLabel: z.enum(["high_fit", "medium_fit", "low_fit"]),
  reasoning: z.string().trim().min(1).max(2_000),
  missingFields: z.array(z.string().trim().min(1)).max(12),
  confidenceScore: z.number().min(0).max(1),
});

export type LeadScoringResponse = z.infer<typeof leadScoringResponseSchema>;

export const leadScoringJsonSchema = {
  name: "lead_scoring_result",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      numericScore: {
        type: "integer",
        minimum: 0,
        maximum: 100,
      },
      fitLabel: {
        type: "string",
        enum: ["high_fit", "medium_fit", "low_fit"],
      },
      reasoning: {
        type: "string",
      },
      missingFields: {
        type: "array",
        items: {
          type: "string",
        },
      },
      confidenceScore: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
    },
    required: [
      "numericScore",
      "fitLabel",
      "reasoning",
      "missingFields",
      "confidenceScore",
    ],
  },
  strict: true,
} as const;

export type LeadScoringPromptInput = {
  lead: {
    fullName: string;
    email: string;
    companyName: string;
    companyDomain: string | null;
    jobTitle: string | null;
    industry: string | null;
    employeeRange: string | null;
  };
  enrichment: {
    companyDescription?: string;
    industry?: string;
    employeeRange?: string;
    website?: string;
    linkedInUrl?: string;
    technologies: string[];
    foundedYear?: number;
  } | null;
  workspaceLeadScoringCriteria?: string | null;
};

export function buildLeadScoringSystemPrompt(workspaceLeadScoringCriteria?: string | null) {
  const normalizedCriteria =
    workspaceLeadScoringCriteria?.trim() || DEFAULT_LEAD_SCORING_CRITERIA;

  return [
    "You score B2B leads for an operations and revenue automation consultancy.",
    "Workspace ICP guidance:",
    normalizedCriteria,
    "Use only the lead and enrichment context provided. Do not invent budget, intent, headcount, or tooling details.",
    "Reason from explicit evidence first. If a useful signal is missing, reflect that in missingFields and lower confidence.",
    "Differentiate aggressively between weak, plausible, and strong fit. Avoid clustering scores in the 50-60 range unless the evidence truly sits in the middle.",
    "Score from 0 to 100 using this rubric:",
    "- 80-100: strong fit, clear automation need, enough business context to act.",
    "- 55-79: plausible fit but some uncertainty or missing detail.",
    "- 0-54: weak fit, little automation need, or poor business match.",
    "Scoring anchors:",
    '- A RevOps or operations leader at a 51+ employee company with CRM or workflow tooling signals should usually land in the 80+ range when context is coherent.',
    '- A lead with a relevant company but missing title, weak operational signals, or partial enrichment should usually land in the 55-79 range.',
    '- A tiny company, generic contact, or a business with no clear automation pain should usually land below 55.',
    "Keep reasoning concise and decision-oriented. Mention the strongest positive or negative signals only.",
    "When enrichment and lead fields disagree, prefer the interpretation with lower certainty.",
    "Prefer lower confidence when key firmographic or operational details are missing, contradictory, or inferred from weak evidence.",
    "Confidence calibration:",
    "- 0.90-1.00: multiple explicit ICP signals and little contradiction.",
    "- 0.82-0.89: usable but still missing one meaningful detail.",
    "- 0.60-0.81: notable uncertainty, partial enrichment, or ambiguous business need.",
    "- below 0.60: sparse or contradictory evidence.",
    "Return valid JSON matching the schema exactly.",
  ].join("\n");
}

export function buildLeadScoringUserPrompt(input: LeadScoringPromptInput) {
  return JSON.stringify(
    {
      lead: input.lead,
      enrichment: input.enrichment,
      workspaceLeadScoringCriteria:
        input.workspaceLeadScoringCriteria?.trim() || DEFAULT_LEAD_SCORING_CRITERIA,
      instructions: {
        classifyFitLabel: {
          high_fit: "Strong ICP match and meaningful automation potential.",
          medium_fit: "Some ICP match but missing certainty or only moderate automation need.",
          low_fit: "Weak ICP match or low expected value.",
        },
        missingFieldGuidance:
          "Include only fields that materially limited the scoring decision, such as companyDomain, jobTitle, industry, employeeRange, or other absent ICP signals.",
        confidenceGuidance:
          "Use a number from 0.0 to 1.0. Lower confidence when important fields are missing, provider data is partial, or the business case is implied rather than explicit.",
        fewShotCalibration: [
          {
            leadSummary:
              "Revenue Operations Manager at a 200-person healthcare services company using HubSpot and Slack.",
            expectedShape: {
              numericScore: "85-95",
              fitLabel: "high_fit",
              confidenceScore: "0.9+",
            },
          },
          {
            leadSummary:
              "Operations associate at a 20-person consulting firm with partial enrichment and no confirmed tooling stack.",
            expectedShape: {
              numericScore: "58-72",
              fitLabel: "medium_fit",
              confidenceScore: "0.7-0.85",
            },
          },
          {
            leadSummary:
              "General contact at a very small local business with little company context and no visible automation signal.",
            expectedShape: {
              numericScore: "0-45",
              fitLabel: "low_fit",
              confidenceScore: "0.55-0.75",
            },
          },
        ],
      },
    },
    null,
    2
  );
}

export function resolveLeadStatusFromScore(result: LeadScoringResponse) {
  if (result.fitLabel === "low_fit") {
    return "low_priority" as const;
  }

  if (result.confidenceScore < LEAD_REVIEW_CONFIDENCE_THRESHOLD) {
    return "review_needed" as const;
  }

  return "qualified" as const;
}
