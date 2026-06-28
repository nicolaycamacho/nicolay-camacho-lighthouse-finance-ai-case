# Demo Script

## 1. Start Service

```bash
npm install
npm run dev
```

## 2. Health Check

```bash
curl http://localhost:3000/health
```

Expected:

```json
{
  "status": "ok",
  "service": "lighthouse-finance-ai-case"
}
```

## 3. Standard `/analyze` Call

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

## 4. Inspect Structured JSON

Point out:

- `drivers` are ranked.
- `recommended_actions` are drafts.
- `citations` point to source-record identifiers.
- `validation.numeric_reconciliation_passed` is explicit.
- `review_required` is `true`.

## 5. Streaming `/analyze?stream=true`

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

## 6. Explain the Streaming Design

The stream sends progress and narrative events first, then one final schema-valid `result` event. This avoids treating partial model tokens as canonical finance output.

## 7. Explain Failure Handling

Invalid input returns `400 validation_error`. Timeouts return `408 timeout`. Schema-invalid model output maps to `502 model_output_invalid`. Adapter-translated provider failures map to `503 upstream_unavailable`.

## 8. Explain Production Path

Production would add SuiteQL, Brex, warehouse metrics, auth/RBAC, queueing, audit logs, tracing, model evals, cost controls, and a human review workflow.

## 9. Likely Interview Questions

**Why start here?** Close work is recurring, painful, and has clear deterministic data plus human review points.

**Why not let the LLM calculate the numbers?** Finance truth should come from reconciled systems. The LLM should explain and draft.

**How do you reduce hallucination risk?** Deterministic metrics, evidence links, Zod validation, reconciliation checks, silent pilots, and human approval.

**Why mock the LLM?** The assignment should run locally without secrets. The analyzer interface shows where a provider-backed implementation would go.
