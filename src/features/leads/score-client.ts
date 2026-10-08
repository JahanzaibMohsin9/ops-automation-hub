import {
  buildLeadScoringSystemPrompt,
  buildLeadScoringUserPrompt,
  leadScoringJsonSchema,
  leadScoringResponseSchema,
  LEAD_SCORING_MODEL,
  LEAD_SCORING_PROMPT_VERSION,
  type LeadScoringPromptInput,
  type LeadScoringResponse,
} from "@/features/leads/scoring";

type ScoringApiResult = {
  result: LeadScoringResponse;
  modelUsed: string;
  promptVersion: string;
  tokenUsage?: number;
  latencyMs: number;
};

type OpenAIResponse = {
  model?: string;
  output_text?: string;
  usage?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function hasUsableOpenAiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  return Boolean(apiKey && apiKey.startsWith("sk-") && apiKey !== "sk-replace_me");
}

function extractOutputText(response: OpenAIResponse) {
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }

  const contentText = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => (item.type === "output_text" ? item.text : undefined))
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("");

  if (!contentText) {
    throw new Error("OpenAI response did not include structured text output.");
  }

  return contentText;
}

export function parseLeadScoringResponse(response: OpenAIResponse) {
  const outputText = extractOutputText(response);
  return leadScoringResponseSchema.parse(JSON.parse(outputText));
}

function computeMockScore(input: LeadScoringPromptInput): LeadScoringResponse {
  let score = 35;
  const missingFields: string[] = [];

  const title = input.lead.jobTitle?.toLowerCase() ?? "";
  const industry = (
    input.enrichment?.industry ??
    input.lead.industry ??
    ""
  ).toLowerCase();
  const employeeRange = input.enrichment?.employeeRange ?? input.lead.employeeRange;
  const technologies = input.enrichment?.technologies ?? [];
  const description = input.enrichment?.companyDescription?.toLowerCase() ?? "";

  if (!input.lead.companyDomain) {
    missingFields.push("companyDomain");
  }

  if (!input.lead.jobTitle) {
    missingFields.push("jobTitle");
  }

  if (!industry) {
    missingFields.push("industry");
  }

  if (!employeeRange) {
    missingFields.push("employeeRange");
  }

  if (/(ops|operations|revenue|growth|sales|marketing)/.test(title)) {
    score += 18;
  }

  if (/(technology|financial services|healthcare|professional services)/.test(industry)) {
    score += 20;
  }

  if (employeeRange && !["1-10", "11-50"].includes(employeeRange)) {
    score += 12;
  }

  if (technologies.some((item) => /(hubspot|salesforce|slack|zapier|netsuite)/i.test(item))) {
    score += 10;
  }

  if (/(automation|workflow|operations|intake|crm|revenue)/.test(description)) {
    score += 12;
  }

  score = Math.max(0, Math.min(100, score));

  const fitLabel =
    score >= 80 ? "high_fit" : score >= 55 ? "medium_fit" : "low_fit";
  const confidenceScore = Number(
    Math.max(0.45, Math.min(0.96, 0.94 - missingFields.length * 0.1)).toFixed(2)
  );

  return {
    numericScore: score,
    fitLabel,
    reasoning:
      fitLabel === "high_fit"
        ? "The lead shows a strong operations or revenue workflow profile, enough company context, and tooling signals that suggest clear automation potential."
        : fitLabel === "medium_fit"
          ? "The lead appears plausibly aligned with automation consulting, but some fit signals or firmographic details are still incomplete."
          : "The lead currently looks like a weak match for the automation ICP because the business need or firmographic signals are limited.",
    missingFields,
    confidenceScore,
  };
}

async function scoreWithOpenAi(
  input: LeadScoringPromptInput
): Promise<ScoringApiResult> {
  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: LEAD_SCORING_MODEL,
      reasoning: {
        effort: "medium",
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: buildLeadScoringSystemPrompt(input.workspaceLeadScoringCriteria),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildLeadScoringUserPrompt(input),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...leadScoringJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI scoring request failed: ${response.status} ${errorBody}`);
  }

  const parsed = (await response.json()) as OpenAIResponse;
  const result = parseLeadScoringResponse(parsed);

  return {
    result,
    modelUsed: parsed.model ?? LEAD_SCORING_MODEL,
    promptVersion: LEAD_SCORING_PROMPT_VERSION,
    tokenUsage: (() => {
      if (typeof parsed.usage?.total_tokens === "number") {
        return parsed.usage.total_tokens;
      }

      const tokenSum = [parsed.usage?.input_tokens, parsed.usage?.output_tokens]
        .filter((value): value is number => typeof value === "number")
        .reduce((sum, value) => sum + value, 0);

      return tokenSum > 0 ? tokenSum : undefined;
    })(),
    latencyMs: Date.now() - startedAt,
  };
}

export async function scoreLead(input: LeadScoringPromptInput): Promise<ScoringApiResult> {
  if (!hasUsableOpenAiKey()) {
    const startedAt = Date.now();
    const result = computeMockScore(input);

    return {
      result,
      modelUsed: "mock-scoring-fallback",
      promptVersion: LEAD_SCORING_PROMPT_VERSION,
      latencyMs: Date.now() - startedAt,
    };
  }

  return scoreWithOpenAi(input);
}
