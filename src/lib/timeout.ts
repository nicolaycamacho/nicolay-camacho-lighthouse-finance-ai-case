import { TimeoutError } from "../errors";

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message = "Analysis timed out"): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer: NodeJS.Timeout;

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new TimeoutError(message, {
          timeout_ms: timeoutMs
        })
      );
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timer);
      });
  });
}
