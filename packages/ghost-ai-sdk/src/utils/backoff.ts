/**
 * Exponential back-off with jitter.
 * Resolves when the attempt succeeds; rejects after maxAttempts.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: {
    maxAttempts?: number;
    baseMs?:      number;
    maxMs?:       number;
    jitter?:      boolean;
  } = {}
): Promise<T> {
  const { maxAttempts = 5, baseMs = 250, maxMs = 10_000, jitter = true } = opts;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      const exp   = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const delay = jitter ? exp * (0.5 + Math.random() * 0.5) : exp;
      await sleep(delay);
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
