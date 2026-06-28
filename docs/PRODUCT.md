# Product Note — Close Command Centre

## What It Is

The Close Command Centre is a finance workspace that shows close health, material movements, and operational blockers in one place. It helps finance teams turn deterministic records into reviewable explanations and next actions.

## Who It Serves

- CFOs who need a concise daily view.
- Controllers who need evidence-backed variance commentary.
- AP leads who need to clear expense and receipt blockers.
- Close owners who need to coordinate reviews and sign-offs.
- Finance ops teams who need repeatable prioritization.

## The Daily Workflow

Each day during close, the system checks deterministic metrics and exception queues. It identifies material movements, unresolved blockers, and items missing owner review. The AI layer drafts explanations and next actions, then routes them to humans for review.

## CFO View

The CFO view should show:

- close readiness by entity;
- material variances;
- blocker count;
- owners needed;
- risks to close timing;
- commentary readiness.

It should avoid operational noise unless the issue changes close risk.

## Team-Level Views

Team views should be more detailed:

- Controllers see variance drivers, evidence, and commentary drafts.
- AP leads see missing receipts, policy flags, approvals, and follow-up drafts.
- Close owners see blockers by owner and due date.
- Finance ops sees queue priority and workflow status.

## What the LLM Does

- Drafts variance commentary.
- Summarizes evidence.
- Prioritizes blockers.
- Drafts next actions.
- Explains finance movements with source-record citations.

## What the LLM Does Not Do

- Calculate accounting truth.
- Book journal entries.
- Approve expenses.
- Send external messages.
- Close cases.
- Override finance controls.

## V1 Scope

- Material variance commentary.
- AP/Brex exception triage.
- Daily close summaries.
- Evidence-linked explanations.
- Human review before use.

## Later Scope

- Workflow assignment.
- Slack digest approvals.
- More integrations.
- Reviewer feedback loops.
- Model evaluations against historical close periods.
- More granular policy checks.
