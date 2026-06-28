# Part A — Finance AI Use Case

## 1. Executive Recommendation

I would start with a Close Command Centre for Finance: a daily workspace that helps the CFO, Controller, AP lead, and close owner understand what changed, what is blocked, and what needs human review before close reporting is finalized.

The product should not try to make the LLM the accounting system. NetSuite, Brex, warehouse models, and reconciled reporting tables should remain the source of finance truth. The AI layer should explain, prioritize, summarize, and draft. That is where it can create leverage without weakening controls.

## 2. Where I Would Start

I would start with a two-lane v1:

1. Material variance commentary.
2. AP/Brex exception triage.

These are good first wedges because they happen repeatedly, matter to the close, and are painful in a way AI can help. Finance teams spend time turning deterministic facts into clear commentary and chasing the blockers that prevent completeness. The LLM can reduce the writing, summarization, and prioritization burden while the underlying metrics stay deterministic.

## 3. Who I Would Talk To and How

I would begin with a short discovery loop across finance and data stakeholders:

- CFO: what belongs in the daily executive view, what creates confidence, and what would be unacceptable risk.
- Controller: close calendar, materiality thresholds, required evidence, and sign-off controls.
- AP lead: exception types, receipt blockers, policy flags, and escalation paths.
- Close owner: daily operating rhythm, handoffs, and where Slack or manual trackers create drift.
- Finance ops: repetitive work, message drafting needs, and case prioritization.
- Data/platform owner: where deterministic metrics live, how source records are linked, and how freshness is monitored.

The goal is to map the workflow before designing the model prompts. I would want to see real close meetings, AP queues, variance decks, Slack follow-ups, and the tables behind them.

## 4. Daily Finance Monitor

The daily monitor should give the CFO a concise view of close health:

- entities at risk;
- material variance count;
- unresolved blockers;
- owners needed;
- commentary readiness;
- items waiting on human approval.

Team-level views should be more operational. The Controller needs variance evidence and sign-off status. AP needs exception queues and draft follow-ups. Finance ops needs prioritization and next actions. The same underlying facts can support different views, but the CFO view should stay summary-oriented and decision-focused.

## 5. Agent Layer Design

Data should flow from deterministic systems into an AI-assisted review layer:

- NetSuite/SuiteQL provides journal, bill, trial balance, vendor, and account-level source records.
- Brex provides card transactions, receipt state, policy flags, and approval status.
- Google Drive provides evidence such as invoices, contracts, variance support, and policy docs.
- BigQuery or the warehouse provides reconciled close metrics, variance models, and materiality checks.
- Slack is an output and coordination surface, not a source of accounting truth.

The LLM adds value by:

- drafting finance commentary;
- summarizing evidence;
- prioritizing close blockers;
- drafting next actions;
- explaining drivers with evidence links.

The LLM does not belong in:

- calculating finance truth;
- booking entries;
- sending external messages;
- making final approvals;
- closing cases.

The agent layer should retrieve deterministic facts, assemble evidence, ask the model to produce a structured explanation, validate the output, and present it for human review.

## 6. Biggest Concern and Early De-risking

The biggest concern is a confident wrong finance narrative or wrong action recommendation. In finance, a polished explanation can be more dangerous than an obvious failure if it causes someone to trust the wrong story.

I would de-risk that with:

- read-only v1;
- deterministic metrics;
- evidence links on every important claim;
- reconciliation checks;
- human review before use;
- silent pilot against prior close periods;
- audit trail for prompts, outputs, source records, and reviewer actions.

## 7. V1 / V2 Scope

V1 should stay narrow:

- material variance commentary;
- AP/Brex exception triage;
- daily close summary;
- human review;
- structured output;
- evidence links;
- audit trail.

V2 can add workflow depth after trust is earned:

- owner assignment;
- Slack digest approvals;
- deeper policy reasoning;
- forecast impact summaries;
- model evals on prior close cycles;
- workflow integrations with approval gates.

I would not start with autonomous close execution. The first win is faster, clearer, better-grounded finance review.

## 8. Success Metrics

I would measure success with both productivity and trust metrics:

- reduction in time to draft variance commentary;
- reduction in unresolved AP blockers at close cutoff;
- percentage of AI-drafted commentary accepted after review;
- citation coverage for material claims;
- reviewer correction rate;
- false-positive and false-negative blocker rates;
- time from variance detection to owner follow-up;
- CFO and Controller confidence in the daily summary.

The target is not "AI wrote something." The target is that finance gets to a trusted, reviewable close narrative faster.
