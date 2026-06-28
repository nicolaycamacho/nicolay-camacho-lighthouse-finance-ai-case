import { Router, type Response } from "express";

import { parseAnalysisTimeoutMs } from "../config";
import { ModelOutputError, ValidationError, formatZodIssues, toErrorResponse, toHttpError } from "../errors";
import type { FinanceAnalyzer, FinanceAnalyzerOutput } from "../llm/FinanceAnalyzer";
import { MockFinanceAnalyzer, createRunId } from "../llm/MockFinanceAnalyzer";
import { parseModelOutput } from "../llm/parseModelOutput";
import { retry } from "../lib/retry";
import { setSseHeaders, writeSseEvent } from "../lib/sse";
import { withTimeout } from "../lib/timeout";
import {
  analyzeModelOutputSchema,
  analyzeRequestSchema,
  analyzeResponseSchema,
  type AnalyzeModelOutput,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type FinanceAnalyzerRequest
} from "../schemas/analyze";

const defaultAnalyzer = new MockFinanceAnalyzer();
const RECONCILIATION_SOURCE_TYPES = new Set(["warehouse_model", "netsuite_suiteql", "brex_transaction", "ap_case"]);

export const analyzeRouter = createAnalyzeRouter(defaultAnalyzer);

export function createAnalyzeRouter(analyzer: FinanceAnalyzer) {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const request = parseAnalyzeRequest(req.body);
      const clientAbort = createResponseAbortSignal(res);

      try {
        if (req.query.stream === "true") {
          await handleStreamingAnalyze(res, analyzer, request, clientAbort.signal);
          return;
        }

        const result = await runAnalyze(analyzer, request, undefined, clientAbort.signal);
        res.json(result);
      } finally {
        clientAbort.cleanup();
      }
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseAnalyzeRequest(body: unknown): AnalyzeRequest {
  const result = analyzeRequestSchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError("Invalid analyze request", {
      issues: formatZodIssues(result.error.issues)
    });
  }

  return result.data;
}

async function runAnalyze(analyzer: FinanceAnalyzer, request: AnalyzeRequest, runId?: string, clientSignal?: AbortSignal) {
  const timeoutMs = parseAnalysisTimeoutMs();
  const abortController = createAnalyzerAbortController(clientSignal);

  try {
    return await retry(
      async () => {
        const analyzerRequest = toFinanceAnalyzerRequest(request);
        const rawResult = await withTimeout(
          analyzer.analyze(analyzerRequest, { runId, signal: abortController.signal }),
          timeoutMs,
          "Analyze request exceeded the configured timeout",
          { abortController }
        );

        return normalizeAnalyzerOutput(rawResult, request);
      },
      {
        maxAttempts: 2,
        baseDelayMs: 25,
        maxDelayMs: 100
      }
    );
  } finally {
    abortController.cleanup();
  }
}

async function handleStreamingAnalyze(
  res: Response,
  analyzer: FinanceAnalyzer,
  request: AnalyzeRequest,
  clientSignal?: AbortSignal
) {
  const runId = createRunId();
  setSseHeaders(res);
  writeSseEvent(res, "ack", { run_id: runId });

  try {
    writeSseEvent(res, "status", { message: "request validated" });
    writeSseEvent(res, "status", { message: "retrieving deterministic finance context" });
    writeSseEvent(res, "narrative_delta", {
      text: narrativeFor(request)
    });

    const result = await runAnalyze(analyzer, request, runId, clientSignal);
    writeSseEvent(res, "result", result);
    writeSseEvent(res, "done", { ok: true });
    res.end();
  } catch (error) {
    const httpError = toHttpError(error);
    writeSseEvent(res, "error", toErrorResponse(httpError));
    res.end();
  }
}

function createResponseAbortSignal(res: Response) {
  const controller = new AbortController();
  const abortIfResponseClosesEarly = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };

  res.once("close", abortIfResponseClosesEarly);

  return {
    signal: controller.signal,
    cleanup: () => {
      res.off("close", abortIfResponseClosesEarly);
    }
  };
}

