# Sample Requests

## 1. Variance Request

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explain the material movement in Marketing Opex for the UK entity in 2026-05 and suggest next actions.",
    "analysis_type": "variance",
    "entity_id": "uk_01",
    "period": "2026-05",
    "account_ids": ["6100", "6110"],
    "materiality_threshold": 25000,
    "include_citations": true,
    "requested_actions": ["draft_commentary", "suggest_next_steps"]
  }'
```

## 2. Expense Exception Request

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Prioritize open Brex and AP expense blockers before close cutoff.",
    "analysis_type": "expense_exception",
    "entity_id": "uk_01",
    "period": "2026-05",
    "case_ids": ["ap_case_448", "ap_case_449"],
    "include_citations": true,
    "requested_actions": ["draft_employee_follow_up", "prioritize_cases"]
  }'
```

## 3. Close Summary Request

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Summarize close readiness for the UK entity.",
    "analysis_type": "close_summary",
    "entity_id": "uk_01",
    "period": "2026-05"
  }'
```

## 4. Streaming Curl Request

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

## 5. Invalid Request Example

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "",
    "analysis_type": "forecast"
  }'
```
