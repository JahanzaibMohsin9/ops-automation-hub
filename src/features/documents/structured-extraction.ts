import { z } from "zod";
import type { DocumentType } from "@/generated/prisma/client";

export const DOCUMENT_EXTRACTION_PROMPT_VERSION = "day23-v1";
export const DOCUMENT_EXTRACTION_MODEL = "gpt-5-mini";
export const DOCUMENT_OVERALL_REVIEW_THRESHOLD = 0.82;
export const DOCUMENT_FIELD_REVIEW_THRESHOLD = 0.76;

const fieldSchema = z.object({
  fieldName: z.string().trim().min(1),
  fieldValue: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1),
  sourceSnippet: z.string().trim().min(1).nullable(),
});

const invoiceLineItemSchema = z.object({
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  total: z.number().nullable(),
});

const invoiceExtractionSchema = z.object({
  vendor_name: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  due_date: z.string().nullable(),
  line_items: z.array(invoiceLineItemSchema),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  currency: z.string().nullable(),
  payment_terms: z.string().nullable(),
});

const onboardingExtractionSchema = z.object({
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  company_name: z.string().nullable(),
  role: z.string().nullable(),
  start_date: z.string().nullable(),
  emergency_contact: z.string().nullable(),
  notes: z.string().nullable(),
});

const agreementExtractionSchema = z.object({
  parties: z.array(z.string()),
  agreement_type: z.string().nullable(),
  effective_date: z.string().nullable(),
  expiration_date: z.string().nullable(),
  key_terms: z.array(z.string()),
  total_value: z.number().nullable(),
  payment_schedule: z.string().nullable(),
  signatures: z.array(z.string()),
});

const responseBaseSchema = z.object({
  confidenceScore: z.number().min(0).max(1),
  fields: z.array(fieldSchema).min(1),
});

export const invoiceExtractionResponseSchema = responseBaseSchema.extend({
  extraction: invoiceExtractionSchema,
});

export const onboardingExtractionResponseSchema = responseBaseSchema.extend({
  extraction: onboardingExtractionSchema,
});

export const agreementExtractionResponseSchema = responseBaseSchema.extend({
  extraction: agreementExtractionSchema,
});

export const structuredExtractionResponseSchema = z.discriminatedUnion(
  "schemaType",
  [
    invoiceExtractionResponseSchema.extend({ schemaType: z.literal("invoice") }),
    onboardingExtractionResponseSchema.extend({
      schemaType: z.literal("onboarding_form"),
    }),
    agreementExtractionResponseSchema.extend({
      schemaType: z.literal("agreement"),
    }),
  ]
);

export type StructuredExtractionResponse = z.infer<
  typeof structuredExtractionResponseSchema
>;

export type StructuredExtractionPromptInput = {
  documentType: DocumentType;
  fileName: string;
  pages: Array<{
    pageNumber: number;
    rawText: string;
    ocrUsed: boolean;
  }>;
};

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;
const fieldJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fieldName: { type: "string" },
    fieldValue: nullableString,
    confidenceScore: { type: "number", minimum: 0, maximum: 1 },
    sourceSnippet: nullableString,
  },
  required: ["fieldName", "fieldValue", "confidenceScore", "sourceSnippet"],
} as const;

const responseShell = {
  schemaType: { type: "string" },
  confidenceScore: { type: "number", minimum: 0, maximum: 1 },
  fields: {
    type: "array",
    items: fieldJsonSchema,
  },
} as const;

export const documentExtractionJsonSchemas = {
  invoice: {
    name: "invoice_structured_extraction",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...responseShell,
        schemaType: { type: "string", enum: ["invoice"] },
        extraction: {
          type: "object",
          additionalProperties: false,
          properties: {
            vendor_name: nullableString,
            invoice_number: nullableString,
            invoice_date: nullableString,
            due_date: nullableString,
            line_items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  description: nullableString,
                  quantity: nullableNumber,
                  unit_price: nullableNumber,
                  total: nullableNumber,
                },
                required: ["description", "quantity", "unit_price", "total"],
              },
            },
            subtotal: nullableNumber,
            tax: nullableNumber,
            total: nullableNumber,
            currency: nullableString,
            payment_terms: nullableString,
          },
          required: [
            "vendor_name",
            "invoice_number",
            "invoice_date",
            "due_date",
            "line_items",
            "subtotal",
            "tax",
            "total",
            "currency",
            "payment_terms",
          ],
        },
      },
      required: ["schemaType", "extraction", "confidenceScore", "fields"],
    },
    strict: true,
  },
  onboarding_form: {
    name: "onboarding_form_structured_extraction",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...responseShell,
        schemaType: { type: "string", enum: ["onboarding_form"] },
        extraction: {
          type: "object",
          additionalProperties: false,
          properties: {
            full_name: nullableString,
            email: nullableString,
            phone: nullableString,
            address: nullableString,
            company_name: nullableString,
            role: nullableString,
            start_date: nullableString,
            emergency_contact: nullableString,
            notes: nullableString,
          },
          required: [
            "full_name",
            "email",
            "phone",
            "address",
            "company_name",
            "role",
            "start_date",
            "emergency_contact",
            "notes",
          ],
        },
      },
      required: ["schemaType", "extraction", "confidenceScore", "fields"],
    },
    strict: true,
  },
  agreement: {
    name: "agreement_structured_extraction",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...responseShell,
        schemaType: { type: "string", enum: ["agreement"] },
        extraction: {
          type: "object",
          additionalProperties: false,
          properties: {
            parties: { type: "array", items: { type: "string" } },
            agreement_type: nullableString,
            effective_date: nullableString,
            expiration_date: nullableString,
            key_terms: { type: "array", items: { type: "string" } },
            total_value: nullableNumber,
            payment_schedule: nullableString,
            signatures: { type: "array", items: { type: "string" } },
          },
          required: [
            "parties",
            "agreement_type",
            "effective_date",
            "expiration_date",
            "key_terms",
            "total_value",
            "payment_schedule",
            "signatures",
          ],
        },
      },
      required: ["schemaType", "extraction", "confidenceScore", "fields"],
    },
    strict: true,
  },
} as const;

