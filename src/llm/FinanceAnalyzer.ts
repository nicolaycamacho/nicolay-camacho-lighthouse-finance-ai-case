import type { AnalyzeModelOutput, FinanceAnalyzerRequest } from "../schemas/analyze";

export interface FinanceAnalyzerOptions {
  runId?: string;
  signal?: AbortSignal;
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
 * include_citations. They should return full evidence citations to the service.
 * The route owns client-facing citation suppression and service-derived
 * validation metadata.
 */
export interface FinanceAnalyzer {
  analyze(request: FinanceAnalyzerRequest, options?: FinanceAnalyzerOptions): Promise<FinanceAnalyzerOutput>;
}
