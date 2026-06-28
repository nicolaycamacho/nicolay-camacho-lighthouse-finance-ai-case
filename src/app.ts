import express, { type ErrorRequestHandler } from "express";

import { toErrorResponse, toHttpError } from "./errors";
import { analyzeRouter } from "./routes/analyze";
import { healthRouter } from "./routes/health";

export const app = express();

app.use(express.json({ limit: "1mb" }));

app.use("/health", healthRouter);
app.use("/analyze", analyzeRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const httpError = toHttpError(error);
  res.status(httpError.statusCode).json(toErrorResponse(httpError));
};

app.use(errorHandler);
