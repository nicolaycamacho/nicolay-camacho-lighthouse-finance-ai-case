import { describe, expect, it } from "vitest";

import { TimeoutError } from "../src/errors";
import { withTimeout } from "../src/lib/timeout";
import { DEFAULT_ANALYSIS_TIMEOUT_MS, parseAnalysisTimeoutMs } from "../src/routes/analyze";

describe("withTimeout", () => {
  it("resolves before the timeout window", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("rejects with a non-retryable TimeoutError", async () => {
    await expect(withTimeout(new Promise(() => undefined), 1)).rejects.toMatchObject({
      type: "timeout",
      retryable: false
    });

    await expect(withTimeout(new Promise(() => undefined), 1)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("parseAnalysisTimeoutMs", () => {
  it("uses the configured positive integer timeout", () => {
    expect(parseAnalysisTimeoutMs("2500")).toBe(2500);
  });

  it("falls back to the default timeout for missing or invalid values", () => {
    expect(parseAnalysisTimeoutMs(undefined)).toBe(DEFAULT_ANALYSIS_TIMEOUT_MS);
    expect(parseAnalysisTimeoutMs("abc")).toBe(DEFAULT_ANALYSIS_TIMEOUT_MS);
    expect(parseAnalysisTimeoutMs("0")).toBe(DEFAULT_ANALYSIS_TIMEOUT_MS);
    expect(parseAnalysisTimeoutMs("-5")).toBe(DEFAULT_ANALYSIS_TIMEOUT_MS);
    expect(parseAnalysisTimeoutMs("500.5")).toBe(DEFAULT_ANALYSIS_TIMEOUT_MS);
  });
});
