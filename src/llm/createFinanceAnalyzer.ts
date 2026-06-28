import type { FinanceAnalyzer } from "./FinanceAnalyzer";
import { AnthropicFinanceAnalyzer } from "./AnthropicFinanceAnalyzer";
import { MockFinanceAnalyzer } from "./MockFinanceAnalyzer";

type EnvLike = Record<string, string | undefined>;

export class FinanceAnalyzerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceAnalyzerConfigurationError";
  }
}

export function createFinanceAnalyzer(env: EnvLike = process.env): FinanceAnalyzer {
  const provider = normalizeProvider(env.LLM_PROVIDER);

  if (provider === "mock") {
    return new MockFinanceAnalyzer();
  }

  if (provider === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new FinanceAnalyzerConfigurationError(
        'LLM_PROVIDER="anthropic" requires ANTHROPIC_API_KEY to be set'
      );
    }

    return new AnthropicFinanceAnalyzer(apiKey, {
      model: env.ANTHROPIC_MODEL?.trim() || undefined
    });
  }

  throw new FinanceAnalyzerConfigurationError(
    `Unknown LLM_PROVIDER "${provider}". Supported providers: mock, anthropic`
  );
}

function normalizeProvider(provider: string | undefined) {
  const normalized = provider?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : "mock";
}
