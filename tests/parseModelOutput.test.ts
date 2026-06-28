import { describe, expect, it } from "vitest";

import { ModelOutputError } from "../src/errors";
import { MockFinanceAnalyzer } from "../src/llm/MockFinanceAnalyzer";
import { parseModelOutput } from "../src/llm/parseModelOutput";
import type { AnalyzeRequest } from "../src/schemas/analyze";

const validRequest: AnalyzeRequest = {
  query: "Explain Marketing Opex movement.",
  analysis_type: "variance",
  entity_id: "uk_01",
  period: "2026-05"
};

describe("parseModelOutput", () => {
  it("parses valid model JSON", async () => {
    const response = await new MockFinanceAnalyzer().analyze(validRequest, { runId: "ana_parse_test" });

    const parsed = parseModelOutput(JSON.stringify(response));

    expect(parsed.run_id).toBe("ana_parse_test");
    expect(parsed.analysis_type).toBe("variance");
  });

  it("throws ModelOutputError for malformed JSON", () => {
    expect(() => parseModelOutput("{not-json")).toThrow(ModelOutputError);
  });

  it("throws ModelOutputError for schema-invalid JSON", () => {
    expect(() => parseModelOutput(JSON.stringify({ run_id: "ana_missing_fields" }))).toThrow(ModelOutputError);
  });
});
