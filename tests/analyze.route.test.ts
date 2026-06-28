import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app";
import { toErrorResponse, toHttpError, UpstreamLLMError } from "../src/errors";
import { AnthropicFinanceAnalyzer } from "../src/llm/AnthropicFinanceAnalyzer";
import type { FinanceAnalyzer } from "../src/llm/FinanceAnalyzer";
import { MockFinanceAnalyzer } from "../src/llm/MockFinanceAnalyzer";
import { createAnalyzeRouter } from "../src/routes/analyze";
import { analyzeResponseSchema, type AnalyzeRequest } from "../src/schemas/analyze";

const validRequest: AnalyzeRequest = {
  query: "Explain the material movement in Marketing Opex for the UK entity in 2026-05.",
  analysis_type: "variance",
  entity_id: "uk_01",
  period: "2026-05",
  materiality_threshold: 25000,
  include_citations: true
};

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("rejects non-finite analyzer amounts before JSON serialization", async () => {
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        const response = await new MockFinanceAnalyzer().analyze(validRequest, { runId: "ana_infinite_amount" });
        const [firstDriver, ...remainingDrivers] = response.drivers;

        if (!firstDriver) {
          throw new Error("mock response did not include a driver");
        }

        return {
          ...response,
          drivers: [
            {
              ...firstDriver,
              amount: Infinity
            },
            ...remainingDrivers
          ]
        };
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

  it("constructs service-owned validation metadata for analyzer output that omits it", async () => {
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        return new MockFinanceAnalyzer().analyze(validRequest, { runId: "ana_service_validation" });
      }
    };

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(200);

    expect(response.body.validation).toEqual({
      schema_valid: true,
      grounding_records_found: 3,
      numeric_reconciliation_passed: true
    });
  });

  it("rejects analyzer output that includes service-owned validation metadata", async () => {
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        const response = await new MockFinanceAnalyzer().analyze(validRequest, { runId: "ana_model_validation" });

        return {
          ...response,
          validation: {
            schema_valid: false,
            grounding_records_found: 999,
            numeric_reconciliation_passed: true
          }
        } as never;
      }
    };

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(502);

    expect(response.body.error.type).toBe("model_output_invalid");
  });

  it("accepts raw model JSON without service-owned validation metadata", async () => {
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        const response = await new MockFinanceAnalyzer().analyze(validRequest, { runId: "ana_raw_without_validation" });
        return JSON.stringify(response);
      }
    };

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(200);

    expect(response.body.run_id).toBe("ana_raw_without_validation");
    expect(response.body.validation.schema_valid).toBe(true);
    expect(response.body.validation.grounding_records_found).toBe(3);
  });

  it("does not pass presentation-only citation preferences to analyzers", async () => {
    let observedRequest: unknown;
    const analyzer: FinanceAnalyzer = {
      async analyze(request) {
        observedRequest = request;
        return new MockFinanceAnalyzer().analyze(request, { runId: "ana_internal_request" });
      }
    };

    const response = await request(createTestApp(analyzer))
      .post("/analyze")
      .send({
        ...validRequest,
        include_citations: false
      })
      .expect(200);

    expect(observedRequest).not.toHaveProperty("include_citations");
    expect(response.body.citations).toEqual([]);
    expect(response.body.validation.grounding_records_found).toBe(3);
  });

  it("requires deterministic evidence for numeric reconciliation", async () => {
    const analyzer: FinanceAnalyzer = {
      async analyze() {
        const response = await new MockFinanceAnalyzer().analyze(validRequest, { runId: "ana_numeric_validation" });
        const [firstDriver, ...remainingDrivers] = response.drivers;

        if (!firstDriver) {
          throw new Error("mock response did not include a driver");
        }

        return {
          ...response,
          drivers: [
            {
              ...firstDriver,
              citations: [
                {
                  source_type: "model_claim",
                  source_record_id: "unverified_amount"
                }
              ]
            },
            ...remainingDrivers
          ]
        };
      }
    };

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(200);

    expect(response.body.validation.numeric_reconciliation_passed).toBe(false);
  });

  it("does not count live Anthropic model citations as service-owned grounding", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                run_id: "ana_live_grounding",
                analysis_type: "variance",
                status: "needs_review",
                summary: "Demo variance needs review.",
                drivers: [
                  {
                    rank: 1,
                    driver_type: "demo_variance_driver",
                    label: "Marketing Opex",
                    amount: 123.45,
                    currency: "USD",
                    explanation: "Model tried to invent citation records.",
                    citations: [
                      {
                        source_type: "warehouse_model",
                        source_record_id: "invented_warehouse_row"
                      }
                    ]
                  }
                ],
                recommended_actions: [
                  {
                    action_type: "draft_commentary",
                    priority: "medium",
                    text: "Review before sharing."
                  }
                ],
                confidence: {
                  overall: 0.6,
                  reasons: ["Demo context only."]
                },
                citations: [
                  {
                    source_type: "demo_context",
                    source_record_id: "invented_demo_context"
                  }
                ],
                review_required: true,
                audit: {
                  generated_at: "2026-06-28T00:00:00.000Z",
                  model_name: "claude-test",
                  prompt_version: "finance-close-command-centre-live-v1"
                }
              })
            }
          ]
        }),
        { status: 200 }
      )
    );

    const analyzer = new AnthropicFinanceAnalyzer("test-key", {
      model: "claude-test",
      endpoint: "https://example.test/messages"
    });

    const response = await request(createTestApp(analyzer)).post("/analyze").send(validRequest).expect(200);

    expect(response.body.citations).toEqual([]);
    expect(response.body.drivers[0].citations).toEqual([]);
    expect(response.body.validation).toEqual({
      schema_valid: true,
      grounding_records_found: 0,
      numeric_reconciliation_passed: false
    });
  });

  it("does not mark no-amount summaries as numerically reconciled", async () => {
    const response = await request(app)
      .post("/analyze")
      .send({
        query: "Summarize close readiness for the UK entity.",
        analysis_type: "close_summary",
        entity_id: "uk_01",
        period: "2026-05"
      })
      .expect(200);

    expect(response.body.validation.numeric_reconciliation_passed).toBe(false);
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
