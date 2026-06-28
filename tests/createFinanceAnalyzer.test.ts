import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderConfigurationError, UpstreamLLMError } from "../src/errors";
import { AnthropicFinanceAnalyzer, buildUserPrompt } from "../src/llm/AnthropicFinanceAnalyzer";
import { FinanceAnalyzerConfigurationError, createFinanceAnalyzer } from "../src/llm/createFinanceAnalyzer";
import { MockFinanceAnalyzer } from "../src/llm/MockFinanceAnalyzer";

const validRequest = {
  query: "Explain Marketing Opex.",
  analysis_type: "variance" as const,
  entity_id: "uk_01",
  period: "2026-05"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFinanceAnalyzer", () => {
  it("returns MockFinanceAnalyzer when LLM_PROVIDER is missing", () => {
    const analyzer = createFinanceAnalyzer({});

    expect(analyzer).toBeInstanceOf(MockFinanceAnalyzer);
  });

  it("returns MockFinanceAnalyzer when LLM_PROVIDER is mock", () => {
    const analyzer = createFinanceAnalyzer({ LLM_PROVIDER: "mock" });

    expect(analyzer).toBeInstanceOf(MockFinanceAnalyzer);
  });

  it("returns AnthropicFinanceAnalyzer when LLM_PROVIDER is anthropic and a key is present", () => {
    const analyzer = createFinanceAnalyzer({
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key"
    });

    expect(analyzer).toBeInstanceOf(AnthropicFinanceAnalyzer);
  });

  it("throws a clear configuration error for anthropic without ANTHROPIC_API_KEY", () => {
    expect(() => createFinanceAnalyzer({ LLM_PROVIDER: "anthropic" })).toThrow(FinanceAnalyzerConfigurationError);
    expect(() => createFinanceAnalyzer({ LLM_PROVIDER: "anthropic" })).toThrow("ANTHROPIC_API_KEY");
  });

  it("throws a clear configuration error for an unknown LLM_PROVIDER", () => {
    expect(() => createFinanceAnalyzer({ LLM_PROVIDER: "gemini" })).toThrow(FinanceAnalyzerConfigurationError);
    expect(() => createFinanceAnalyzer({ LLM_PROVIDER: "gemini" })).toThrow("Unknown LLM_PROVIDER");
  });
});

describe("Anthropic live prompt", () => {
  it("omits arbitrary request context from the live provider prompt", () => {
    const prompt = buildUserPrompt(
      {
        ...validRequest,
        context: {
          customer_name: "Acme Secret Co",
          api_key: "sk_live_should_not_leave_boundary",
          bank_account: {
            routing_number: "123456789"
          }
        }
      },
      "ana_prompt_test",
      "claude-test"
    );

    expect(prompt).toContain('"query": "Explain Marketing Opex."');
    expect(prompt).not.toContain('"context"');
    expect(prompt).not.toContain("Acme Secret Co");
    expect(prompt).not.toContain("sk_live_should_not_leave_boundary");
    expect(prompt).not.toContain("123456789");
  });

  it("uses concrete schema-valid enum examples instead of copyable placeholder literals", () => {
    const prompt = buildUserPrompt(
      validRequest,
      "ana_prompt_test",
      "claude-test"
    );

    expect(prompt).toContain('"status": "needs_review"');
    expect(prompt).toContain('"priority": "high"');
    expect(prompt).toContain("choose exactly one of completed, needs_review, incomplete, failed");
    expect(prompt).not.toContain('"completed | needs_review | incomplete | failed"');
    expect(prompt).not.toContain('"low | medium | high"');
    expect(prompt).not.toContain('"warehouse_model | netsuite_suiteql | brex_transaction | ap_case | demo_context"');
  });

  it("does not instruct the live model to invent trusted deterministic citations", () => {
    const prompt = buildUserPrompt(validRequest, "ana_prompt_test", "claude-test");

    expect(prompt).toContain("this live adapter has no real NetSuite, Brex, AP, warehouse, or evidence-store retrieval");
    expect(prompt).toContain("Do not include citation records");
    expect(prompt).not.toContain('"source_type": "warehouse_model"');
    expect(prompt).not.toContain('"source_type": "demo_context"');
  });
});