const schemaFieldGuidance: Record<DocumentType, string[]> = {
  invoice: [
    "vendor_name",
    "invoice_number",
    "invoice_date",
    "due_date",
    "line_items",
    "subtotal",
    "tax",
    "total",
    "currency",
    "payment_terms",
  ],
  onboarding_form: [
    "full_name",
    "email",
    "phone",
    "address",
    "company_name",
    "role",
    "start_date",
    "emergency_contact",
    "notes",
  ],
  agreement: [
    "parties",
    "agreement_type",
    "effective_date",
    "expiration_date",
    "key_terms",
    "total_value",
    "payment_schedule",
    "signatures",
  ],
};

export function buildDocumentExtractionSystemPrompt(documentType: DocumentType) {
  return [
    `Extract structured data from a ${documentType.replace(/_/g, " ")}.`,
    "Use only the page text provided. Do not infer missing values from outside knowledge.",
    "Return valid JSON matching the supplied schema exactly.",
    "Use null for unknown scalar values and [] for unknown list values.",
    "Add a field-level entry for every top-level schema field.",
    "For fieldValue, serialize arrays or objects as compact JSON strings.",
    "For sourceSnippet, include the shortest text snippet that supports the field, or null when the value is unknown.",
    "Score confidence from 0.0 to 1.0 for each field. Lower confidence for OCR noise, conflicting values, missing labels, ambiguous table rows, or values inferred from layout.",
    "Confidence calibration:",
    "- 0.90-1.00: exact labeled value is clearly visible in the text.",
    "- 0.82-0.89: value is likely correct but text is lightly noisy or formatting is inconsistent.",
    "- 0.65-0.81: value required interpretation across lines, tables, or OCR artifacts.",
    "- below 0.65: value is weakly supported, conflicting, or mostly absent.",
    "Do not assign high confidence to guessed values. Unknown is better than a confident hallucination.",
    `Top-level fields: ${schemaFieldGuidance[documentType].join(", ")}.`,
  ].join("\n");
}

export function buildDocumentExtractionUserPrompt(
  input: StructuredExtractionPromptInput
) {
  return JSON.stringify(
    {
      fileName: input.fileName,
      documentType: input.documentType,
      pages: input.pages.map((page) => ({
        pageNumber: page.pageNumber,
        ocrUsed: page.ocrUsed,
        text: page.rawText,
      })),
      instructions: {
        dateFormat:
          "Prefer ISO YYYY-MM-DD when an exact date is visible; otherwise keep the visible source text.",
        numberFormat:
          "Return numeric money fields as numbers without currency symbols or thousands separators.",
        confidence:
          "Overall confidence should reflect both field confidence and deterministic validation risk.",
        extractionExamples: {
          invoice:
            "Use high confidence only when invoice labels and amounts align directly. Lower confidence when totals appear only in a noisy table row.",
          onboarding_form:
            "Use lower confidence for names, phone numbers, or addresses pulled from OCR-heavy scans unless the value is clearly legible.",
          agreement:
            "Use lower confidence for parties or dates when they are implied across multiple paragraphs rather than explicitly labeled.",
        },
      },
    },
    null,
    2
  );
}

export function parseStructuredExtractionResponse(
  documentType: DocumentType,
  outputText: string
) {
  const parsed = structuredExtractionResponseSchema.parse(JSON.parse(outputText));

  if (parsed.schemaType !== documentType) {
    throw new Error(
      `Structured extraction returned ${parsed.schemaType}, expected ${documentType}.`
    );
  }

  return parsed;
}
