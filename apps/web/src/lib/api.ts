import { z } from 'zod';
import { resolveApiBase } from './runtime';

export type ApiError = {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

type FetchOptions<T> = {
  fallback?: T;
  next?: { revalidate?: number };
  schema?: z.ZodType<T>;
  baseUrl?: string;
  init?: RequestInit;
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

const normalizeError = (err: unknown, status?: number): ApiError => {
  if (err && typeof err === 'object') {
    const message =
      ('message' in err && typeof (err as { message?: string }).message === 'string'
        ? (err as { message?: string }).message
        : 'request_failed') || 'request_failed';
    return { message, status, details: err };
  }
  return { message: typeof err === 'string' ? err : 'request_failed', status };
};

export async function apiRequest<T = unknown>(path: string, options: FetchOptions<T> = {}): Promise<ApiResult<T>> {
  const baseUrl = options.baseUrl || resolveApiBase();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      ...options.init,
      next: options.next
    });
    if (!res.ok) {
      handleAuthStatus(res.status);
      const payload = await res.json().catch(() => ({}));
      return { ok: false, error: normalizeError(payload, res.status) };
    }
    const data = (await res.json()) as T;
    if (options.schema) {
      const parsed = options.schema.safeParse(data);
      if (!parsed.success) {
        return { ok: false, error: normalizeError(parsed.error, 500) };
      }
      return { ok: true, data: parsed.data };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}

export async function apiFetch<T = unknown>(path: string, options: FetchOptions<T> = {}): Promise<T> {
  const res = await apiRequest<T>(path, options);
  if (res.ok) return res.data;
  if (options.fallback !== undefined) return options.fallback;
  throw new Error(res.error.message);
}
