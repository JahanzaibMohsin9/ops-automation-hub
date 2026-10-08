import type { Prisma } from "@/generated/prisma/client";
import {
  buildDocumentExtractionSystemPrompt,
  buildDocumentExtractionUserPrompt,
  DOCUMENT_EXTRACTION_MODEL,
  DOCUMENT_EXTRACTION_PROMPT_VERSION,
  documentExtractionJsonSchemas,
  parseStructuredExtractionResponse,
  type StructuredExtractionPromptInput,
  type StructuredExtractionResponse,
} from "@/features/documents/structured-extraction";

type ExtractionApiResult = {
  result: StructuredExtractionResponse;
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

function firstTextMatch(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

function findSnippet(text: string, value: string | null) {
  if (!value) {
    return null;
  }

  const index = text.toLowerCase().indexOf(value.toLowerCase());

  if (index === -1) {
    return value;
  }

  return text.slice(Math.max(0, index - 40), Math.min(text.length, index + value.length + 80)).trim();
}

function stringifyFieldValue(value: unknown) {
  if (value == null) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function buildField(
  fullText: string,
  fieldName: string,
  value: unknown,
  confidenceScore: number
) {
  const fieldValue = stringifyFieldValue(value);

  return {
    fieldName,
    fieldValue,
    confidenceScore,
    sourceSnippet: findSnippet(fullText, fieldValue),
  };
}

function computeMockExtraction(
  input: StructuredExtractionPromptInput
): StructuredExtractionResponse {
  const fullText = input.pages.map((page) => page.rawText).join("\n");
  const lowerText = fullText.toLowerCase();
  const ocrPenalty = input.pages.some((page) => page.ocrUsed) ? 0.08 : 0;
  const baseConfidence = Math.max(0.62, 0.9 - ocrPenalty);

  if (input.documentType === "invoice") {
    const extraction = {
      vendor_name:
        firstTextMatch(fullText, /(?:vendor|from|bill from)[:\s]+([^\n]+)/i) ??
        firstTextMatch(fullText, /^([A-Z][^\n]{2,80})/m),
      invoice_number: firstTextMatch(fullText, /invoice\s*(?:#|number|no\.?)?[:\s]+([A-Z0-9-]+)/i),
      invoice_date: firstTextMatch(fullText, /invoice\s*date[:\s]+([^\n]+)/i),
      due_date: firstTextMatch(fullText, /due\s*date[:\s]+([^\n]+)/i),
      line_items: [],
      subtotal: Number(firstTextMatch(fullText, /subtotal[:\s$]+([0-9,.]+)/i)?.replace(/,/g, "")) || null,
      tax: Number(firstTextMatch(fullText, /tax[:\s$]+([0-9,.]+)/i)?.replace(/,/g, "")) || null,
      total: Number(firstTextMatch(fullText, /total[:\s$]+([0-9,.]+)/i)?.replace(/,/g, "")) || null,
      currency: /\$|usd/i.test(fullText) ? "USD" : null,
      payment_terms: firstTextMatch(fullText, /payment\s*terms[:\s]+([^\n]+)/i),
    };

    const fields = Object.entries(extraction).map(([fieldName, value]) =>
      buildField(fullText, fieldName, value, value == null || (Array.isArray(value) && value.length === 0) ? 0.68 : baseConfidence)
    );

    return {
      schemaType: "invoice",
      extraction,
      confidenceScore: fields.reduce((sum, field) => sum + field.confidenceScore, 0) / fields.length,
      fields,
    };
  }

  if (input.documentType === "onboarding_form") {
    const email = firstTextMatch(fullText, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
    const extraction = {
      full_name: firstTextMatch(fullText, /(?:full\s*name|name)[:\s]+([^\n]+)/i),
      email,
      phone: firstTextMatch(fullText, /(?:phone|mobile)[:\s]+([+()0-9 .-]{7,})/i),
      address: firstTextMatch(fullText, /address[:\s]+([^\n]+)/i),
      company_name: firstTextMatch(fullText, /company[:\s]+([^\n]+)/i),
      role: firstTextMatch(fullText, /(?:role|title|position)[:\s]+([^\n]+)/i),
      start_date: firstTextMatch(fullText, /start\s*date[:\s]+([^\n]+)/i),
      emergency_contact: firstTextMatch(fullText, /emergency\s*contact[:\s]+([^\n]+)/i),
      notes: firstTextMatch(fullText, /notes[:\s]+([^\n]+)/i),
    };

    const fields = Object.entries(extraction).map(([fieldName, value]) =>
      buildField(fullText, fieldName, value, value ? baseConfidence : 0.66)
    );

    return {
      schemaType: "onboarding_form",
      extraction,
      confidenceScore: fields.reduce((sum, field) => sum + field.confidenceScore, 0) / fields.length,
      fields,
    };
  }

  const extraction = {
    parties: Array.from(
      new Set(
        [
          firstTextMatch(fullText, /between[:\s]+([^\n]+)/i),
          firstTextMatch(fullText, /party\s*a[:\s]+([^\n]+)/i),
          firstTextMatch(fullText, /party\s*b[:\s]+([^\n]+)/i),
        ].filter((value): value is string => Boolean(value))
      )
    ),
    agreement_type:
      lowerText.includes("master service") || lowerText.includes("msa")
        ? "Master Services Agreement"
        : lowerText.includes("statement of work")
          ? "Statement of Work"
          : "Agreement",
    effective_date: firstTextMatch(fullText, /effective\s*date[:\s]+([^\n]+)/i),
    expiration_date: firstTextMatch(fullText, /(?:expiration|end)\s*date[:\s]+([^\n]+)/i),
    key_terms: [],
    total_value: Number(firstTextMatch(fullText, /(?:total\s*value|contract\s*value)[:\s$]+([0-9,.]+)/i)?.replace(/,/g, "")) || null,
    payment_schedule: firstTextMatch(fullText, /payment\s*schedule[:\s]+([^\n]+)/i),
    signatures: [],
  };
  const fields = Object.entries(extraction).map(([fieldName, value]) =>
    buildField(fullText, fieldName, value, value == null || (Array.isArray(value) && value.length === 0) ? 0.64 : baseConfidence)
  );

  return {
    schemaType: "agreement",
    extraction,
    confidenceScore: fields.reduce((sum, field) => sum + field.confidenceScore, 0) / fields.length,
    fields,
  };
}

async function extractWithOpenAi(
  input: StructuredExtractionPromptInput
): Promise<ExtractionApiResult> {
  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: DOCUMENT_EXTRACTION_MODEL,
      reasoning: {
        effort: "medium",
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: buildDocumentExtractionSystemPrompt(input.documentType),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildDocumentExtractionUserPrompt(input),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...documentExtractionJsonSchemas[input.documentType],
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI document extraction request failed: ${response.status} ${errorBody}`);
  }

  const parsed = (await response.json()) as OpenAIResponse;
  const result = parseStructuredExtractionResponse(
    input.documentType,
    extractOutputText(parsed)
  );

  return {
    result,
    modelUsed: parsed.model ?? DOCUMENT_EXTRACTION_MODEL,
    promptVersion: DOCUMENT_EXTRACTION_PROMPT_VERSION,
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

export function toPrismaJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export async function extractStructuredDocumentData(
  input: StructuredExtractionPromptInput
): Promise<ExtractionApiResult> {
  if (!hasUsableOpenAiKey()) {
    const startedAt = Date.now();

    return {
      result: computeMockExtraction(input),
      modelUsed: "mock-document-extraction-fallback",
      promptVersion: DOCUMENT_EXTRACTION_PROMPT_VERSION,
      latencyMs: Date.now() - startedAt,
    };
  }

  return extractWithOpenAi(input);
}
