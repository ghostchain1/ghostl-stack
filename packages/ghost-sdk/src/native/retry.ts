export type RetryOptions = {
  retries: number;
  minDelayMs: number;
  maxDelayMs: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  const j = ms * 0.2;
  return Math.max(0, ms + (Math.random() * 2 - 1) * j);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= opts.retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === opts.retries) break;
      const base = Math.min(opts.maxDelayMs, opts.minDelayMs * Math.pow(2, i));
      await sleep(jitter(base));
    }
  }
  throw lastErr;
}
