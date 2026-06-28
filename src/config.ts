export const DEFAULT_ANALYSIS_TIMEOUT_MS = 8000;
export const DEFAULT_PORT = 3000;

export function parseAnalysisTimeoutMs(rawValue = process.env.ANALYSIS_TIMEOUT_MS) {
  return parsePositiveIntegerConfig(rawValue, DEFAULT_ANALYSIS_TIMEOUT_MS);
}

export function parsePort(rawValue = process.env.PORT) {
  return parsePositiveIntegerConfig(rawValue, DEFAULT_PORT);
}

function parsePositiveIntegerConfig(rawValue: string | undefined, defaultValue: number) {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const normalizedValue = rawValue.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return defaultValue;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : defaultValue;
}
