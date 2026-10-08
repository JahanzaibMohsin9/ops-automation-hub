import {
  buildSalesAssistUserPrompt,
  getSalesAssistArtifactDefinition,
  SALES_ASSIST_MODEL,
  SALES_ASSIST_PROMPT_VERSION,
  type SalesAssistArtifactType,
  type SalesAssistPromptInput,
} from "@/features/leads/sales-assist";

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

export type SalesAssistGenerationResult = {
  content: string;
  modelUsed: string;
  promptVersion: string;
  tokenUsage?: number;
  latencyMs: number;
};

function hasUsableOpenAiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  return Boolean(apiKey && apiKey.startsWith("sk-") && apiKey !== "sk-replace_me");
}

function extractOutputText(response: OpenAIResponse) {
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text.trim();
  }

  const contentText = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => (item.type === "output_text" ? item.text : undefined))
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("")
    .trim();

  if (!contentText) {
    throw new Error("OpenAI response did not include usable text output.");
  }

  return contentText;
}

function summarizeSignals(input: SalesAssistPromptInput) {
  const signals: string[] = [];

  if (input.lead.jobTitle) {
    signals.push(`${input.lead.fullName} is a ${input.lead.jobTitle}`);
  }

  if (input.enrichment?.industry ?? input.lead.industry) {
    signals.push(
      `${input.lead.companyName} operates in ${
        input.enrichment?.industry ?? input.lead.industry
      }`
    );
  }

  if (input.enrichment?.technologies?.length) {
    signals.push(
      `their stack mentions ${input.enrichment.technologies.slice(0, 3).join(", ")}`
    );
  }

  if (input.score.reasoning) {
    signals.push(input.score.reasoning);
  }

  return signals;
}

function buildMockArtifact(
  type: SalesAssistArtifactType,
  input: SalesAssistPromptInput
) {
  const scorePercent = `${input.score.numericScore}/100`;
  const confidencePercent = `${Math.round(input.score.confidenceScore * 100)}%`;
  const industry = input.enrichment?.industry ?? input.lead.industry ?? "their market";
  const employeeRange =
    input.enrichment?.employeeRange ?? input.lead.employeeRange ?? "an unknown team size";
  const signals = summarizeSignals(input);
  const signalSentence =
    signals.length > 0
      ? signals.join("; ")
      : `${input.lead.companyName} has limited qualifying detail so far.`;

  switch (type) {
    case "summary":
      return [
        `${input.lead.fullName} at ${input.lead.companyName} currently scores ${scorePercent} as a ${input.score.fitLabel.replace("_", " ")} lead with ${confidencePercent} confidence. ${signalSentence}`,
        `${input.lead.companyName} appears to be in ${industry} with ${employeeRange}. The account looks most relevant if the team is dealing with manual lead intake, CRM handoff, document-heavy ops work, or fragmented automation workflows. Key gaps still worth validating: ${
          input.score.missingFields.length > 0
            ? input.score.missingFields.join(", ")
            : "no major missing fields surfaced by scoring"
        }.`,
      ].join("\n\n");
    case "followup":
      return [
        `Subject: Quick idea for streamlining ${input.lead.companyName}'s ops workflow`,
        ``,
        `Hi ${input.lead.fullName.split(" ")[0]},`,
        ``,
        `I took a look at ${input.lead.companyName} and it seems like your team may be a strong fit for workflow automation support, especially around lead handoff, CRM process cleanup, and document-heavy operations.`,
        ``,
        `What stood out most was ${input.score.reasoning.charAt(0).toLowerCase()}${input.score.reasoning.slice(1)}. If that is directionally right, I would be happy to share a few practical ways teams in ${industry} reduce manual work without a long implementation cycle.`,
        ``,
        `Would a short intro call next week be useful?`,
        ``,
        `Best,`,
        `Northbeam Ops`,
      ].join("\n");
    case "brief":
      return [
        `Snapshot`,
        `- Lead: ${input.lead.fullName}, ${input.lead.jobTitle ?? "title unknown"}`,
        `- Company: ${input.lead.companyName}`,
        `- Score: ${scorePercent} (${input.score.fitLabel.replace("_", " ")}, ${confidencePercent} confidence)`,
        ``,
        `Why They May Care`,
        `- ${input.score.reasoning}`,
        `- Likely environment: ${industry}, ${employeeRange}`,
        ``,
        `Talking Points`,
        `- Ask how leads or requests move from intake to CRM and ops handoff today.`,
        `- Explore whether repetitive document or approval steps slow down the team.`,
        `- Reference any existing tooling: ${
          input.enrichment?.technologies.length
            ? input.enrichment.technologies.slice(0, 4).join(", ")
            : "tooling still unclear"
        }.`,
        ``,
        `Discovery Questions`,
        `- Which workflows feel most manual right now?`,
        `- Where do records get stuck or require re-entry?`,
        `- What would make automation worth prioritizing this quarter?`,
        ``,
        `Risks`,
        `- Missing context: ${
          input.score.missingFields.length > 0
            ? input.score.missingFields.join(", ")
            : "none flagged by the scoring prompt"
        }`,
        `- Confidence is ${confidencePercent}, so keep validation tight before pitching a full solution.`,
      ].join("\n");
  }
}

async function generateWithOpenAi(
  type: SalesAssistArtifactType,
  input: SalesAssistPromptInput
): Promise<SalesAssistGenerationResult> {
  const startedAt = Date.now();
  const definition = getSalesAssistArtifactDefinition(type);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: SALES_ASSIST_MODEL,
      reasoning: {
        effort: "medium",
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: definition.systemPrompt,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildSalesAssistUserPrompt(type, input),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI sales assist request failed: ${response.status} ${errorBody}`
    );
  }

  const parsed = (await response.json()) as OpenAIResponse;

  return {
    content: extractOutputText(parsed),
    modelUsed: parsed.model ?? SALES_ASSIST_MODEL,
    promptVersion: SALES_ASSIST_PROMPT_VERSION,
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

export async function generateSalesAssistArtifact(
  type: SalesAssistArtifactType,
  input: SalesAssistPromptInput
): Promise<SalesAssistGenerationResult> {
  if (!hasUsableOpenAiKey()) {
    const startedAt = Date.now();

    return {
      content: buildMockArtifact(type, input),
      modelUsed: "mock-sales-assist-fallback",
      promptVersion: SALES_ASSIST_PROMPT_VERSION,
      latencyMs: Date.now() - startedAt,
    };
  }

  return generateWithOpenAi(type, input);
}
