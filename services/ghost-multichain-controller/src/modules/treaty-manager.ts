/**
 * Treaty Manager
 *
 * Loads and caches sovereign treaties between GhostChain and external chains.
 * Treaties define the maximum bridge volume, minimum intervals, and operational
 * windows for each cross-chain relationship.
 *
 * Treaty files are stored as JSON in:
 *   ${TREATY_DIR} (env) or <repo_root>/policies/treaties/ (default)
 *
 * Each treaty file is a JSON object matching the Treaty interface.
 *
 * SECURITY: filenames are validated against SAFE_ID_RE to prevent path traversal.
 */
import { readdir, readFile }    from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import type { Treaty, ExternalChainId } from "../types.js";
import { EXTERNAL_CHAIN_IDS, SAFE_ID_RE } from "../types.js";

const DEFAULT_TREATY_DIR = resolve(
  new URL("../../../policies/treaties", import.meta.url).pathname,
);
const TREATY_DIR = resolve(process.env["TREATY_DIR"] ?? DEFAULT_TREATY_DIR);

// Cache: reload every 5 minutes
let _cache:     Treaty[] = [];
let _cacheTime  = 0;
const CACHE_TTL = 5 * 60_000;

function validateTreaty(obj: unknown): obj is Treaty {
  if (!obj || typeof obj !== "object") return false;
  const t = obj as Record<string, unknown>;
  return (
    typeof t["id"]                    === "string" &&
    typeof t["name"]                  === "string" &&
    typeof t["counterpartyChain"]     === "string" &&
    EXTERNAL_CHAIN_IDS.has(t["counterpartyChain"] as ExternalChainId) &&
    typeof t["maxBridgeAmountBps"]    === "number" &&
    typeof t["minBridgeIntervalSecs"] === "number" &&
    typeof t["activeFrom"]            === "number" &&
    typeof t["enabled"]               === "boolean"
  );
}

function isActiveTreaty(t: Treaty): boolean {
  const now = Date.now() / 1_000;
  return t.enabled && t.activeFrom <= now && (t.activeTo === undefined || t.activeTo > now);
}

export async function loadTreaties(): Promise<Treaty[]> {
  if (Date.now() - _cacheTime < CACHE_TTL && _cache.length > 0) {
    return _cache;
  }

  let entries: string[];
  try {
    entries = await readdir(TREATY_DIR);
  } catch {
    // Treaties directory not yet created — return empty (not a fatal error)
    _cache     = [];
    _cacheTime = Date.now();
    return _cache;
  }

  const treaties: Treaty[] = [];

  for (const entry of entries) {
    // Only process .json files with safe names (no path traversal)
    if (extname(entry) !== ".json") continue;
    const stem = entry.slice(0, -5); // strip .json
    if (!SAFE_ID_RE.test(stem)) {
      console.warn(`[treaty-manager] skipping unsafe filename: "${entry}"`);
      continue;
    }

    // Resolved path must stay within TREATY_DIR (belt-and-suspenders)
    const filePath = join(TREATY_DIR, entry);
    if (!filePath.startsWith(TREATY_DIR + "/")){
      console.warn(`[treaty-manager] path traversal attempt blocked: "${entry}"`);
      continue;
    }

    try {
      const raw  = await readFile(filePath, "utf8");
      const obj  = JSON.parse(raw) as unknown;
      if (validateTreaty(obj)) {
        treaties.push(obj);
      } else {
        console.warn(`[treaty-manager] invalid treaty schema in "${entry}" — skipping`);
      }
    } catch (err) {
      console.warn(`[treaty-manager] failed to parse "${entry}":`, String(err));
    }
  }

  _cache     = treaties.filter(isActiveTreaty);
  _cacheTime = Date.now();

  console.log(`[treaty-manager] loaded ${_cache.length} active treaties from ${TREATY_DIR}`);
  return _cache;
}

/**
 * Check whether a bridge operation of `amountGst` (as a string of GST wei)
 * is permitted under the treaty for `chain`.
 *
 * Returns `true` if allowed (or no treaty restricts the chain).
 * `treasuryGst` is the current treasury balance in GST wei (as string).
 */
export function checkTreatyAllowance(
  chain:       ExternalChainId,
  amountGst:   string,
  treasuryGst: string,
): boolean {
  const activeTreaties = _cache.filter(t => t.counterpartyChain === chain && t.enabled);
  if (activeTreaties.length === 0) return true; // no treaty → no restriction

  const amount   = BigInt(amountGst);
  const treasury = BigInt(treasuryGst);

  for (const treaty of activeTreaties) {
    const maxAmount = (treasury * BigInt(treaty.maxBridgeAmountBps)) / 10_000n;
    if (amount > maxAmount) {
      console.warn(
        `[treaty-manager] treaty "${treaty.id}" blocks ${chain} bridge: ` +
        `amount ${amountGst} > max ${maxAmount.toString()} (${treaty.maxBridgeAmountBps}bps of treasury)`,
      );
      return false;
    }
  }

  return true;
}
