import { z } from "zod";

export const SALES_ASSIST_MODEL = "gpt-5-mini";
export const SALES_ASSIST_PROMPT_VERSION = "day14-v1";

export const salesAssistArtifactTypeSchema = z.enum([
  "summary",
  "followup",
  "brief",
]);

export type SalesAssistArtifactType = z.infer<
  typeof salesAssistArtifactTypeSchema
>;

export type SalesAssistPromptInput = {
  lead: {
    fullName: string;
    email: string;
    phone: string | null;
    companyName: string;
    companyDomain: string | null;
    jobTitle: string | null;
    industry: string | null;
    employeeRange: string | null;
    rawPayloadJson: unknown;
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
  score: {
    numericScore: number;
    fitLabel: string;
    reasoning: string;
    missingFields: string[];
    confidenceScore: number;
  };
};

const artifactDefinitions: Record<
  SalesAssistArtifactType,
  {
    label: string;
    title: string;
    description: string;
    systemPrompt: string;
    outputInstructions: string[];
  }
> = {
  summary: {
    label: "Lead Summary",
    title: "Summary",
    description:
      "A concise internal overview the team can scan before deciding the next sales action.",
    systemPrompt: [
      "You write internal sales summaries for an automation consultancy.",
      "Use only the provided lead, enrichment, and score context.",
      "Be concrete, commercially useful, and avoid generic filler.",
      "Do not restate every input field. Synthesize the highest-signal context.",
      "Write 2 to 3 short paragraphs.",
      "Cover who the lead is, what the company likely does, why the fit looks promising or weak, and what information still needs validation.",
      "Do not invent budget, authority, or timeline details.",
      "If important facts are missing, say what should be verified next.",
    ].join("\n"),
    outputInstructions: [
      "Length: 2 to 3 short paragraphs.",
      "Audience: internal revenue or operations team.",
      "Tone: clear, practical, and direct.",
    ],
  },
  followup: {
    label: "Follow-Up Draft",
    title: "Follow-up",
    description:
      "A personalized first-touch outreach email grounded in the lead's actual context.",
    systemPrompt: [
      "You write high-quality outbound follow-up emails for an automation consultancy.",
      "Use only the provided lead, enrichment, and score context.",
      "Keep the email concise, specific, and human.",
      "Return plain text email copy with a subject line followed by the email body.",
      "Do not use fake metrics, fake case studies, or manipulative urgency.",
      "Reference plausible automation pain points only when supported by the context.",
      "If the context is thin, keep the email modest and exploratory instead of pretending certainty.",
    ].join("\n"),
    outputInstructions: [
      "Include a subject line on the first line in the form 'Subject: ...'.",
      "Keep the body under 180 words.",
      "End with a low-friction call to action.",
    ],
  },
  brief: {
    label: "Meeting Brief",
    title: "Meeting brief",
    description:
      "A structured prep note for a first conversation with this lead.",
    systemPrompt: [
      "You prepare first-meeting briefs for an automation consultancy.",
      "Use only the provided lead, enrichment, and score context.",
      "Return a structured brief in plain text with section headings.",
      "Focus on what the salesperson should understand, ask, and validate.",
      "Do not fabricate facts that are not in the context.",
      "Keep every bullet actionable and specific to this lead.",
    ].join("\n"),
    outputInstructions: [
      "Use these headings exactly: Snapshot, Why They May Care, Talking Points, Discovery Questions, Risks.",
      "Use short bullets under each heading.",
      "Keep it practical enough to use right before a call.",
    ],
  },
};

export function getSalesAssistArtifactDefinition(type: SalesAssistArtifactType) {
  return artifactDefinitions[type];
}

export function buildSalesAssistUserPrompt(
  type: SalesAssistArtifactType,
  input: SalesAssistPromptInput
) {
  const definition = getSalesAssistArtifactDefinition(type);

  return JSON.stringify(
    {
      artifactType: type,
      artifactLabel: definition.label,
      lead: input.lead,
      enrichment: input.enrichment,
      score: {
        numericScore: input.score.numericScore,
        fitLabel: input.score.fitLabel,
        reasoning: input.score.reasoning,
        missingFields: input.score.missingFields,
        confidenceScore: input.score.confidenceScore,
      },
      instructions: definition.outputInstructions,
    },
    null,
    2
  );
}
