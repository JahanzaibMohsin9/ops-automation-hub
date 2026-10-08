import { z } from "zod";

const extractorPageSchema = z.object({
  page_number: z.number().int().positive(),
  text: z.string(),
  ocr_used: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});

const extractorResponseSchema = z.object({
  pages: z.array(extractorPageSchema),
  total_pages: z.number().int().nonnegative(),
  extraction_method: z.string().min(1),
});

const extractorErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ExtractorResponse = z.infer<typeof extractorResponseSchema>;

function getRequiredEnv(name: "PYTHON_EXTRACTOR_URL" | "PYTHON_EXTRACTOR_TOKEN") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required to call the Python document processor.`);
  }

  return value;
}

function getExtractorBaseUrl() {
  return getRequiredEnv("PYTHON_EXTRACTOR_URL").replace(/\/$/, "");
}

export async function extractDocumentText(input: {
  storageKey: string;
  mimeType: string;
}): Promise<ExtractorResponse> {
  const response = await fetch(`${getExtractorBaseUrl()}/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getRequiredEnv("PYTHON_EXTRACTOR_TOKEN")}`,
    },
    body: JSON.stringify({
      storage_key: input.storageKey,
      mime_type: input.mimeType,
    }),
    cache: "no-store",
  });

  const rawBody = await response.text();
  const parsedJson = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : null;

  if (!response.ok) {
    const parsedError = extractorErrorSchema.safeParse(parsedJson);

    if (parsedError.success) {
      throw new Error(parsedError.data.error.message);
    }

    throw new Error(
      `Python extractor request failed (${response.status} ${response.statusText}).`
    );
  }

  const parsed = extractorResponseSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(
      `Python extractor returned an invalid response: ${parsed.error.issues[0]?.message ?? "unknown schema mismatch"}.`
    );
  }

  if (parsed.data.total_pages !== parsed.data.pages.length) {
    throw new Error("Python extractor returned mismatched page counts.");
  }

  return parsed.data;
}