describe("Anthropic provider error classification", () => {
  it("treats Anthropic client/config errors as non-retryable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", {
        status: 401,
        statusText: "Unauthorized"
      })
    );

    const analyzer = new AnthropicFinanceAnalyzer("bad-key");

    await expect(analyzer.analyze(validRequest)).rejects.toMatchObject({
      type: "provider_configuration_error",
      retryable: false,
      details: {
        provider: "anthropic",
        status: 401
      }
    });
    await expect(analyzer.analyze(validRequest)).rejects.toBeInstanceOf(ProviderConfigurationError);
  });

  it("keeps Anthropic rate limits retryable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Rate limited", {
        status: 429,
        statusText: "Too Many Requests"
      })
    );

    const analyzer = new AnthropicFinanceAnalyzer("test-key");

    await expect(analyzer.analyze(validRequest)).rejects.toMatchObject({
      type: "upstream_unavailable",
      retryable: true,
      details: {
        provider: "anthropic",
        status: 429
      }
    });
    await expect(analyzer.analyze(validRequest)).rejects.toBeInstanceOf(UpstreamLLMError);
  });
});

describe("Anthropic citation provenance", () => {
  it("strips live model citations and owns provider/session envelope fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                run_id: 123,
                analysis_type: "not_a_supported_analysis_type",
                status: "needs_review",
                summary: "Demo variance needs review.",
                drivers: [
                  {
                    rank: 1,
                    driver_type: "demo_variance_driver",
                    label: "Marketing Opex",
                    amount: 123.45,
                    currency: "USD",
                    explanation: "Model tried to cite trusted-looking warehouse evidence.",
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
                    priority: "high",
                    owner_role: "Controller",
                    text: "Review before sharing."
                  }
                ],
                confidence: {
                  overall: 0.7,
                  reasons: ["Demo context only."]
                },
                citations: [
                  {
                    source_type: "netsuite_suiteql",
                    source_record_id: "invented_suiteql_row"
                  }
                ],
                review_required: true,
                audit: "model-authored-invalid-audit"
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

    const result = await analyzer.analyze(validRequest, { runId: "ana_live_test" });

    expect(result.run_id).toBe("ana_live_test");
    expect(result.analysis_type).toBe("variance");
    expect(result.audit.model_name).toBe("claude-test");
    expect(result.audit.prompt_version).toBe("finance-close-command-centre-live-v1");
    expect(result.citations).toEqual([]);
    expect(result.drivers[0]?.citations).toEqual([]);
  });
});

describe("Anthropic request boundary", () => {
  it("does not forward arbitrary request context in the Anthropic API body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "needs_review",
                summary: "Demo variance needs review.",
                drivers: [],
                recommended_actions: [
                  {
                    action_type: "draft_commentary",
                    priority: "medium",
                    text: "Review demo output."
                  }
                ],
                confidence: {
                  overall: 0.6,
                  reasons: ["Demo context only."]
                },
                citations: [],
                review_required: true
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

    await analyzer.analyze(
      {
        ...validRequest,
        context: {
          customer_name: "Acme Secret Co",
          api_key: "sk_live_should_not_leave_boundary"
        }
      },
      { runId: "ana_context_boundary" }
    );

    const body = JSON.stringify(fetchSpy.mock.calls[0]?.[1]?.body);

    expect(body).toContain("Explain Marketing Opex.");
    expect(body).not.toContain('\\"context\\"');
    expect(body).not.toContain("Acme Secret Co");
    expect(body).not.toContain("sk_live_should_not_leave_boundary");
  });
});
