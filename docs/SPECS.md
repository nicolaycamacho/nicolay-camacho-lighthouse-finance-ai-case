# Technical Specification

## Endpoints

### `GET /health`

Returns service health:

```json
{
  "status": "ok",
  "service": "lighthouse-finance-ai-case"
}
```

### `POST /analyze`

Accepts a JSON finance analysis request and returns a schema-valid analysis result.

### `POST /analyze?stream=true`

Returns a Server-Sent Events stream with progress events and one final schema-valid result.

## Request Schema

```ts
{
  query: string;
  analysis_type: "variance" | "expense_exception" | "close_summary";
  entity_id?: string;
  period?: string;
  account_ids?: string[];
  case_ids?: string[];
  materiality_threshold?: number;
  include_citations?: boolean;
  requested_actions?: string[];
  context?: Record<string, unknown>;
}
```

## Response Schema

```ts
{
  run_id: string;
  analysis_type: "variance" | "expense_exception" | "close_summary";
  status: "completed" | "needs_review" | "incomplete" | "failed";
  summary: string;
  drivers: Array<{
    rank: number;
    driver_type: string;
    label: string;
    amount?: number;
    currency?: string;
    explanation: string;
    citations?: Array<{
      source_type: string;
      source_record_id: string;
    }>;
  }>;
  recommended_actions: Array<{
    action_type: string;
    priority: "low" | "medium" | "high";
    owner_role?: string;
    text: string;
  }>;
  confidence: {
    overall: number;
    reasons: string[];
  };
  citations: Array<{
    source_type: string;
    source_record_id: string;
  }>;
  validation: {
    schema_valid: boolean;
    grounding_records_found: number;
    numeric_reconciliation_passed: boolean;
  };
  review_required: boolean;
  audit: {
    generated_at: string;
    model_name: string;
    prompt_version: string;
  };
}
```

## Analysis Types

- `variance`: material movement explanation and commentary drafting.
- `expense_exception`: AP/Brex blocker triage and next-action drafting.
- `close_summary`: close health summary by entity and period.

## SSE Contract

Allowed event types:

- `ack`
- `status`
- `narrative_delta`
- `result`
- `done`
- `error`

Example:

```text
event: ack
data: {"run_id":"ana_..."}

event: status
data: {"message":"validating request"}

event: result
data: {...}

event: done
data: {"ok":true}
```

## Error Taxonomy

```json
{
  "error": {
    "type": "validation_error",
    "message": "Invalid analyze request",
    "retryable": false,
    "details": {}
  }
}
```

Mappings:

- invalid request -> `400 validation_error`;
- timeout -> `408 timeout`;
- malformed model output -> `502 model_output_invalid`;
- transient provider/runtime failure -> `503 upstream_unavailable`;
- unexpected failure -> `500 internal_error`.

## Validation Rules

- `query` is required and non-empty.
- `analysis_type` must be one of the supported enum values.
- `period`, if present, must use `YYYY-MM`.
- `materiality_threshold`, if present, must be non-negative.
- Unknown top-level request fields are rejected.
- Successful responses are validated with Zod before return.
- `include_citations: false` suppresses returned citation arrays, but `validation.grounding_records_found` can still report the internally retrieved evidence count.

## Non-Goals

- Frontend.
- Database.
- Real NetSuite, Brex, Anthropic, or Gemini integration by default.
- Autonomous approval or execution.
- External communication without human approval.

## Sample Request

```json
{
  "query": "Explain the material movement in Marketing Opex.",
  "analysis_type": "variance",
  "entity_id": "uk_01",
  "period": "2026-05",
  "materiality_threshold": 25000,
  "include_citations": true
}
```

## Sample Response

```json
{
  "run_id": "ana_example",
  "analysis_type": "variance",
  "status": "needs_review",
  "summary": "Marketing Opex for uk_01 in 2026-05 is above threshold and needs review.",
  "drivers": [],
  "recommended_actions": [],
  "confidence": {
    "overall": 0.82,
    "reasons": ["Variance amount reconciles to deterministic warehouse records."]
  },
  "citations": [],
  "validation": {
    "schema_valid": true,
    "grounding_records_found": 0,
    "numeric_reconciliation_passed": true
  },
  "review_required": true,
  "audit": {
    "generated_at": "2026-06-28T00:00:00.000Z",
    "model_name": "mock-finance-analyzer",
    "prompt_version": "finance-close-command-centre-v1"
  }
}
```
