import { ModelOutputError, ProviderConfigurationError, UpstreamLLMError, formatZodIssues } from "../errors";
import {
  analyzeModelContentSchema,
  type AnalyzeModelContent,
  type AnalyzeModelOutput,
  type FinanceAnalyzerRequest
} from "../schemas/analyze";
import { type FinanceAnalyzer, type FinanceAnalyzerOptions } from "./FinanceAnalyzer";
import { createRunId } from "./MockFinanceAnalyzer";

interface AnthropicFinanceAnalyzerOptions {
  model?: string;
  endpoint?: string;
}

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

type AnthropicPromptRequest = Omit<FinanceAnalyzerRequest, "context">;

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";
const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const PROMPT_VERSION = "finance-close-command-centre-live-v1";

export class AnthropicFinanceAnalyzer implements FinanceAnalyzer {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(apiKey: string, options: AnthropicFinanceAnalyzerOptions = {}) {
    this.apiKey = apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  }

  async analyze(request: FinanceAnalyzerRequest, options?: FinanceAnalyzerOptions): Promise<AnalyzeModelOutput> {
    const runId = options?.runId ?? createRunId();
    const rawOutput = await this.callAnthropic(request, runId, options?.signal);
    return applyLiveProviderBoundary(parseLiveModelContent(rawOutput), request, runId, this.model);
  }

  private async callAnthropic(request: FinanceAnalyzerRequest, runId: string, signal?: AbortSignal) {
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        signal,
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1800,
          temperature: 0.2,
          system: buildSystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildUserPrompt(request, runId, this.model)
            }
          ]
        })
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      throw new UpstreamLLMError("Anthropic request failed", {
        provider: "anthropic",
        cause: error instanceof Error ? error.name : "unknown"
      });
    }

    if (!response.ok) {
      throwAnthropicHttpError(response);
    }

    let payload: AnthropicMessageResponse;
    try {
      payload = (await response.json()) as AnthropicMessageResponse;
    } catch (error) {
      throw new UpstreamLLMError("Anthropic response was not valid JSON", {
        provider: "anthropic",
        cause: error instanceof Error ? error.name : "unknown"
      });
    }

    const text = extractText(payload);
    if (text === undefined) {
      throw new UpstreamLLMError("Anthropic response did not include text content", {
        provider: "anthropic"
      });
    }

    return stripJsonFence(text);
  }
}

function buildSystemPrompt() {
  return [
    "You are a finance AI adapter for a Lighthouse case-study Close Command Centre.",
    "Return only strict JSON. Do not include markdown, prose, or code fences.",
    "This repository has no live NetSuite, Brex, warehouse, or Google Drive access.",
    "Treat the supplied request fields as demo finance inputs, not retrieved accounting truth.",
    "Deterministic systems own accounting truth. The LLM explains, prioritizes, summarizes, and drafts.",
    "The LLM must not book entries, approve expenses, send messages, close cases, or replace deterministic finance calculations.",
    "All recommended actions must be review-gated and human-approved."
  ].join(" ");
}

export function buildUserPrompt(request: FinanceAnalyzerRequest, runId: string, modelName: string) {
  const promptRequest = toAnthropicPromptRequest(request);

  return `Build a demo finance analysis response for this request.

Request:
${JSON.stringify(promptRequest, null, 2)}

Allowed values:
- status: choose exactly one of completed, needs_review, incomplete, failed.
- recommended_actions[].priority: choose exactly one of low, medium, high.
- citations: use an empty array because this live adapter has no real NetSuite, Brex, AP, warehouse, or evidence-store retrieval.

Return exactly one JSON object matching this raw live content contract:
{
  "status": "needs_review",
  "summary": "Brief finance-safe summary requiring human review.",
  "drivers": [
    {
      "rank": 1,
      "driver_type": "demo_variance_driver",
      "label": "Demo finance driver",
      "amount": 123.45,
      "currency": "USD",
      "explanation": "Explain the driver using only the supplied demo context.",
      "citations": []
    }
  ],
  "recommended_actions": [
    { "action_type": "draft_commentary", "priority": "high", "owner_role": "Controller", "text": "Draft review-gated commentary for finance approval." }
  ],
  "confidence": { "overall": 0.7, "reasons": ["The output is based on supplied demo context and still requires finance review."] },
  "citations": [],
  "review_required": true
}

Important:
- Do not include a validation object. The application derives validation after parsing provider output.
- Do not include run_id, analysis_type, or audit. The application owns those fields.
- Do not include citation records. This adapter has no service-owned retrieval layer.
- The application will attach run_id "${runId}", analysis_type "${request.analysis_type}", model_name "${modelName}", and prompt_version "${PROMPT_VERSION}" after parsing.
- Make the output useful for an interview demo, but conservative enough for finance review.`;
}

function toAnthropicPromptRequest(request: FinanceAnalyzerRequest): AnthropicPromptRequest {
  const {
    query,
    analysis_type,
    entity_id,
    period,
    account_ids,
    case_ids,
    materiality_threshold,
    requested_actions
  } = request;

  return omitUndefined({
    query,
    analysis_type,
    entity_id,
    period,
    account_ids,
    case_ids,
    materiality_threshold,
    requested_actions
  });
}

function omitUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T;
}

function throwAnthropicHttpError(response: Response): never {
  const details = {
    provider: "anthropic",
    status: response.status,
    status_text: response.statusText
  };

  if (response.status === 429 || response.status >= 500) {
    throw new UpstreamLLMError("Anthropic request failed", details);
  }

  throw new ProviderConfigurationError("Anthropic request was rejected as a non-retryable client/provider error", details);
}

function extractText(payload: AnthropicMessageResponse) {
  const textBlocks = payload.content?.filter((block) => block.type === "text" && typeof block.text === "string") ?? [];
  const text = textBlocks.map((block) => block.text).join("\n").trim();
  return text.length > 0 ? text : undefined;
}

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function parseLiveModelContent(raw: string): AnalyzeModelContent {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ModelOutputError("Model output was not valid JSON", {
      cause: error instanceof Error ? error.message : "unknown parse error"
    });
  }

  const result = analyzeModelContentSchema.safeParse(parsed);
  if (!result.success) {
    throw new ModelOutputError("Model output failed live content schema validation", {
      issues: formatZodIssues(result.error.issues)
    });
  }

  return result.data;
}

function applyLiveProviderBoundary(
  result: AnalyzeModelContent,
  request: FinanceAnalyzerRequest,
  runId: string,
  modelName: string
): AnalyzeModelOutput {
  return {
    ...result,
    run_id: runId,
    analysis_type: request.analysis_type,
    citations: [],
    drivers: result.drivers.map((driver) => ({
      ...driver,
      citations: []
    })),
    audit: {
      generated_at: new Date().toISOString(),
      model_name: modelName,
      prompt_version: PROMPT_VERSION
    }
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
