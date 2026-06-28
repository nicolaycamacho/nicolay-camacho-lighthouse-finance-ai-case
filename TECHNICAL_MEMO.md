# Technical Memo

## 1. Architecture

The project is a small TypeScript/Express service. `src/app.ts` wires routes and error handling. `src/routes/analyze.ts` validates requests, calls a `FinanceAnalyzer`, validates the final response, and returns JSON or SSE events. `src/schemas/analyze.ts` defines the Zod request and response schemas and is the API contract source of truth.

The current implementation uses `MockFinanceAnalyzer`, which returns deterministic finance-shaped responses for variance analysis, expense exception triage, and close summaries. This keeps the case study runnable without secrets or external systems.

## 2. LLM Choice

The local demo uses a mock analyzer. In production, I would use Anthropic or Gemini with structured output or tool-use capabilities, depending on the platform's operational constraints, latency, and enterprise controls.

Provider-native schema enforcement is useful but not sufficient. The application still needs Zod validation because finance workflows require clear contracts, testable failure modes, and protection against malformed or incomplete model output.

### Provider Selection

The service selects its analyzer through `LLM_PROVIDER`. Missing provider config or `LLM_PROVIDER=mock` uses the deterministic mock path so the submission is reproducible without secrets. `LLM_PROVIDER=anthropic` enables an optional live-demo adapter, with the API key read only from `ANTHROPIC_API_KEY`.

Both provider paths pass through application-side schema validation. The live adapter asks Anthropic for strict JSON, parses it with `parseModelOutput`, and the route still derives service-owned validation metadata before returning a response. It forwards only whitelisted request fields and omits arbitrary request `context` from the provider prompt. This keeps provider-native JSON controls as a convenience, not the final contract.

Because the optional live adapter has no real deterministic finance retrieval, it strips model-produced citations rather than pretending generated warehouse, ERP, or demo citations are proof. That keeps grounding counts and numeric reconciliation false unless the service has supplied actual trusted evidence records.

## 3. Structured Output Strategy

The response schema is explicit:

- run metadata;
- status;
- summary;
- ranked drivers;
- recommended actions;
- confidence reasons;
- citations;
- validation checks;
- review requirements;
- audit metadata.

`src/llm/parseModelOutput.ts` shows how raw provider JSON would be parsed and validated. Raw analyzer/model output omits service-owned `validation` metadata. If JSON parsing fails or raw output schema validation fails, the service raises a `ModelOutputError`, which maps to a `502` response after retry exhaustion.

The analyzer/model does not own the response `validation` metadata. After raw output is validated, the route adds `schema_valid`, derives `grounding_records_found` from service-owned citation records, and sets `numeric_reconciliation_passed` only when every amount-bearing driver has currency plus trusted deterministic evidence. The optional live adapter strips model-produced citations because it has no retrieval layer. No-amount summaries and ungrounded numeric claims default to `false`. Only after that does the route apply client-facing citation suppression.

## 4. Streaming + Structured Output Constraint

Streaming and structured output are in tension. A partially streamed JSON object is not a safe canonical finance answer because it may be incomplete, invalid, or revised by later tokens.

The safe design here is two-phase SSE:

1. Stream progress and narrative events.
2. Emit one final schema-valid `result` event.
3. Emit `done`.

The final `result` event is the only canonical output.

## 5. Error Handling

The service separates HTTP-layer and LLM/model-layer errors:

- invalid request -> `400 validation_error`;
- timeout -> `408 timeout`;
- malformed model output -> `502 model_output_invalid`;
- non-retryable provider/client configuration failure -> `502 provider_configuration_error`;
- adapter-translated transient provider/runtime failure -> `503 upstream_unavailable`;
- unexpected failure -> `500 internal_error`.

Analyzer calls receive an `AbortSignal`. The timeout wrapper aborts that signal before returning `408`, and the route also aborts it when the client disconnects before the response is complete. Real provider adapters should pass the signal into their HTTP, SDK, or query client so timed-out work can stop consuming sockets, latency, and provider budget.

Provider adapters should translate known transient SDK, network, rate-limit, and provider availability failures to `UpstreamLLMError`. Provider/client configuration failures, such as Anthropic 400, 401, or 403 responses, should become non-retryable `ProviderConfigurationError`. Unknown mapping or programmer bugs should remain plain errors, returning `500 internal_error` without retry.

All errors return:

```json
{
  "error": {
    "type": "string",
    "message": "string",
    "retryable": false,
    "details": {}
  }
}
```

## 6. Known Limitations

- No real NetSuite, Brex, warehouse, or Google Drive integration is included. Anthropic is optional live-demo mode and still uses demo finance context rather than live Lighthouse systems.
- No auth, RBAC, persistence, queues, rate limits, or human review UI.
- Citations are realistic identifiers, not live links.
- The mock analyzer uses deterministic examples rather than customer data.

## 7. Production-Scale Changes

A production version should add:

- auth and RBAC;
- NetSuite SuiteQL integration;
- Brex integration;
- warehouse-backed metrics;
- evidence indexing;
- queues for long-running analysis;
- tracing and structured logs;
- model evals and regression sets;
- cost controls and budgets;
- prompt/version registry;
- durable audit logs;
- human review workflow;
- rate limiting;
- PII and security controls.

## 8. Observability, Cost, Latency, and Security

Observability should track request IDs, model provider, prompt version, retry count, latency, token usage, validation failures, and reviewer outcomes. Cost controls should cap model spend per workspace and per close period. Latency-sensitive paths should use cached deterministic context and async queues for slower evidence retrieval.

Security should treat finance data as sensitive by default. Production integrations need least-privilege scopes, tenant isolation, encrypted secrets, audit logs, redaction, retention policies, and clear controls around external communication.

## 9. Why This Is Intentionally Small

This case study is designed to show the core engineering pattern without hiding it behind infrastructure. The important decisions are visible: deterministic facts first, LLM as advisory layer, Zod-enforced contracts, retry and timeout controls, finance-safe streaming, and human review for consequential actions.
