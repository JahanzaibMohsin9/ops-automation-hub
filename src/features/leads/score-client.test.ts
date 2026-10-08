import { ZodError } from "zod";
import { parseLeadScoringResponse } from "@/features/leads/score-client";

describe("parseLeadScoringResponse", () => {
  it("accepts a valid structured response", () => {
    expect(
      parseLeadScoringResponse({
        output_text: JSON.stringify({
          numericScore: 86,
          fitLabel: "high_fit",
          reasoning: "Strong automation profile and good firmographic context.",
          missingFields: [],
          confidenceScore: 0.92,
        }),
      })
    ).toEqual({
      numericScore: 86,
      fitLabel: "high_fit",
      reasoning: "Strong automation profile and good firmographic context.",
      missingFields: [],
      confidenceScore: 0.92,
    });
  });

  it("rejects malformed scoring payloads from the model", () => {
    expect(() =>
      parseLeadScoringResponse({
        output_text: JSON.stringify({
          numericScore: 140,
          fitLabel: "high_fit",
          reasoning: "",
          missingFields: ["companyDomain"],
          confidenceScore: 1.4,
        }),
      })
    ).toThrow(ZodError);
  });
});
