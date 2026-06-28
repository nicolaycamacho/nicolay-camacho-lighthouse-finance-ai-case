# LLM Adapter Layer

## Purpose

The adapter layer keeps provider selection outside the route implementation. `POST /analyze` depends on the `FinanceAnalyzer` interface, so the service can use a deterministic mock analyzer or an optional live provider without changing the route contract, Zod schemas, SSE behavior, retry behavior, timeout behavior, or error taxonomy.

## Default Mode

The default analyzer is `MockFinanceAnalyzer`. It is deterministic, local, and requires no API keys. This lets reviewers run the case study without secrets, vendor setup, or Lighthouse system access.

Use mock mode with:

```bash
LLM_PROVIDER=mock npm run dev
```

If `LLM_PROVIDER` is missing, the service also uses mock mode.

## Optional Live Provider Mode

`LLM_PROVIDER=anthropic` enables the optional Anthropic-backed analyzer. The adapter calls the Anthropic Messages API, asks for strict JSON, parses the raw response through `parseModelOutput`, and lets the route add service-owned validation metadata before returning the final response.

This mode is for interview or local demo use only. The repo does not have live NetSuite, Brex, warehouse, or Google Drive access, so the prompt frames the request as demo finance context and does not pretend to retrieve real accounting records. The adapter forwards only whitelisted request fields and omits arbitrary request `context` from the provider prompt.

Because live mode does not retrieve deterministic finance evidence, the adapter strips Anthropic-produced citations before returning analyzer output. That keeps `grounding_records_found` and `numeric_reconciliation_passed` from being inflated by model-invented evidence. They should remain ungrounded until a future service-owned retrieval layer supplies real deterministic evidence records.

## Local Secret Handling

Do not commit `.env` or real API keys. Use local environment variables only:

```bash
LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run dev
```

If `LLM_PROVIDER=anthropic` is set without `ANTHROPIC_API_KEY`, startup fails fast with a configuration error. Request-time provider/client rejections, such as invalid keys or rejected Anthropic requests, are returned as non-retryable `502 provider_configuration_error`.

Or:

```bash
cp .env.example .env
# edit .env locally
npm run dev
```

## How to Run with Mock

```bash
LLM_PROVIDER=mock npm run dev
```

Then call:

```bash
curl http://localhost:3000/health
```

## How to Run with Anthropic

```bash
LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run dev
```

Optional:

```bash
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

Do not claim live provider success unless you have tested with a real key in your local environment.

## Production Notes

A production adapter should pass `AbortSignal` into the provider client, translate known provider/network/rate-limit failures to `UpstreamLLMError`, preserve model-output failures as `ModelOutputError`, and avoid logging secrets or sensitive finance context.

Provider-native schema controls are helpful, but application-side Zod validation remains mandatory. The route validates final responses, owns validation metadata, applies client citation preferences, and keeps the final SSE `result` as the only canonical streamed output.

Provider HTTP errors are classified before they leave the adapter. Network failures, rate limits, and 5xx provider responses are retryable upstream errors. Provider/client configuration failures such as 400, 401, and 403 responses are non-retryable so invalid keys or bad requests do not masquerade as transient outages.

## Finance Trust Boundary

The analyzer may:

- explain validated finance records;
- draft variance commentary;
- summarize close readiness;
- prioritize AP/Brex exceptions;
- suggest review-gated next actions.

The analyzer must not:

- book journal entries;
- approve expenses;
- send external messages;
- close cases;
- replace deterministic finance calculations.
