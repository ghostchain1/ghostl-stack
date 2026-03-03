// redact.ts — Advanced secret redaction engine
// SPDX-License-Identifier: MIT
//
// Three-layer redaction:
//   1. Field-name blocklist (key-based, recursive object scan)
//   2. Runtime value set (exact match of known secret strings)
//   3. Heuristic patterns (hex private keys, JWT, bearer tokens, etc.)

/** Field names whose values are always redacted regardless of content */
const FIELD_BLOCKLIST = new Set([
  'key', 'privateKey', 'private_key', 'secret', 'token', 'password',
  'passwd', 'mnemonic', 'seed', 'pk', 'signer', 'vaultToken', 'vault_token',
  'signerKey', 'signer_key', 'rpcAuth', 'rpc_auth', 'apiKey', 'api_key',
  'bearer', 'credential', 'credentials', 'accessKey', 'access_key',
  'secretKey', 'secret_key', 'authToken', 'auth_token', 'jwt',
  'refreshToken', 'refresh_token', 'clientSecret', 'client_secret',
  'hmacSecret', 'hmac_secret', 'hmac', 'signature', 'sig',
  'encryptionKey', 'encryption_key', 'decryptionKey', 'decryption_key',
]);

/** Heuristic patterns for detecting accidentally included secrets */
const HEURISTIC_PATTERNS: RegExp[] = [
  /\b0x[0-9a-fA-F]{64}\b/g,                      // ETH private key (32-byte hex)
  /\b[0-9a-fA-F]{64}\b/g,                          // Raw 32-byte hex
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, // JWT
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,             // Bearer token
  /vault:\w{1,8}:[A-Za-z0-9+/=]{12,}/g,           // HashiCorp Vault token
  /hvs\.[A-Za-z0-9_-]{20,}/g,                     // Vault HVS token
  /ghp_[A-Za-z0-9]{36}/g,                          // GitHub PAT
  /sk-[A-Za-z0-9-]{40,}/g,                         // OpenAI-style keys
  /[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}:\S{10,}/g, // UUID:secret combos
];

/** Runtime-registered exact secret values (populated by GhostLogger) */
const _runtimeValues = new Set<string>();

/** Register a runtime secret value to always redact */
export function registerRedactValue(value: string): void {
  if (value && value.trim().length > 3) {
    _runtimeValues.add(value.trim());
  }
}

/** Register multiple runtime secret values */
export function registerRedactValues(values: string[]): void {
  for (const v of values) registerRedactValue(v);
}

/** Clear all runtime-registered values (use only in tests) */
export function clearRedactValues(): void {
  _runtimeValues.clear();
}

/** Apply heuristic pattern redaction to a string */
function applyPatterns(s: string): string {
  let out = s;
  for (const rx of HEURISTIC_PATTERNS) {
    out = out.replace(rx, '[REDACTED_PATTERN]');
  }
  return out;
}

/** Apply runtime value redaction to a string */
function applyRuntimeValues(s: string): string {
  let out = s;
  for (const val of _runtimeValues) {
    if (out.includes(val)) {
      out = out.replaceAll(val, '[REDACTED]');
    }
  }
  return out;
}

/** Redact a string value through all layers */
export function redactString(s: string): string {
  return applyPatterns(applyRuntimeValues(s));
}

/** Recursively redact a plain object — safe for JSON-serializable structures */
export function redactObject(
  obj: Record<string, unknown>,
  extraFields?: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const keyLower = k.toLowerCase();
    const blocked =
      FIELD_BLOCKLIST.has(k) ||
      FIELD_BLOCKLIST.has(keyLower) ||
      (extraFields ? (extraFields.has(k) || extraFields.has(keyLower)) : false) ||
      // Catch compound keys like "secretKey", "userPassword", "authBearer"
      [...FIELD_BLOCKLIST].some(f => keyLower.includes(f.toLowerCase()));

    if (blocked) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      out[k] = redactString(v);
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactObject(v as Record<string, unknown>, extraFields);
    } else if (Array.isArray(v)) {
      out[k] = v.map(item =>
        typeof item === 'string'
          ? redactString(item)
          : (item !== null && typeof item === 'object'
              ? redactObject(item as Record<string, unknown>, extraFields)
              : item),
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Top-level redact — accepts any type */
export function redact(value: unknown, extraFields?: Set<string>): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return redactObject(value as Record<string, unknown>, extraFields);
  }
  return value;
}
