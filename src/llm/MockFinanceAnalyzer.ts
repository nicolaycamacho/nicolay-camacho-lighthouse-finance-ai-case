import { randomUUID } from "node:crypto";

import type { AnalyzeRequest, AnalyzeResponse } from "../schemas/analyze";
import type { FinanceAnalyzer, FinanceAnalyzerOptions } from "./FinanceAnalyzer";

export function createRunId() {
  return `ana_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export class MockFinanceAnalyzer implements FinanceAnalyzer {
  async analyze(request: AnalyzeRequest, options?: FinanceAnalyzerOptions): Promise<AnalyzeResponse> {
    const runId = options?.runId ?? createRunId();
    const entity = request.entity_id ?? "selected_entity";
    const period = request.period ?? "latest_close_period";
    const threshold = request.materiality_threshold ?? 25000;
    const includeCitations = request.include_citations !== false;

    if (request.analysis_type === "variance") {
      return buildVarianceResponse(request, runId, entity, period, threshold, includeCitations);
    }

    if (request.analysis_type === "expense_exception") {
      return buildExpenseExceptionResponse(request, runId, entity, period, includeCitations);
    }

    return buildCloseSummaryResponse(request, runId, entity, period, includeCitations);
  }
}

function baseAudit() {
  return {
    generated_at: new Date().toISOString(),
    model_name: "mock-finance-analyzer",
    prompt_version: "finance-close-command-centre-v1"
  };
}

function buildValidation(citationCount: number) {
  return {
    schema_valid: true,
    grounding_records_found: citationCount,
    numeric_reconciliation_passed: true
  };
}

function maybeDriverCitations(
  includeCitations: boolean,
  citations: Array<{ source_type: string; source_record_id: string }>
) {
  return includeCitations ? citations : undefined;
}

function maybeTopLevelCitations(
  includeCitations: boolean,
  citations: Array<{ source_type: string; source_record_id: string }>
) {
  return includeCitations ? citations : [];
}

function buildVarianceResponse(
  request: AnalyzeRequest,
  runId: string,
  entity: string,
  period: string,
  threshold: number,
  includeCitations: boolean
): AnalyzeResponse {
  const varianceCitation = { source_type: "warehouse_model", source_record_id: `variance_${entity}_${period}_marketing_opex` };
  const agencyCitation = { source_type: "netsuite_suiteql", source_record_id: `vendor_bill_${entity}_${period}_agency_1842` };
  const brexCitation = { source_type: "brex_transaction", source_record_id: `brex_${entity}_${period}_paid_social_771` };
  const citations = [
    varianceCitation,
    agencyCitation,
    brexCitation
  ];

  return {
    run_id: runId,
    analysis_type: request.analysis_type,
    status: "needs_review",
    summary: `Marketing Opex for ${entity} in ${period} is above the ${threshold.toLocaleString("en-US")} materiality threshold. The movement is mainly explained by paid social spend and a late agency invoice; finance should review the evidence before using the commentary in reporting.`,
    drivers: [
      {
        rank: 1,
        driver_type: "paid_social_spend",
        label: "Paid social campaign acceleration",
        amount: 42750,
        currency: "USD",
        explanation:
          "Spend increased as the UK demand generation campaign pulled two planned July tests into the May close period.",
        citations: maybeDriverCitations(includeCitations, [varianceCitation, brexCitation])
      },
      {
        rank: 2,
        driver_type: "agency_invoice",
        label: "Agency invoice timing",
        amount: 31800,
        currency: "USD",
        explanation:
          "A creative agency invoice was posted after the accrual review, creating a timing-driven variance that should be checked with the close owner.",
        citations: maybeDriverCitations(includeCitations, [agencyCitation])
      }
    ],
    recommended_actions: [
      {
        action_type: "draft_commentary",
        priority: "high",
        owner_role: "Controller",
        text:
          "Draft management-reporting commentary that attributes the Marketing Opex variance to campaign acceleration and agency invoice timing, with both source records attached."
      },
      {
        action_type: "owner_follow_up",
        priority: "medium",
        owner_role: "Marketing Finance Partner",
        text:
          "Confirm whether the paid social pull-forward was planned and whether any June accrual correction is needed."
      }
    ],
    confidence: {
      overall: 0.82,
      reasons: [
        "Variance amount reconciles to deterministic warehouse records.",
        "Supporting source records were found for the two largest drivers.",
        `Original request context: ${request.query.slice(0, 100)}`
      ]
    },
    citations: maybeTopLevelCitations(includeCitations, citations),
    validation: buildValidation(citations.length),
    review_required: true,
    audit: baseAudit()
  };
}

function buildExpenseExceptionResponse(
  request: AnalyzeRequest,
  runId: string,
  entity: string,
  period: string,
  includeCitations: boolean
): AnalyzeResponse {
  const brexCitation = { source_type: "brex_transaction", source_record_id: `brex_${entity}_${period}_receipt_missing_2104` };
  const apCaseCitation = { source_type: "ap_case", source_record_id: request.case_ids?.[0] ?? `ap_case_${entity}_${period}_448` };
  const policyCitation = { source_type: "policy_document", source_record_id: "travel_meals_policy_v3" };
  const citations = [
    brexCitation,
    apCaseCitation,
    policyCitation
  ];

  return {
    run_id: runId,
    analysis_type: request.analysis_type,
    status: "needs_review",
    summary: `The highest-priority ${entity} expense exceptions are missing receipts and unapproved Brex spend. The suggested actions are drafts only and should be approved by AP before employee follow-up.`,
    drivers: [
      {
        rank: 1,
        driver_type: "missing_receipt",
        label: "Missing receipt over policy threshold",
        amount: 1260,
        currency: "USD",
        explanation:
          "A card transaction is over the receipt threshold and has no attached receipt, which blocks AP review.",
        citations: maybeDriverCitations(includeCitations, [brexCitation, policyCitation])
      },
      {
        rank: 2,
        driver_type: "approval_blocker",
        label: "Manager approval outstanding",
        amount: 840,
        currency: "USD",
        explanation:
          "The expense case is waiting on manager approval and has not changed status since the prior close checkpoint.",
        citations: maybeDriverCitations(includeCitations, [apCaseCitation])
      }
    ],
    recommended_actions: [
      {
        action_type: "draft_employee_follow_up",
        priority: "high",
        owner_role: "AP Lead",
        text:
          "Draft a concise employee follow-up asking for the missing receipt and business purpose before the close cutoff."
      },
      {
        action_type: "case_prioritization",
        priority: "medium",
        owner_role: "Finance Ops",
        text:
          "Prioritize cases with policy flags and close-period impact before lower-value receipt reminders."
      }
    ],
    confidence: {
      overall: 0.79,
      reasons: [
        "Exception categories are deterministic policy flags.",
        "The recommendation affects workflow priority only and requires AP approval before outreach.",
        `Original request context: ${request.query.slice(0, 100)}`
      ]
    },
    citations: maybeTopLevelCitations(includeCitations, citations),
    validation: buildValidation(citations.length),
    review_required: true,
    audit: baseAudit()
  };
}

function buildCloseSummaryResponse(
  request: AnalyzeRequest,
  runId: string,
  entity: string,
  period: string,
  includeCitations: boolean
): AnalyzeResponse {
  const closeHealthCitation = { source_type: "warehouse_model", source_record_id: `close_health_${entity}_${period}` };
  const blockerCitation = { source_type: "ap_case_queue", source_record_id: `open_blockers_${entity}_${period}` };
  const trialBalanceCitation = { source_type: "netsuite_suiteql", source_record_id: `trial_balance_${entity}_${period}` };
  const citations = [
    closeHealthCitation,
    blockerCitation,
    trialBalanceCitation
  ];

  return {
    run_id: runId,
    analysis_type: request.analysis_type,
    status: "needs_review",
    summary: `${entity} close readiness for ${period} is mostly on track, with review needed on material variances and unresolved AP blockers before the CFO digest is finalized.`,
    drivers: [
      {
        rank: 1,
        driver_type: "material_variance_count",
        label: "Three material variances need owner sign-off",
        explanation:
          "Revenue, Marketing Opex, and contractor spend have movements above threshold and require finance-owner review.",
        citations: maybeDriverCitations(includeCitations, [closeHealthCitation, trialBalanceCitation])
      },
      {
        rank: 2,
        driver_type: "unresolved_blockers",
        label: "AP blockers remain open",
        explanation:
          "Open missing-receipt and approval cases may delay expense completeness checks.",
        citations: maybeDriverCitations(includeCitations, [blockerCitation])
      }
    ],
    recommended_actions: [
      {
        action_type: "review_priority",
        priority: "high",
        owner_role: "Close Owner",
        text:
          "Review the three material variances first because they affect CFO-level commentary."
      },
      {
        action_type: "slack_digest_draft",
        priority: "medium",
        owner_role: "Finance Ops",
        text:
          "Prepare a Slack digest summarizing close health, unresolved blockers, and the owner needed for each item."
      }
    ],
    confidence: {
      overall: 0.76,
      reasons: [
        "Close status is grounded in deterministic readiness and blocker counts.",
        "The output summarizes priorities rather than making accounting decisions.",
        `Original request context: ${request.query.slice(0, 100)}`
      ]
    },
    citations: maybeTopLevelCitations(includeCitations, citations),
    validation: buildValidation(citations.length),
    review_required: true,
    audit: baseAudit()
  };
}
