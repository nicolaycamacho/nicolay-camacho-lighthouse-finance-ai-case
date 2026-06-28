import { describe, expect, it } from "vitest";

import { MockFinanceAnalyzer } from "../src/llm/MockFinanceAnalyzer";
import { analyzeRequestSchema, analyzeResponseSchema, type AnalyzeRequest } from "../src/schemas/analyze";

const validRequest: AnalyzeRequest = {
  query: "Explain the material movement in Marketing Opex for the UK entity.",
  analysis_type: "variance",
  entity_id: "uk_01",
  period: "2026-05",
  materiality_threshold: 25000,
  include_citations: true,
  requested_actions: ["draft_commentary"]
};

describe("analyze schemas", () => {
  it("passes a valid request", () => {
    expect(analyzeRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("fails an invalid analysis_type", () => {
    const result = analyzeRequestSchema.safeParse({
      ...validRequest,
      analysis_type: "cash_forecast"
    });

    expect(result.success).toBe(false);
  });

  it("fails an invalid period", () => {
    const result = analyzeRequestSchema.safeParse({
      ...validRequest,
      period: "May 2026"
    });

    expect(result.success).toBe(false);
  });

  it("passes a valid response", async () => {
    const analyzer = new MockFinanceAnalyzer();
    const response = await analyzer.analyze(validRequest, { runId: "ana_test" });

    expect(analyzeResponseSchema.safeParse(response).success).toBe(true);
  });

  it("fails a response with missing required fields", async () => {
    const analyzer = new MockFinanceAnalyzer();
    const response = await analyzer.analyze(validRequest, { runId: "ana_test" });
    const invalidResponse = { ...response } as Record<string, unknown>;
    delete invalidResponse.summary;

    expect(analyzeResponseSchema.safeParse(invalidResponse).success).toBe(false);
  });
});
