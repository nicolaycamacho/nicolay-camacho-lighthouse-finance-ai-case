import { describe, expect, it } from "vitest";

import { TimeoutError } from "../src/errors";
import { withTimeout } from "../src/lib/timeout";

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

  it("aborts the configured controller when the timeout window expires", async () => {
    const abortController = new AbortController();

    await expect(
      withTimeout(new Promise(() => undefined), 1, "too slow", {
        abortController
      })
    ).rejects.toBeInstanceOf(TimeoutError);

    expect(abortController.signal.aborted).toBe(true);
  });
});
