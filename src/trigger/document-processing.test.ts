import { describe, expect, it } from "vitest";
import { isOcrRequiredDocumentError } from "@/trigger/document-processing";

describe("isOcrRequiredDocumentError", () => {
  it("flags missing tesseract errors for image documents", () => {
    expect(
      isOcrRequiredDocumentError(
        new Error("Tesseract is unavailable, so image documents cannot be processed yet."),
        "image/png"
      )
    ).toBe(true);
  });

  it("ignores the same error for non-image documents", () => {
    expect(
      isOcrRequiredDocumentError(
        new Error("Tesseract is unavailable, so image documents cannot be processed yet."),
        "application/pdf"
      )
    ).toBe(false);
  });

  it("ignores unrelated image extraction errors", () => {
    expect(
      isOcrRequiredDocumentError(
        new Error("No object was found for the provided storage key."),
        "image/png"
      )
    ).toBe(false);
  });
});
