import { firstValueFrom, from, timeout } from 'rxjs';

/**
 * Wraps a promise in a timeout handler. If the promise does not resolve within
 * timeoutMs, it rejects with the specified errorMessage.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return firstValueFrom(
    from(promise).pipe(
      timeout({
        each: timeoutMs,
        with: () => {
          throw new Error(errorMessage);
        },
      }),
    ),
  );
}
