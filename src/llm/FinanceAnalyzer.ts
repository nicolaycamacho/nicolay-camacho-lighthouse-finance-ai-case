import type { AnalyzeRequest, AnalyzeResponse } from "../schemas/analyze";

export interface FinanceAnalyzerOptions {
  runId?: string;
  signal?: AbortSignal;
}

export type FinanceAnalyzerOutput = AnalyzeResponse | string;

export interface FinanceAnalyzer {
  analyze(request: AnalyzeRequest, options?: FinanceAnalyzerOptions): Promise<FinanceAnalyzerOutput>;
}
