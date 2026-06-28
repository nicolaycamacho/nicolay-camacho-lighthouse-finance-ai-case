import { Router, type Response } from "express";

import { parseAnalysisTimeoutMs } from "../config";
import { ModelOutputError, ValidationError, formatZodIssues, toErrorResponse, toHttpError } from "../errors";
import type { FinanceAnalyzer, FinanceAnalyzerOutput } from "../llm/FinanceAnalyzer";
import { MockFinanceAnalyzer, createRunId } from "../llm/MockFinanceAnalyzer";
import { parseModelOutput } from "../llm/parseModelOutput";
import { retry } from "../lib/retry";
import { setSseHeaders, writeSseEvent } from "../lib/sse";
import { withTimeout } from "../lib/timeout";
import { analyzeRequestSchema, analyzeResponseSchema, type AnalyzeRequest } from "../schemas/analyze";

const defaultAnalyzer = new MockFinanceAnalyzer();

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
        const rawResult = await withTimeout(
          analyzer.analyze(request, { runId, signal: abortController.signal }),
          timeoutMs,
          "Analyze request exceeded the configured timeout",
          { abortController }
        );

        return normalizeAnalyzerOutput(rawResult);
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
    return "Found material movement above the configured threshold; preparing evidence-linked commentary.";
  }

  if (request.analysis_type === "expense_exception") {
    return "Found close blockers in the exception queue; drafting human-review next actions.";
  }

  return "Summarizing close readiness across deterministic variance and blocker signals.";
}

function normalizeAnalyzerOutput(output: FinanceAnalyzerOutput) {
  if (typeof output === "string") {
    return parseModelOutput(output);
  }

  const parsedResult = analyzeResponseSchema.safeParse(output);
  if (!parsedResult.success) {
    throw new ModelOutputError("Analyzer returned schema-invalid output", {
      issues: formatZodIssues(parsedResult.error.issues)
    });
  }

  return parsedResult.data;
}
