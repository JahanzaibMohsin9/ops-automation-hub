import {
  getEffectiveFieldValue,
  serializeCsv,
  toPlainValue,
} from "@/features/review/export-serialization";

describe("review export serialization", () => {
  it("prefers reviewer overrides when present", () => {
    expect(
      getEffectiveFieldValue({
        fieldValue: "1200",
        reviewerOverrideValue: "1250",
        isOverridden: true,
      })
    ).toBe("1250");
  });

  it("serializes mixed values to plain strings", () => {
    expect(toPlainValue(["net 30", "wire"])).toBe('["net 30","wire"]');
    expect(toPlainValue(42)).toBe("42");
    expect(toPlainValue(null)).toBe("");
  });

  it("escapes CSV values with commas and quotes", () => {
    const csv = serializeCsv([
      {
        file_name: 'invoice "A", final.pdf',
        status: "approved",
      },
    ]);

    expect(csv).toContain('"invoice ""A"", final.pdf"');
    expect(csv).toContain("status");
  });
});
