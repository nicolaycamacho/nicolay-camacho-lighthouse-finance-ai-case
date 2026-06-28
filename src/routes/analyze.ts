import { Router, type Request, type Response } from "express";

import { ModelOutputError, ValidationError, formatZodIssues, toErrorResponse, toHttpError } from "../errors";
import type { FinanceAnalyzer, FinanceAnalyzerOutput } from "../llm/FinanceAnalyzer";
import { MockFinanceAnalyzer, createRunId } from "../llm/MockFinanceAnalyzer";
import { parseModelOutput } from "../llm/parseModelOutput";
import { retry } from "../lib/retry";
import { setSseHeaders, writeSseEvent } from "../lib/sse";
import { withTimeout } from "../lib/timeout";
import { analyzeRequestSchema, analyzeResponseSchema, type AnalyzeRequest } from "../schemas/analyze";

const defaultAnalyzer = new MockFinanceAnalyzer();
export const DEFAULT_ANALYSIS_TIMEOUT_MS = 8000;

export const analyzeRouter = createAnalyzeRouter(defaultAnalyzer);

export function createAnalyzeRouter(analyzer: FinanceAnalyzer) {
  const router = Router();

  router.post("/", async (req, res, next) => {
    if (req.query.stream === "true") {
      await handleStreamingAnalyze(req, res, analyzer);
      return;
    }

    try {
      const request = parseAnalyzeRequest(req.body);
      const result = await runAnalyze(analyzer, request);
      res.json(result);
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

async function runAnalyze(analyzer: FinanceAnalyzer, request: AnalyzeRequest, runId?: string) {
  const timeoutMs = parseAnalysisTimeoutMs();

  return retry(
    async () => {
      const rawResult = await withTimeout(
        analyzer.analyze(request, { runId }),
        timeoutMs,
        "Analyze request exceeded the configured timeout"
      );

      return normalizeAnalyzerOutput(rawResult);
    },
    {
      maxAttempts: 2,
      baseDelayMs: 25,
      maxDelayMs: 100
    }
  );
}

export function parseAnalysisTimeoutMs(rawValue = process.env.ANALYSIS_TIMEOUT_MS) {
  if (rawValue === undefined) {
    return DEFAULT_ANALYSIS_TIMEOUT_MS;
  }

  const timeoutMs = Number(rawValue);
  return Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_ANALYSIS_TIMEOUT_MS;
}

async function handleStreamingAnalyze(req: Request, res: Response, analyzer: FinanceAnalyzer) {
  const runId = createRunId();
  setSseHeaders(res);
  writeSseEvent(res, "ack", { run_id: runId });

  try {
    writeSseEvent(res, "status", { message: "validating request" });
    const request = parseAnalyzeRequest(req.body);

    writeSseEvent(res, "status", { message: "retrieving deterministic finance context" });
    writeSseEvent(res, "narrative_delta", {
      text: narrativeFor(request)
    });

    const result = await runAnalyze(analyzer, request, runId);
    writeSseEvent(res, "result", result);
    writeSseEvent(res, "done", { ok: true });
    res.end();
  } catch (error) {
    const httpError = toHttpError(error);
    writeSseEvent(res, "error", toErrorResponse(httpError));
    res.end();
  }
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
