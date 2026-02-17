const RETRYABLE_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
]);

export function apiBaseUrl(): string {
  return (
    process.env.GHOSTCONTROL_API_URL ??
    process.env.NEXT_PUBLIC_GHOSTCONTROL_API ??
    "http://localhost:7401"
  );
}

export function extractNetworkErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const err = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof err.code === "string") return err.code;
  if (typeof err.cause?.code === "string") return err.cause.code;
  return undefined;
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function shouldRetryError(error: unknown): boolean {
  const code = extractNetworkErrorCode(error);
  if (code && RETRYABLE_NETWORK_CODES.has(code)) return true;
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    if (error.message.toLowerCase().includes("fetch failed")) return true;
  }
  return false;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseDelayMs = Math.max(25, opts.baseDelayMs ?? 150);
  const maxDelayMs = Math.max(baseDelayMs, opts.maxDelayMs ?? 1000);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, init);
      if (!shouldRetryStatus(response.status) || attempt === attempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (!shouldRetryError(error) || attempt === attempts) {
        throw error;
      }
    }

    const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    await sleep(delayMs);
  }

  throw lastError instanceof Error ? lastError : new Error("fetch_retry_exhausted");
}

