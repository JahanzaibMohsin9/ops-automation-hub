import { getDocumentPipelineSteps } from "@/features/documents/progress";

describe("getDocumentPipelineSteps", () => {
  it("shows review as current when low-confidence extraction is pending review", () => {
    const steps = getDocumentPipelineSteps({
      uploadStatus: "uploaded",
      processingStatus: "review_needed",
      hasExtractedPages: true,
      hasStructuredRecord: true,
      reviewTaskStatus: "pending",
    });

    expect(steps.map((step) => step.state)).toEqual([
      "complete",
      "complete",
      "complete",
      "current",
      "upcoming",
    ]);
  });

  it("marks export as current after approval", () => {
    const steps = getDocumentPipelineSteps({
      uploadStatus: "uploaded",
      processingStatus: "approved",
      hasExtractedPages: true,
      hasStructuredRecord: true,
      reviewTaskStatus: "approved",
    });

    expect(steps[3]?.state).toBe("complete");
    expect(steps[4]?.state).toBe("current");
  });

  it("surfaces failure before extraction completes", () => {
    const steps = getDocumentPipelineSteps({
      uploadStatus: "uploaded",
      processingStatus: "failed",
      hasExtractedPages: false,
      hasStructuredRecord: false,
      reviewTaskStatus: null,
    });

    expect(steps[1]?.state).toBe("attention");
    expect(steps[2]?.state).toBe("attention");
  });
});
