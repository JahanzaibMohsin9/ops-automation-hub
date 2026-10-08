import { extractStructuredDocumentData } from "@/features/documents/structured-extraction-client";

describe("extractStructuredDocumentData", () => {
  it("extracts invoice fields with the local fallback", async () => {
    const result = await extractStructuredDocumentData({
      documentType: "invoice",
      fileName: "invoice-clean.pdf",
      pages: [
        {
          pageNumber: 1,
          ocrUsed: false,
          rawText: [
            "Vendor: Northbeam Ops",
            "Invoice Number: INV-1042",
            "Invoice Date: 2026-04-02",
            "Due Date: 2026-04-30",
            "Subtotal: 1200.00",
            "Tax: 120.00",
            "Total: 1320.00",
            "Payment Terms: Net 30",
          ].join("\n"),
        },
      ],
    });

    expect(result.result.schemaType).toBe("invoice");
    if (result.result.schemaType !== "invoice") {
      throw new Error("Expected invoice extraction result.");
    }
    expect(result.result.extraction.invoice_number).toBe("INV-1042");
    expect(result.result.confidenceScore).toBeGreaterThan(0.8);
  });

  it("reduces confidence for OCR-heavy onboarding documents", async () => {
    const result = await extractStructuredDocumentData({
      documentType: "onboarding_form",
      fileName: "onboarding-scan.png",
      pages: [
        {
          pageNumber: 1,
          ocrUsed: true,
          rawText: [
            "Full Name: Sam Rivera",
            "Email: sam@northbeamops.com",
            "Phone: +1 555 010 2222",
            "Company: Northbeam Ops",
            "Role: Operations Analyst",
          ].join("\n"),
        },
      ],
    });

    expect(result.result.schemaType).toBe("onboarding_form");
    expect(result.result.confidenceScore).toBeLessThan(0.85);
  });
});
