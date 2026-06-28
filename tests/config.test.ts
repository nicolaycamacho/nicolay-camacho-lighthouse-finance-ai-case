import { describe, expect, it } from "vitest";

import { DEFAULT_ANALYSIS_TIMEOUT_MS, DEFAULT_PORT, parseAnalysisTimeoutMs, parsePort } from "../src/config";

describe("config parsing", () => {
  it("uses configured positive integer values", () => {
    expect(parseAnalysisTimeoutMs("2500")).toBe(2500);
    expect(parsePort("4000")).toBe(4000);
  });

  it("falls back to defaults for missing or invalid values", () => {
    for (const value of [undefined, "abc", "0", "-5", "500.5", "3000abc"]) {
      expect(parseAnalysisTimeoutMs(value)).toBe(DEFAULT_ANALYSIS_TIMEOUT_MS);
      expect(parsePort(value)).toBe(DEFAULT_PORT);
    }
  });
});
