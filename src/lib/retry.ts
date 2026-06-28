import { AppError } from "../errors";

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const defaultShouldRetry = (error: unknown) => error instanceof AppError && error.retryable;

const sleep = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

export async function retry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts);
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 1000;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      return await operation(attempt);
    } catch (error) {
      const canRetry = attempt < maxAttempts && shouldRetry(error, attempt);

      if (!canRetry) {
        throw error;
      }

      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delayMs);
    }
  }

  throw new Error("retry exhausted without throwing the original error");
}
