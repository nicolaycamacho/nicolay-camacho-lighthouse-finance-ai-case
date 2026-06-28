# Lighthouse Finance AI Case

## What This Is

This repository is a submission-ready package for the Lighthouse Senior AI Solutions Engineer finance case study. It includes a written finance AI use-case memo, a working TypeScript/Express backend, Vitest tests, a technical memo, and supporting product and architecture docs.

The backend is intentionally small: it exposes `GET /health`, `POST /analyze`, and `POST /analyze?stream=true`. The default analyzer is deterministic and local, so the project runs without API keys.

## Core Thesis

Build a Close Command Centre for Finance. Finance numbers come from deterministic systems such as NetSuite/SuiteQL, Brex, and warehouse models. The LLM explains, prioritizes, and drafts. It does not own accounting truth, book entries, send messages, or close cases without human review.

## Assignment Requirement Coverage

| Requirement | Where implemented |
|---|---|
| `POST /analyze` endpoint | `src/routes/analyze.ts` |
| Structured JSON response | `src/schemas/analyze.ts` |
| Schema enforcement | Zod validation before returning final result |
| `?stream=true` SSE support | `src/routes/analyze.ts`, `src/lib/sse.ts` |
| Transient LLM failure retry | `src/lib/retry.ts` |
| Request timeout handling | `src/lib/timeout.ts` |
| Malformed/incomplete JSON handling | `src/llm/parseModelOutput.ts` |
| HTTP-layer vs LLM-layer error separation | `src/errors.ts` |
| README setup instructions | `README.md` |
| Technical memo | `TECHNICAL_MEMO.md` |
| Part A use case | `PART_A_FINANCE_AI_USE_CASE.md` |

## Repository Structure

```text
.
├── README.md
├── AGENTS.md
├── PART_A_FINANCE_AI_USE_CASE.md
├── TECHNICAL_MEMO.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── src/
├── tests/
└── docs/
```

## Architecture Summary

The service accepts a finance analysis request, validates it with Zod, passes it to a `FinanceAnalyzer`, validates the final response with Zod, and returns structured JSON. The local analyzer is a deterministic mock that produces finance-shaped results for variance analysis, expense exceptions, and close summaries.

For streaming, the service does not stream partial JSON as the canonical answer. It streams progress and narrative events, then emits one final schema-valid `result` event followed by `done`.

## Setup

```bash
npm install
```

Optional:

```bash
cp .env.example .env
```

## Run

```bash
npm run dev
```

The service defaults to port `3000`.

## Test

```bash
npm test
```

Build/type-check:

```bash
npm run build
```

## Demo: Standard JSON Response

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explain the material movement in Marketing Opex for the UK entity in 2026-05 and suggest next actions.",
    "analysis_type": "variance",
    "entity_id": "uk_01",
    "period": "2026-05",
    "materiality_threshold": 25000,
    "include_citations": true,
    "requested_actions": ["draft_commentary", "suggest_next_steps"]
  }'
```

Representative response shape:

```json
{
  "run_id": "ana_...",
  "analysis_type": "variance",
  "status": "needs_review",
  "summary": "Marketing Opex for uk_01 in 2026-05 is above the 25,000 materiality threshold. The movement is mainly explained by paid social spend and a late agency invoice; finance should review the evidence before using the commentary in reporting.",
  "drivers": [
    {
      "rank": 1,
      "driver_type": "paid_social_spend",
      "label": "Paid social campaign acceleration",
      "amount": 42750,
      "currency": "USD",
      "explanation": "Spend increased as the UK demand generation campaign pulled two planned July tests into the May close period.",
      "citations": [
        { "source_type": "warehouse_model", "source_record_id": "variance_uk_01_2026-05_marketing_opex" },
        { "source_type": "brex_transaction", "source_record_id": "brex_uk_01_2026-05_paid_social_771" }
      ]
    },
    {
      "rank": 2,
      "driver_type": "agency_invoice",
      "label": "Agency invoice timing",
      "amount": 31800,
      "currency": "USD",
      "explanation": "A creative agency invoice was posted after the accrual review, creating a timing-driven variance that should be checked with the close owner.",
      "citations": [
        { "source_type": "netsuite_suiteql", "source_record_id": "vendor_bill_uk_01_2026-05_agency_1842" }
      ]
    }
  ],
  "recommended_actions": [
    {
      "action_type": "draft_commentary",
      "priority": "high",
      "owner_role": "Controller",
      "text": "Draft management-reporting commentary that attributes the Marketing Opex variance to campaign acceleration and agency invoice timing, with both source records attached."
    }
  ],
  "confidence": {
    "overall": 0.82,
    "reasons": ["Variance amount reconciles to deterministic warehouse records."]
  },
  "citations": [
    { "source_type": "warehouse_model", "source_record_id": "variance_uk_01_2026-05_marketing_opex" },
    { "source_type": "netsuite_suiteql", "source_record_id": "vendor_bill_uk_01_2026-05_agency_1842" },
    { "source_type": "brex_transaction", "source_record_id": "brex_uk_01_2026-05_paid_social_771" }
  ],
  "validation": {
    "schema_valid": true,
    "grounding_records_found": 3,
    "numeric_reconciliation_passed": true
  },
  "review_required": true,
  "audit": {
    "generated_at": "...",
    "model_name": "mock-finance-analyzer",
    "prompt_version": "finance-close-command-centre-v1"
  }
}
```

## Demo: SSE Streaming Response

```bash
curl -N -X POST "http://localhost:3000/analyze?stream=true" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Summarize close readiness for the UK entity.",
    "analysis_type": "close_summary",
    "entity_id": "uk_01",
    "period": "2026-05"
  }'
```

Expected event sequence:

```text
event: ack
event: status
event: status
event: narrative_delta
event: result
event: done
```

## Design Trade-offs

- The mock analyzer keeps the submission runnable without secrets or vendor setup.
- Zod validates both input and output so the API contract is enforceable in tests and runtime.
- The route owns response validation metadata; analyzers provide content and full evidence, not final schema/reconciliation truth.
- Retry and timeout wrappers exist at the route boundary, where provider-backed analyzers would be called.
- SSE is finance-safe: the final answer is one schema-valid object, not a stream of partially trusted JSON.

## Known Limitations

- The analyzer uses deterministic mock data instead of live NetSuite, Brex, warehouse, or LLM calls.
- There is no auth, RBAC, queueing, persistence, audit-log database, or human review UI.
- Citations are evidence-shaped identifiers, not real deep links.
- The service is designed for a case-study demo, not production traffic.

## Friday Demo Path

1. Run `npm install`.
2. Run `npm run build`.
3. Run `npm test`.
4. Start the service with `npm run dev`.
5. Check health with `curl http://localhost:3000/health`.
6. Demo standard `POST /analyze` for a material variance.
7. Demo `POST /analyze?stream=true` for close readiness.
8. Explain that deterministic systems own the numbers and the LLM only drafts reviewable finance narratives.
