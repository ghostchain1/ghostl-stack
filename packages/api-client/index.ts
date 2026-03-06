/**
 * @ghostl/api-client — shared typed fetch wrapper for GhostStack services.
 *
 * Framework-agnostic: no Next.js or browser globals required.
 * Callers supply baseUrl and an optional onAuthError callback.
 */

type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = { success: false; error: unknown };
export type SchemaLike<T> = { safeParse: (data: unknown) => ParseSuccess<T> | ParseFailure };

export type ApiError = {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
  endpoint?: string;
  method?: string;
  hint?: string;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type FetchOptions<T> = {
  /** Fallback value returned by apiFetch on error (instead of throwing). */
  fallback?: T;
  /** Next.js cache revalidation hint — passed through to fetch if present. */
  next?: { revalidate?: number };
  /** Optional Zod-compatible schema to validate the response body. */
  schema?: SchemaLike<T>;
  /** Override the base URL. Defaults to empty string (relative). */
  baseUrl?: string;
  /** Raw RequestInit options forwarded to fetch. */
  init?: Parameters<typeof fetch>[1];
  /**
   * Called when the server responds with 401 or 403.
   * Used by browser clients to redirect to /login or /403.
   */
  onAuthError?: (status: 401 | 403) => void;
};

const resolveHint = (error: ApiError): string => {
  if (error.hint) return error.hint;
  if (!error.status) {
    return 'Check the API base URL and ensure the backend is reachable.';
  }
  if (error.status === 401) return 'Login required or session expired. Sign in and retry.';
  if (error.status === 403) return 'Insufficient permissions. Verify RBAC role assignments.';
  if (error.status === 404) return 'Endpoint not found. Verify route wiring in apps/api.';
  if (error.status === 409) return 'Conflict or empty registry. Check seed/bootstrapping steps.';
  if (error.status >= 500) return 'Backend or upstream service unavailable. Check logs.';
  return 'Check request parameters and service availability.';
};

const normalizeError = (
  err: unknown,
  status: number | undefined,
  endpoint?: string,
  method?: string,
): ApiError => {
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const message =
      (typeof o['message'] === 'string' ? o['message'] : undefined) ||
      (typeof o['error'] === 'string' ? o['error'] : undefined) ||
      'request_failed';
    const hint = typeof o['hint'] === 'string' ? o['hint'] : undefined;
    const code = typeof o['code'] === 'string' ? o['code'] : undefined;
    const apiError: ApiError = { message, status, code, details: err, endpoint, method, hint };
    apiError.hint = resolveHint(apiError);
    return apiError;
  }
  const apiError: ApiError = {
    message: typeof err === 'string' ? err : 'request_failed',
    status,
    endpoint,
    method,
  };
  apiError.hint = resolveHint(apiError);
  return apiError;
};

export const formatApiError = (error: ApiError) => ({
  endpoint: error.endpoint || 'unknown',
  method: error.method || 'GET',
  status: typeof error.status === 'number' ? String(error.status) : 'network_error',
  message: error.message,
  hint: error.hint || resolveHint(error),
  code: error.code,
});

export async function apiRequest<T = unknown>(
  path: string,
  options: FetchOptions<T> = {},
): Promise<ApiResult<T>> {
  const baseUrl = options.baseUrl ?? '';
  const url = `${baseUrl}${path}`;
  const method = options.init?.method
    ? String(options.init.method).toUpperCase()
    : 'GET';
  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...options.init,
      // Pass Next.js cache hint if provided (typed any to avoid importing Next types)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(options.next ? ({ next: options.next } as any) : {}),
    });
    if (!res.ok) {
      if (
        options.onAuthError &&
        (res.status === 401 || res.status === 403)
      ) {
        options.onAuthError(res.status as 401 | 403);
      }
      const payload = await res.json().catch(() => ({}));
      return { ok: false, error: normalizeError(payload, res.status, url, method) };
    }
    const data = (await res.json()) as T;
    if (options.schema) {
      const parsed = options.schema.safeParse(data);
      if (!parsed.success) {
        return { ok: false, error: normalizeError(parsed.error, 500, url, method) };
      }
      return { ok: true, data: parsed.data };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: normalizeError(err, undefined, url, method) };
  }
}

/**
 * Like apiRequest but throws on error or returns the fallback value if provided.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions<T> = {},
): Promise<T> {
  const res = await apiRequest<T>(path, options);
  if (res.ok) return res.data;
  if (options.fallback !== undefined) return options.fallback;
  throw new Error(res.error.message);
}
