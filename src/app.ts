import express, { type ErrorRequestHandler } from "express";

import { toErrorResponse, toHttpError } from "./errors";
import type { FinanceAnalyzer } from "./llm/FinanceAnalyzer";
import { MockFinanceAnalyzer } from "./llm/MockFinanceAnalyzer";
import { createAnalyzeRouter } from "./routes/analyze";
import { healthRouter } from "./routes/health";

export function createApp(analyzer: FinanceAnalyzer = new MockFinanceAnalyzer()) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter);
  app.use("/analyze", createAnalyzeRouter(analyzer));

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const httpError = toHttpError(error);
    res.status(httpError.statusCode).json(toErrorResponse(httpError));
  };

  app.use(errorHandler);

  return app;
}

export const app = createApp();
