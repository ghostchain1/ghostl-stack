const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type FetchOptions<T> = {
  fallback?: T;
  next?: { revalidate?: number };
};

export async function apiFetch<T = any>(path: string, options: FetchOptions<T> = {}): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { next: options.next });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (options.fallback !== undefined) return options.fallback;
    throw e;
  }
}
