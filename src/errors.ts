import { ZodError, type ZodIssue } from "zod";

type ErrorLayer = "http" | "llm" | "runtime";

export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  readonly type: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details: ErrorDetails;
  readonly layer: ErrorLayer;

  constructor(params: {
    type: string;
    message: string;
    statusCode: number;
    retryable?: boolean;
    details?: ErrorDetails;
    layer?: ErrorLayer;
  }) {
    super(params.message);
    this.name = this.constructor.name;
    this.type = params.type;
    this.statusCode = params.statusCode;
    this.retryable = params.retryable ?? false;
    this.details = params.details ?? {};
    this.layer = params.layer ?? "runtime";
  }
}

export class HttpError extends AppError {
  constructor(statusCode: number, type: string, message: string, details?: ErrorDetails) {
    super({
      type,
      message,
      statusCode,
      retryable: false,
      details,
      layer: "http"
    });
  }
}

export class ValidationError extends HttpError {
  constructor(message = "Invalid request payload", details?: ErrorDetails) {
    super(400, "validation_error", message, details);
  }
}

export class ModelOutputError extends AppError {
  constructor(message = "Model output was malformed or schema-invalid", details?: ErrorDetails) {
    super({
      type: "model_output_invalid",
      message,
      statusCode: 502,
      retryable: true,
      details,
      layer: "llm"
    });
  }
}

export class UpstreamLLMError extends AppError {
  constructor(message = "Upstream LLM provider is unavailable", details?: ErrorDetails) {
    super({
      type: "upstream_unavailable",
      message,
      statusCode: 503,
      retryable: true,
      details,
      layer: "llm"
    });
  }
}

export class ProviderConfigurationError extends AppError {
  constructor(message = "LLM provider configuration or request is invalid", details?: ErrorDetails) {
    super({
      type: "provider_configuration_error",
      message,
      statusCode: 502,
      retryable: false,
      details,
      layer: "llm"
    });
  }
}

export class TimeoutError extends AppError {
  constructor(message = "Analysis request timed out", details?: ErrorDetails) {
    super({
      type: "timeout",
      message,
      statusCode: 408,
      retryable: false,
      details,
      layer: "runtime"
    });
  }
}

export function formatZodIssues(issues: ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code
  }));
}

export function toHttpError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isMalformedJsonError(error)) {
    return new ValidationError("Malformed JSON request body", {
      reason: "Request body must be valid JSON"
    });
  }

  if (isBodyParserClientError(error)) {
    return toBodyParserHttpError(error);
  }

  if (error instanceof ZodError) {
    return new ValidationError("Invalid request payload", {
      issues: formatZodIssues(error.issues)
    });
  }

  return new HttpError(500, "internal_error", "Internal Server Error");
}

export function toErrorResponse(error: AppError) {
  return {
    error: {
      type: error.type,
      message: error.message,
      retryable: error.retryable,
      details: error.details
    }
  };
}

function isMalformedJsonError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const status = getStatusCode(error);
  return (
    error.type === "entity.parse.failed" ||
    (status === 400 && (error.body !== undefined || error instanceof SyntaxError))
  );
}

function isBodyParserClientError(error: unknown): error is Record<string, unknown> {
  if (!isRecord(error)) {
    return false;
  }

  const status = getStatusCode(error);
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    (typeof error.type === "string" || error.expose === true)
  );
}

function toBodyParserHttpError(error: Record<string, unknown>) {
  const statusCode = getStatusCode(error) ?? 400;
  const parserType = typeof error.type === "string" ? error.type : undefined;
  const details = compactDetails({
    parser_error_type: parserType,
    limit: error.limit,
    length: error.length,
    expected: error.expected,
    received: error.received
  });

  if (statusCode === 413 || parserType === "entity.too.large") {
    return new HttpError(413, "request_body_too_large", "Request body is too large", details);
  }

  if (statusCode === 415) {
    return new HttpError(415, "unsupported_request_body", "Unsupported request body", details);
  }

  if (statusCode === 400) {
    return new ValidationError("Invalid request body", details);
  }

  return new HttpError(statusCode, "request_body_error", "Invalid request body", details);
}

function getStatusCode(error: Record<string, unknown>) {
  const status = error.status ?? error.statusCode;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function compactDetails(details: ErrorDetails) {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
