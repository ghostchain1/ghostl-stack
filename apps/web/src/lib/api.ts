import { z } from 'zod';
import { resolveApiBase } from './runtime';

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
  fallback?: T;
  next?: { revalidate?: number };
  schema?: z.ZodType<T>;
  baseUrl?: string;
  init?: Parameters<typeof fetch>[1];
};

const handleAuthStatus = (status: number) => {
  if (typeof window === 'undefined') return;
  if (status === 401) {
    window.location.href = '/login';
    return;
  }
  if (status === 403) {
    window.location.href = '/403';
  }
};

const resolveHint = (error: ApiError): string => {
  if (error.hint) return error.hint;
  if (!error.status) {
    return 'Check API URL (NEXT_PUBLIC_API_URL / API_INTERNAL_URL) and ensure the backend is reachable.';
  }
  if (error.status === 401) {
    return 'Login required or session expired. Sign in and retry.';
  }
  if (error.status === 403) {
    return 'Insufficient permissions. Verify RBAC role assignments.';
  }
  if (error.status === 404) {
    return 'Endpoint not found. Verify route wiring in apps/api.';
  }
  if (error.status === 409) {
    return 'Conflict or empty registry. Check seed/bootstrapping steps.';
  }
  if (error.status >= 500) {
    return 'Backend or upstream service unavailable. Check docker-compose and service logs.';
  }
  return 'Check request parameters and service availability.';
};

const normalizeError = (err: unknown, status: number | undefined, endpoint?: string, method?: string): ApiError => {
  if (err && typeof err === 'object') {
    const messageCandidate =
      ('message' in err && typeof (err as { message?: string }).message === 'string'
        ? (err as { message?: string }).message
        : undefined) ||
      ('error' in err && typeof (err as { error?: string }).error === 'string'
        ? (err as { error?: string }).error
        : undefined);
    const hintCandidate =
      ('hint' in err && typeof (err as { hint?: string }).hint === 'string'
        ? (err as { hint?: string }).hint
        : undefined) ||
      undefined;
    const codeCandidate =
      ('code' in err && typeof (err as { code?: string }).code === 'string'
        ? (err as { code?: string }).code
        : undefined) ||
      undefined;
    const message = messageCandidate || 'request_failed';
    const apiError: ApiError = { message, status, code: codeCandidate, details: err, endpoint, method, hint: hintCandidate };
    apiError.hint = resolveHint(apiError);
    return apiError;
  }
  const apiError: ApiError = {
    message: typeof err === 'string' ? err : 'request_failed',
    status,
    endpoint,
    method
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
  code: error.code
});

export async function apiRequest<T = unknown>(path: string, options: FetchOptions<T> = {}): Promise<ApiResult<T>> {
  const baseUrl = options.baseUrl || resolveApiBase();
  try {
    const url = `${baseUrl}${path}`;
    const method = options.init?.method ? options.init.method.toString().toUpperCase() : 'GET';
    const res = await fetch(url, {
      credentials: 'include',
      ...options.init,
      next: options.next
    });
    if (!res.ok) {
      handleAuthStatus(res.status);
      const payload = await res.json().catch(() => ({}));
      return { ok: false, error: normalizeError(payload, res.status, url, method) };
    }
    const data = (await res.json()) as T;
    if (options.schema) {
      const parsed = options.schema.safeParse(data);
      if (!parsed.success) {
        return { ok: false, error: normalizeError(parsed.error, 500, `${baseUrl}${path}`, method) };
      }
      return { ok: true, data: parsed.data };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: normalizeError(err, undefined, `${baseUrl}${path}`) };
  }
}

export async function apiFetch<T = unknown>(path: string, options: FetchOptions<T> = {}): Promise<T> {
  const res = await apiRequest<T>(path, options);
  if (res.ok) return res.data;
  if (options.fallback !== undefined) return options.fallback;
  throw new Error(res.error.message);
}
