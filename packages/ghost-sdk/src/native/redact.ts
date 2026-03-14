export function redact(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const v = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    const lower = k.toLowerCase();
    if (lower.includes("secret") || lower.includes("password") || lower.includes("key") || lower.includes("priv")) {
      out[k] = "[redacted]";
    } else {
      out[k] = val;
    }
  }
  return out;
}
