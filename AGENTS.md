# AGENTS.md

## Purpose

This repository is a submission package for the Lighthouse Senior AI Solutions Engineer finance case study. It contains a written Part A memo, a small TypeScript backend, tests, and supporting technical/product docs.

## Core Product Thesis

The product is a Close Command Centre for Finance. Deterministic systems own accounting truth: NetSuite/SuiteQL, Brex, warehouse models, and evidence stores. The LLM explains, prioritizes, summarizes, and drafts. It does not calculate finance truth, book entries, send messages, approve work, or close cases.

## Primary Deliverables

- `PART_A_FINANCE_AI_USE_CASE.md` is the finance AI use-case memo.
- `src/routes/analyze.ts` exposes `POST /analyze` and `POST /analyze?stream=true`.
- `src/schemas/analyze.ts` is the request and response contract source of truth.
- `TECHNICAL_MEMO.md` explains design decisions, limitations, and production hardening.
- `docs/` contains product framing, architecture, endpoint specs, demo steps, sample requests, and sample outputs.

## Implementation Rules

- Preserve finance-grade trust boundaries.
- Keep the LLM advisory.
- Preserve Zod schemas as the source of truth.
- Keep the SSE final result canonical and schema-valid.
- Separate HTTP errors from LLM/model-layer errors.
- Prefer small, explicit modules over clever abstractions.

## Non-Goals

- Do not add a frontend.
- Do not add a database.
- Do not add auth.
- Do not add real NetSuite, Brex, warehouse, Drive, or Gemini integrations for this exercise.
- Optional live-demo LLM provider adapters may exist only when disabled by default, never required for local execution, and constrained to demo-safe request fields.
- Do not require API keys for local execution.

## Review Checklist

- `npm run build` passes.
- `npm test` passes.
- `/health` returns the expected service payload.
- `/analyze` validates input and returns schema-valid JSON.
- `/analyze?stream=true` sends progress events, one final result event, and `done`.
- README and docs explain setup, demo flow, limitations, and production path.
