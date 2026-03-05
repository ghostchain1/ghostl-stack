// vault-client.ts — HashiCorp Vault / ai-vault HTTP client
// Supports token auth and AppRole auth. All secrets are redacted in logs.
import { randomBytes } from 'node:crypto';
import { CFG } from './config.js';
import { logger } from './logger.js';
import type { RotationRule } from './types.js';

const state = {
  token: CFG.vaultToken as string,
  lastLogin: 0,
};

/** Low-level Vault HTTP call. Uses ai-vault proxy if AI_VAULT_ADDR is set,
 *  or direct VAULT_ADDR otherwise. */
async function vaultFetch(
  method: string,
  vaultPath: string,
  body?: unknown,
  tokenOverride?: string,
): Promise<Record<string, unknown>> {
  const base = CFG.aiVaultAddr || CFG.vaultAddr;
  const url = `${base}${vaultPath.startsWith('/v1') ? vaultPath : `/v1/${vaultPath.replace(/^\//, '')}`}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = tokenOverride ?? state.token;
  if (token) headers['x-vault-token'] = token;
  if (CFG.vaultNamespace) headers['x-vault-namespace'] = CFG.vaultNamespace;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  const text = await res.text();
  if (!res.ok) {
    const err = Object.assign(new Error(`vault ${res.status}: ${text.slice(0, 200)}`), {
      status: res.status,
    });
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

/** Login via AppRole (VAULT_ROLE_ID + VAULT_SECRET_ID) */
async function loginAppRole(): Promise<void> {
  if (!CFG.vaultRoleId || !CFG.vaultSecretId) return;
  const resp = await vaultFetch('POST', '/v1/auth/approle/login', {
    role_id: CFG.vaultRoleId,
    secret_id: CFG.vaultSecretId,
  });
  const token = (resp as Record<string, Record<string, string>>)?.auth?.client_token;
  if (token) {
    state.token = token;
    state.lastLogin = Date.now();
    logger.registerSecret(token);
    logger.info('Vault AppRole login successful');
  }
}

async function ensureToken(): Promise<void> {
  if (!state.token) await loginAppRole();
}

/** Read a KV v2 secret */
export async function kvRead(mount: string, secretPath: string): Promise<Record<string, unknown>> {
  await ensureToken();
  const res = await vaultFetch('GET', `/v1/${mount}/data/${secretPath.replace(/^\//, '')}`);
  return (res as Record<string, Record<string, Record<string, unknown>>>)?.data?.data ?? {};
}

/** Write a KV v2 secret */
export async function kvWrite(mount: string, secretPath: string, data: Record<string, unknown>): Promise<void> {
  await ensureToken();
  await vaultFetch('POST', `/v1/${mount}/data/${secretPath.replace(/^\//, '')}`, { data });
}

/** Read a KV v1 secret */
export async function kvReadV1(mount: string, secretPath: string): Promise<Record<string, unknown>> {
  await ensureToken();
  const res = await vaultFetch('GET', `/v1/${mount}/${secretPath.replace(/^\//, '')}`);
  return (res as Record<string, Record<string, unknown>>)?.data ?? {};
}

/** Rotate keys in a Vault secret by generating new random values */
export async function rotateSecret(rule: RotationRule): Promise<{ ok: boolean; rotated?: string[]; reason?: string }> {
  if (!CFG.rotateEnabled) return { ok: false, reason: 'rotation_disabled' };
  try {
    await ensureToken();
    const version = rule.kvVersion ?? 2;
    const current = version === 2
      ? await kvRead(rule.mount, rule.path)
      : await kvReadV1(rule.mount, rule.path);

    const keys = rule.keys?.length ? rule.keys : Object.keys(current);
    const updated = { ...current };

    for (const k of keys) {
      const len = rule.keyLength ?? 32;
      const buf = randomBytes(len);
      updated[k] = rule.encoding === 'hex' ? buf.toString('hex') : buf.toString('base64');
      logger.registerSecret(updated[k] as string); // redact new value in logs
    }

    if (version === 2) {
      await kvWrite(rule.mount, rule.path, updated);
    } else {
      await vaultFetch('POST', `/v1/${rule.mount}/${rule.path.replace(/^\//, '')}`, updated);
    }
    return { ok: true, rotated: keys };
  } catch (err) {
    logger.error('Secret rotation failed', { mount: rule.mount, path: rule.path, err: String(err) });
    return { ok: false, reason: String(err) };
  }
}

/** Health-check the Vault / ai-vault endpoint */
export async function vaultHealth(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${CFG.aiVaultAddr}/health`, { signal: AbortSignal.timeout(4_000) });
    const body = await res.json() as { ok?: boolean };
    return { ok: res.ok && !!body.ok };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}
