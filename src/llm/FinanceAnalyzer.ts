import type { AnalyzeModelOutput, FinanceAnalyzerRequest } from "../schemas/analyze";

export type TrustedEvidenceCitation = AnalyzeModelOutput["citations"][number];

export interface FinanceAnalyzerOptions {
  runId?: string;
  signal?: AbortSignal;
}

export interface TrustedEvidenceFinanceAnalyzerOptions extends FinanceAnalyzerOptions {
  recordTrustedEvidence?: (citations: TrustedEvidenceCitation[]) => void;
}

export type FinanceAnalyzerOutput = AnalyzeModelOutput | string;

/**
 * Provider-backed adapters own provider error normalization. Known transient
 * SDK, network, rate-limit, and provider availability failures should be
 * translated to UpstreamLLMError before they leave the adapter. Unexpected
 * adapter/programmer bugs should throw normally so they remain 500s and are
 * not retried as provider outages.
 *
 * Adapters receive an internal request without presentation-only fields such as
 * include_citations. Returned citations are explanatory client-facing content,
 * not proof for service-owned validation metadata.
 */
export interface FinanceAnalyzer {
  analyze(request: FinanceAnalyzerRequest, options?: FinanceAnalyzerOptions): Promise<FinanceAnalyzerOutput>;
}

/**
 * Deterministic or retrieval-backed analyzers may opt into trusted evidence
 * recording. The route only derives grounding and numeric reconciliation from
 * this capability, and live/demo provider adapters without a service-owned
 * retrieval layer should implement FinanceAnalyzer only.
 */
export interface TrustedEvidenceFinanceAnalyzer {
  readonly providesTrustedEvidence: true;
  analyze(request: FinanceAnalyzerRequest, options?: TrustedEvidenceFinanceAnalyzerOptions): Promise<FinanceAnalyzerOutput>;
}

export function providesTrustedEvidence(analyzer: FinanceAnalyzer): analyzer is FinanceAnalyzer & TrustedEvidenceFinanceAnalyzer {
  return (analyzer as { providesTrustedEvidence?: unknown }).providesTrustedEvidence === true;
}
