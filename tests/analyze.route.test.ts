import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app";
import { toErrorResponse, toHttpError, UpstreamLLMError } from "../src/errors";
import type { FinanceAnalyzer } from "../src/llm/FinanceAnalyzer";
import { MockFinanceAnalyzer } from "../src/llm/MockFinanceAnalyzer";
import { createAnalyzeRouter } from "../src/routes/analyze";
import { analyzeResponseSchema } from "../src/schemas/analyze";

const validRequest = {
  query: "Explain the material movement in Marketing Opex for the UK entity in 2026-05.",
  analysis_type: "variance",
  entity_id: "uk_01",
  period: "2026-05",
  materiality_threshold: 25000,
  include_citations: true
};

describe("analyze routes", () => {
  it("GET /health returns ok", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "lighthouse-finance-ai-case"
    });
  });

  it("POST /analyze returns 200", async () => {
    const response = await request(app).post("/analyze").send(validRequest).expect(200);

    expect(response.body.analysis_type).toBe("variance");
    expect(response.body.status).toBe("needs_review");
  });

  it("POST /analyze response is schema-valid", async () => {
    const response = await request(app).post("/analyze").send(validRequest).expect(200);

    expect(analyzeResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it("invalid request returns 400", async () => {
    const response = await request(app)
      .post("/analyze")
      .send({
        query: "",
        analysis_type: "variance"
      })
      .expect(400);

    expect(response.body.error.type).toBe("validation_error");
  });

  it("malformed JSON request returns 400", async () => {
    const response = await request(app)
      .post("/analyze")
      .set("Content-Type", "application/json")
      .send('{"query":')
      .expect(400);

    expect(response.body.error).toEqual({
      type: "validation_error",
      message: "Malformed JSON request body",
      retryable: false,
      details: {
        reason: "Request body must be valid JSON"
      }
    });
  });

  it("oversized JSON request preserves the parser 413 status", async () => {
    const response = await request(app)
      .post("/analyze")
      .send({
        ...validRequest,
        query: "x".repeat(1024 * 1024 + 1)
      })
      .expect(413);

    expect(response.body.error).toEqual({
      type: "request_body_too_large",
      message: "Request body is too large",
      retryable: false,
      details: expect.objectContaining({
        parser_error_type: "entity.too.large"
      })
    });
  });

  it("returns structured error responses", async () => {
    const response = await request(app)
      .post("/analyze")
      .send({
        query: "Bad mode",
        analysis_type: "unsupported"
      })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        type: "validation_error",
        message: "Invalid analyze request",
        retryable: false,
        details: expect.objectContaining({
          issues: expect.any(Array)
        })
      }
    });
  });

  it("maps raw malformed model output to 502", async () => {
    let attempts = 0;
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        attempts += 1;
        return "{not-json";
      }
    };

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(502);

    expect(response.body.error.type).toBe("model_output_invalid");
    expect(attempts).toBe(2);
  });

  it("maps schema-invalid analyzer output to 502", async () => {
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        return {
          run_id: "ana_invalid"
        } as never;
      }
    };

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(502);

    expect(response.body.error.type).toBe("model_output_invalid");
  });

  it("maps adapter-translated upstream analyzer failures to 503 after retry", async () => {
    let attempts = 0;
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        attempts += 1;
        throw new UpstreamLLMError("provider unavailable");
      }
    };

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(503);

    expect(response.body.error.type).toBe("upstream_unavailable");
    expect(attempts).toBe(2);
  });

  it("keeps unexpected analyzer errors as 500 without retrying", async () => {
    let attempts = 0;
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        attempts += 1;
        throw new Error("adapter mapping bug");
      }
    };

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(500);

    expect(response.body.error.type).toBe("internal_error");
    expect(attempts).toBe(1);
  });

  it("maps timeout failures to 408 without retrying", async () => {
    const originalTimeout = process.env.ANALYSIS_TIMEOUT_MS;
    process.env.ANALYSIS_TIMEOUT_MS = "5";

    let attempts = 0;
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        attempts += 1;
        return new Promise<never>(() => undefined);
      }
    };

    try {
      const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(408);

      expect(response.body.error.type).toBe("timeout");
      expect(response.body.error.retryable).toBe(false);
      expect(attempts).toBe(1);
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.ANALYSIS_TIMEOUT_MS;
      } else {
        process.env.ANALYSIS_TIMEOUT_MS = originalTimeout;
      }
    }
  });

  it("aborts analyzer work when a timeout occurs", async () => {
    const originalTimeout = process.env.ANALYSIS_TIMEOUT_MS;
    process.env.ANALYSIS_TIMEOUT_MS = "5";

    let attempts = 0;
    let observedSignal: AbortSignal | undefined;
    let resolveAbortSeen: (() => void) | undefined;
    const abortSeen = new Promise<void>((resolve) => {
      resolveAbortSeen = resolve;
    });

    const analyzer: FinanceAnalyzer = {
      async analyze(_request, options) {
        attempts += 1;
        observedSignal = options?.signal;
        options?.signal?.addEventListener("abort", () => resolveAbortSeen?.(), { once: true });
        return new Promise<never>(() => undefined);
      }
    };

    try {
      const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(408);
      await abortSeen;

      expect(response.body.error.type).toBe("timeout");
      expect(observedSignal?.aborted).toBe(true);
      expect(attempts).toBe(1);
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.ANALYSIS_TIMEOUT_MS;
      } else {
        process.env.ANALYSIS_TIMEOUT_MS = originalTimeout;
      }
    }
  });

  it("keeps grounding count even when returned citations are suppressed", async () => {
    const response = await request(app)
      .post("/analyze")
      .send({
        ...validRequest,
        include_citations: false
      })
      .expect(200);

    expect(response.body.citations).toEqual([]);
    expect(response.body.drivers[0].citations).toBeUndefined();
    expect(response.body.validation.grounding_records_found).toBe(3);
  });
});

function createTestApp(analyzer: FinanceAnalyzer = new MockFinanceAnalyzer()) {
  const testApp = express();
  testApp.use(express.json({ limit: "1mb" }));
  testApp.use("/analyze", createAnalyzeRouter(analyzer));

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const httpError = toHttpError(error);
    res.status(httpError.statusCode).json(toErrorResponse(httpError));
  };

  testApp.use(errorHandler);
  return testApp;
}
