/**
 * GhostContractAI — Layer RPC Connectors
 *
 * Provides typed ethers.js providers for L1/L2/L3.
 * Signs transactions via Vault-backed private key (stub; replace with Vault SDK).
 *
 * SECURITY: Private key material is loaded once at startup and never logged.
 */

import { JsonRpcProvider, Wallet, type Provider } from "ethers";
import type { Layer } from "./routing-law.js";
import { RPC_URLS, VAULT_ADDR, VAULT_TOKEN, VAULT_SECRET_PATH } from "./config.js";
import { logger } from "./logger.js";

// ─── Providers (read-only) ────────────────────────────────────────────────────

const _providers: Record<Layer, JsonRpcProvider | null> = {
  L1: null,
  L2: null,
  L3: null,
};

export function getProvider(layer: Layer): JsonRpcProvider {
  if (!_providers[layer]) {
    _providers[layer] = new JsonRpcProvider(RPC_URLS[layer]);
  }
  return _providers[layer]!;
}

// ─── Signer (Vault-backed) ─────────────────────────────────────────────────────

let _signer: Wallet | null = null;

/**
 * Load the signing key from Vault or ENV (never logged).
 * In production, integrate with HashiCorp Vault's transit secrets engine or
 * use AWS KMS / GCP Cloud KMS via appropriate SDK.
 */
export async function loadSigner(): Promise<Wallet | null> {
  if (_signer) return _signer;

  // 1. Try Vault
  if (VAULT_ADDR && VAULT_TOKEN) {
    try {
      const res = await fetch(`${VAULT_ADDR}/v1/${VAULT_SECRET_PATH}`, {
        headers: { "X-Vault-Token": VAULT_TOKEN },
      });
      if (res.ok) {
        const body = await res.json() as { data?: { data?: { privateKey?: string } } };
        const pk   = body?.data?.data?.privateKey;
        if (pk) {
          _signer = new Wallet(pk, getProvider("L1"));
          logger.info("Signing key loaded from Vault", { path: VAULT_SECRET_PATH });
          return _signer;
        }
      }
    } catch (err) {
      logger.warn("Vault unavailable, falling back to ENV key", { error: String(err) });
    }
  }

  // 2. Fallback: ENV (devnet / CI only — NOT for production)
  const envKey = process.env.GHOSTAI_SIGNER_KEY;
  if (envKey) {
    logger.warn("Using GHOSTAI_SIGNER_KEY from ENV — for devnet/CI use only");
    _signer = new Wallet(envKey, getProvider("L1"));
    return _signer;
  }

  logger.warn("No signing key available — deploy/upgrade pipelines will run in dry-run mode");
  return null;
}

/**
 * Get a provider connected to the correct layer, enforcing that the layer
 * is known and in the topology.
 */
export function getLayerProvider(layer: Layer): Provider {
  return getProvider(layer);
}

/**
 * Fetch the block number for a given layer (liveness probe).
 */
export async function pingLayer(layer: Layer): Promise<{ layer: Layer; blockNumber?: number; ok: boolean }> {
  try {
    const provider = getProvider(layer);
    const blockNumber = await provider.getBlockNumber();
    return { layer, blockNumber, ok: true };
  } catch (err) {
    logger.warn(`Layer ping failed`, { layer, error: String(err) });
    return { layer, ok: false };
  }
}
