/** Parse JSON safely — returns undefined on error instead of throwing. */
export function safeJson<T = unknown>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Stringify with a fallback for non-serialisable values. */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
