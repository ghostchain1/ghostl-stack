export function safeJsonStringify(value: unknown, maxLen = 10_000): string {
  let out = "";
  try { out = JSON.stringify(value); }
  catch { out = '"[unserializable]"'; }
  if (out.length > maxLen) out = out.slice(0, maxLen) + '..."';
  return out;
}
