import { ModelOutputError, formatZodIssues } from "../errors";
import { analyzeModelOutputSchema, type AnalyzeModelOutput } from "../schemas/analyze";

export function parseModelOutput(raw: string): AnalyzeModelOutput {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ModelOutputError("Model output was not valid JSON", {
      cause: error instanceof Error ? error.message : "unknown parse error"
    });
  }

  const result = analyzeModelOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new ModelOutputError("Model output failed response schema validation", {
      issues: formatZodIssues(result.error.issues)
    });
  }

  return result.data;
}