function createAnalyzerAbortController(clientSignal?: AbortSignal) {
  const controller = new AbortController();

  if (!clientSignal) {
    return {
      signal: controller.signal,
      abort: (reason?: unknown) => controller.abort(reason),
      cleanup: () => undefined
    };
  }

  const abortFromClient = () => {
    controller.abort(clientSignal.reason);
  };

  if (clientSignal.aborted) {
    abortFromClient();
  } else {
    clientSignal.addEventListener("abort", abortFromClient, { once: true });
  }

  return {
    signal: controller.signal,
    abort: (reason?: unknown) => controller.abort(reason),
    cleanup: () => {
      clientSignal.removeEventListener("abort", abortFromClient);
    }
  };
}

function narrativeFor(request: AnalyzeRequest) {
  if (request.analysis_type === "variance") {
    return "Preparing evidence-linked variance commentary after deterministic checks complete.";
  }

  if (request.analysis_type === "expense_exception") {
    return "Preparing exception triage and human-review next actions after deterministic checks complete.";
  }

  return "Preparing close readiness summary from deterministic variance and blocker signals.";
}

function toFinanceAnalyzerRequest(request: AnalyzeRequest): FinanceAnalyzerRequest {
  const { include_citations: _includeCitations, ...analyzerRequest } = request;
  return analyzerRequest;
}

function normalizeAnalyzerOutput(output: FinanceAnalyzerOutput, request: AnalyzeRequest) {
  const analyzerResult = typeof output === "string" ? parseModelOutput(output) : output;
  const parsedResult = analyzeModelOutputSchema.safeParse(analyzerResult);
  if (!parsedResult.success) {
    throw new ModelOutputError("Analyzer returned schema-invalid output", {
      issues: formatZodIssues(parsedResult.error.issues)
    });
  }

  const resultWithServiceValidation = applyServiceValidation(parsedResult.data);
  const finalResult = applyCitationPreference(resultWithServiceValidation, request);
  const parsedFinalResult = analyzeResponseSchema.safeParse(finalResult);

  if (!parsedFinalResult.success) {
    throw new ModelOutputError("Service failed to construct a schema-valid response", {
      issues: formatZodIssues(parsedFinalResult.error.issues)
    });
  }

  return parsedFinalResult.data;
}

function applyServiceValidation(result: AnalyzeModelOutput): AnalyzeResponse {
  const groundingRecordsFound = countUniqueCitations(result);
  const numericReconciliationPassed = hasDeterministicNumericReconciliation(result);

  return {
    ...result,
    validation: {
      schema_valid: true,
      grounding_records_found: groundingRecordsFound,
      numeric_reconciliation_passed: numericReconciliationPassed
    }
  };
}

function applyCitationPreference(result: AnalyzeResponse, request: AnalyzeRequest): AnalyzeResponse {
  if (request.include_citations !== false) {
    return result;
  }

  return {
    ...result,
    drivers: result.drivers.map((driver) => {
      const { citations: _citations, ...driverWithoutCitations } = driver;
      return driverWithoutCitations;
    }),
    citations: []
  };
}

function countUniqueCitations(result: AnalyzeModelOutput) {
  const citationKeys = new Set<string>();

  for (const citation of result.citations) {
    citationKeys.add(`${citation.source_type}:${citation.source_record_id}`);
  }

  for (const driver of result.drivers) {
    for (const citation of driver.citations ?? []) {
      citationKeys.add(`${citation.source_type}:${citation.source_record_id}`);
    }
  }

  return citationKeys.size;
}

function hasDeterministicNumericReconciliation(result: AnalyzeModelOutput) {
  const amountDrivers = result.drivers.filter((driver) => driver.amount !== undefined);

  if (amountDrivers.length === 0) {
    return false;
  }

  return amountDrivers.every((driver) => {
    if (driver.amount === undefined || !Number.isFinite(driver.amount) || driver.currency === undefined) {
      return false;
    }

    return (driver.citations ?? []).some((citation) => RECONCILIATION_SOURCE_TYPES.has(citation.source_type));
  });
}
