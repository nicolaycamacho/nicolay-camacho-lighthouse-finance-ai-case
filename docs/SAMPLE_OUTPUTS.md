# Sample Outputs

## 1. Variance

```json
{
  "run_id": "ana_variance_example",
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
        {
          "source_type": "warehouse_model",
          "source_record_id": "variance_uk_01_2026-05_marketing_opex"
        },
        {
          "source_type": "brex_transaction",
          "source_record_id": "brex_uk_01_2026-05_paid_social_771"
        }
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
    {
      "source_type": "warehouse_model",
      "source_record_id": "variance_uk_01_2026-05_marketing_opex"
    },
    {
      "source_type": "netsuite_suiteql",
      "source_record_id": "vendor_bill_uk_01_2026-05_agency_1842"
    },
    {
      "source_type": "brex_transaction",
      "source_record_id": "brex_uk_01_2026-05_paid_social_771"
    }
  ],
  "validation": {
    "schema_valid": true,
    "grounding_records_found": 3,
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

## 2. Expense Exception

```json
{
  "run_id": "ana_expense_example",
  "analysis_type": "expense_exception",
  "status": "needs_review",
  "summary": "The highest-priority uk_01 expense exceptions are missing receipts and unapproved Brex spend. The suggested actions are drafts only and should be approved by AP before employee follow-up.",
  "drivers": [
    {
      "rank": 1,
      "driver_type": "missing_receipt",
      "label": "Missing receipt over policy threshold",
      "amount": 1260,
      "currency": "USD",
      "explanation": "A card transaction is over the receipt threshold and has no attached receipt, which blocks AP review.",
      "citations": [
        {
          "source_type": "brex_transaction",
          "source_record_id": "brex_uk_01_2026-05_receipt_missing_2104"
        },
        {
          "source_type": "policy_document",
          "source_record_id": "travel_meals_policy_v3"
        }
      ]
    }
  ],
  "recommended_actions": [
    {
      "action_type": "draft_employee_follow_up",
      "priority": "high",
      "owner_role": "AP Lead",
      "text": "Draft a concise employee follow-up asking for the missing receipt and business purpose before the close cutoff."
    }
  ],
  "confidence": {
    "overall": 0.79,
    "reasons": ["Exception categories are deterministic policy flags."]
  },
  "citations": [
    {
      "source_type": "brex_transaction",
      "source_record_id": "brex_uk_01_2026-05_receipt_missing_2104"
    },
    {
      "source_type": "ap_case",
      "source_record_id": "ap_case_448"
    },
    {
      "source_type": "policy_document",
      "source_record_id": "travel_meals_policy_v3"
    }
  ],
  "validation": {
    "schema_valid": true,
    "grounding_records_found": 3,
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

## 3. Close Summary

```json
{
  "run_id": "ana_close_example",
  "analysis_type": "close_summary",
  "status": "needs_review",
  "summary": "uk_01 close readiness for 2026-05 is mostly on track, with review needed on material variances and unresolved AP blockers before the CFO digest is finalized.",
  "drivers": [
    {
      "rank": 1,
      "driver_type": "material_variance_count",
      "label": "Three material variances need owner sign-off",
      "explanation": "Revenue, Marketing Opex, and contractor spend have movements above threshold and require finance-owner review.",
      "citations": [
        {
          "source_type": "warehouse_model",
          "source_record_id": "close_health_uk_01_2026-05"
        },
        {
          "source_type": "netsuite_suiteql",
          "source_record_id": "trial_balance_uk_01_2026-05"
        }
      ]
    }
  ],
  "recommended_actions": [
    {
      "action_type": "review_priority",
      "priority": "high",
      "owner_role": "Close Owner",
      "text": "Review the three material variances first because they affect CFO-level commentary."
    }
  ],
  "confidence": {
    "overall": 0.76,
    "reasons": ["Close status is grounded in deterministic readiness and blocker counts."]
  },
  "citations": [
    {
      "source_type": "warehouse_model",
      "source_record_id": "close_health_uk_01_2026-05"
    },
    {
      "source_type": "ap_case_queue",
      "source_record_id": "open_blockers_uk_01_2026-05"
    },
    {
      "source_type": "netsuite_suiteql",
      "source_record_id": "trial_balance_uk_01_2026-05"
    }
  ],
  "validation": {
    "schema_valid": true,
    "grounding_records_found": 3,
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

## 4. Structured Error

```json
{
  "error": {
    "type": "validation_error",
    "message": "Invalid analyze request",
    "retryable": false,
    "details": {
      "issues": [
        {
          "path": "query",
          "message": "query is required",
          "code": "too_small"
        }
      ]
    }
  }
}
```
