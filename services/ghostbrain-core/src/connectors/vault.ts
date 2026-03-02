/**
 * GhostBrain Core — Vault Connector
 *
 * GhostBrain reads secrets exclusively from Vault.
 * No secrets are stored in process memory beyond the immediate use.
 * SECURITY: Secret values must NEVER be logged.
 */

import { VAULT_ADDR, VAULT_ROLE_ID } from "../config.js";
import { logger } from "../logger.js";

interface VaultSecret {
  data: Record<string, string>;
  metadata?: {
    version: number;
    created_time: string;
    destroyed: boolean;
  };
}

let _vaultToken: string | null = null;

/**
 * Authenticate with Vault via AppRole.
 * The secret_id must be provided from a short-lived source (e.g., init container).
 */
export async function vaultLogin(secretId: string): Promise<void> {
  const res = await fetch(`${VAULT_ADDR}/v1/auth/approle/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_id: VAULT_ROLE_ID, secret_id: secretId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Vault AppRole login failed: ${res.status}`);
  }
  const body = await res.json() as { auth: { client_token: string } };
  _vaultToken = body.auth.client_token;
  logger.info("Vault auth successful (AppRole)");
}

/**
 * Read a KV secret from Vault.
 * SECURITY: Never log the returned values.
 */
export async function readSecret(path: string): Promise<Record<string, string> | null> {
  if (!_vaultToken) {
    logger.warn("Vault token not set — running unauthenticated (dev mode only)");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(_vaultToken ? { "X-Vault-Token": _vaultToken } : {}),
  };

  const res = await fetch(`${VAULT_ADDR}/v1/secret/data/${path}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    logger.error("Vault read failed", { path, status: res.status });
    return null;
  }

  const body = await res.json() as { data: VaultSecret };
  return body.data.data;
}

/**
 * Health check: verifies Vault is sealed/unsealed.
 */
export async function vaultHealth(): Promise<{ sealed: boolean; initialized: boolean }> {
  const res = await fetch(`${VAULT_ADDR}/v1/sys/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok && res.status !== 429 && res.status !== 473 && res.status !== 501 && res.status !== 503) {
    logger.warn("Vault health check failed", { status: res.status });
    return { sealed: true, initialized: false };
  }
  const body = await res.json() as { sealed: boolean; initialized: boolean };
  return body;
}
