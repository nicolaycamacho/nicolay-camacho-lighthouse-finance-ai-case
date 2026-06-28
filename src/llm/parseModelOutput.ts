import { ModelOutputError, formatZodIssues } from "../errors";
import { analyzeResponseSchema, type AnalyzeResponse } from "../schemas/analyze";

export function parseModelOutput(raw: string): AnalyzeResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ModelOutputError("Model output was not valid JSON", {
      cause: error instanceof Error ? error.message : "unknown parse error"
    });
  }

  const result = analyzeResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new ModelOutputError("Model output failed response schema validation", {
      issues: formatZodIssues(result.error.issues)
    });
  }

  return result.data;
}
