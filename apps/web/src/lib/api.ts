import { resolveApiBase } from './runtime';

type FetchOptions<T> = {
  fallback?: T;
  next?: { revalidate?: number };
};

export async function apiFetch<T = unknown>(path: string, options: FetchOptions<T> = {}): Promise<T> {
  try {
    const res = await fetch(`${resolveApiBase()}${path}`, { next: options.next });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (options.fallback !== undefined) return options.fallback;
    throw e;
  }
}
