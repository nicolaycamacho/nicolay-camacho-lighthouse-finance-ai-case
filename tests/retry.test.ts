import { describe, expect, it } from "vitest";

import { HttpError, TimeoutError, UpstreamLLMError } from "../src/errors";
import { retry } from "../src/lib/retry";

describe("retry", () => {
  it("retries a transient failure then succeeds", async () => {
    let attempts = 0;

    const result = await retry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new UpstreamLLMError("temporary provider failure");
        }
        return "ok";
      },
      {
        maxAttempts: 3,
        baseDelayMs: 0
      }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry a permanent failure", async () => {
    let attempts = 0;

    await expect(
      retry(
        async () => {
          attempts += 1;
          throw new HttpError(400, "bad_request", "bad request");
        },
        {
          maxAttempts: 3,
          baseDelayMs: 0
        }
      )
    ).rejects.toThrow("bad request");

    expect(attempts).toBe(1);
  });

  it("does not retry timeout failures", async () => {
    let attempts = 0;

    await expect(
      retry(
        async () => {
          attempts += 1;
          throw new TimeoutError("timed out");
        },
        {
          maxAttempts: 3,
          baseDelayMs: 0
        }
      )
    ).rejects.toThrow("timed out");

    expect(attempts).toBe(1);
  });

  it("respects max attempts", async () => {
    let attempts = 0;

    await expect(
      retry(
        async () => {
          attempts += 1;
          throw new UpstreamLLMError("still unavailable");
        },
        {
          maxAttempts: 3,
          baseDelayMs: 0
        }
      )
    ).rejects.toThrow("still unavailable");

    expect(attempts).toBe(3);
  });
});
