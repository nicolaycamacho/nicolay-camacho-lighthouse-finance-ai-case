import { TimeoutError } from "../errors";

interface TimeoutOptions {
  abortController?: AbortController;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = "Analysis timed out",
  options: TimeoutOptions = {}
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer: NodeJS.Timeout;

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new TimeoutError(message, {
        timeout_ms: timeoutMs
      });
      options.abortController?.abort(error);
      reject(error);
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timer);
      });
  });
}
