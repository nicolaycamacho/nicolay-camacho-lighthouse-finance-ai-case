import type { AnalyzeRequest, AnalyzeResponse } from "../schemas/analyze";

export interface FinanceAnalyzerOptions {
  runId?: string;
  signal?: AbortSignal;
}

export type FinanceAnalyzerOutput = AnalyzeResponse | string;

/**
 * Provider-backed adapters own provider error normalization. Known transient
 * SDK, network, rate-limit, and provider availability failures should be
 * translated to UpstreamLLMError before they leave the adapter. Unexpected
 * adapter/programmer bugs should throw normally so they remain 500s and are
 * not retried as provider outages.
 */
export interface FinanceAnalyzer {
  analyze(request: AnalyzeRequest, options?: FinanceAnalyzerOptions): Promise<FinanceAnalyzerOutput>;
}
