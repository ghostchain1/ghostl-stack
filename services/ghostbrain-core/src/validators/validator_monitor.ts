/**
 * GhostBrain — Validator Monitor
 *
 * Monitors GhostChain L1 validator health via Cosmos LCD and CometBFT RPC.
 * Tracks signing rate, uptime, jailing, and slash events.
 * Stores telemetry in the InfraMemory + event system.
 *
 * Cosmos LCD:    http://localhost:1317
 * CometBFT RPC: http://localhost:26657
 */

import { request } from "undici";
import { store_event }       from "../memory_engine.js";
import { recordInfraSnapshot } from "../memory/infrastructure_memory.js";
import { log }               from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const LCD_URL    = process.env.COSMOS_LCD_URL        ?? "http://localhost:1317";
const COMET_URL  = process.env.COSMOS_COMET_RPC_URL  ?? "http://localhost:26657";
const SAMPLE_MS  = Number(process.env.VALIDATOR_SAMPLE_MS ?? "30000");

const SIGNING_WARN_THRESHOLD = Number(process.env.VALIDATOR_SIGNING_WARN ?? "0.95"); // <95% = warn
const SIGNING_CRIT_THRESHOLD = Number(process.env.VALIDATOR_SIGNING_CRIT ?? "0.80"); // <80% = critical

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidatorInfo {
  operatorAddress: string;
  moniker:         string;
  status:          "BOND_STATUS_BONDED" | "BOND_STATUS_UNBONDING" | "BOND_STATUS_UNBONDED";
  jailed:          boolean;
  tokens:          bigint;
  signingRate:     number;   // 0–1
  missedBlocks:    number;
  uptime:          number;   // 0–1
  sampledAt:       number;
}

// ── Internal state ─────────────────────────────────────────────────────────────

const _validators = new Map<string, ValidatorInfo>();
let   _sampleCount = 0;
let   _timer: ReturnType<typeof setInterval> | null = null;

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const { body, statusCode } = await request(url, {
    method:  "GET",
    headers: { accept: "application/json" },
  });
  if (statusCode !== 200) throw new Error(`HTTP ${statusCode} from ${url}`);
  return body.json() as Promise<T>;
}

// ── Sampling ──────────────────────────────────────────────────────────────────

async function sampleValidators(): Promise<void> {
  _sampleCount++;
  try {
    // Fetch bonded validators from Cosmos LCD
    const resp = await fetchJson<{
      validators: Array<{
        operator_address: string;
        description: { moniker: string };
        status: string;
        jailed: boolean;
        tokens: string;
      }>;
    }>(`${LCD_URL}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100`);

    for (const v of resp.validators) {
      // Fetch signing info
      let signingRate  = 1.0;
      let missedBlocks = 0;
      try {
        const sigInfo = await fetchJson<{
          val_signing_info: { missed_blocks_counter: string; start_height: string };
        }>(`${LCD_URL}/cosmos/slashing/v1beta1/signing_infos/${v.operator_address}`);

        const missed  = Number(sigInfo.val_signing_info.missed_blocks_counter);
        const started = Number(sigInfo.val_signing_info.start_height);
        // Approximate window from CometBFT default (10000 blocks)
        const window  = 10000;
        missedBlocks  = missed;
        signingRate   = Math.max(0, 1 - missed / Math.min(window, Math.max(1, _sampleCount * 30)));
      } catch { /* signing info unavailable — keep defaults */ }

      const info: ValidatorInfo = {
        operatorAddress: v.operator_address,
        moniker:         v.description.moniker,
        status:          v.status as ValidatorInfo["status"],
        jailed:          v.jailed,
        tokens:          BigInt(v.tokens),
        signingRate,
        missedBlocks,
        uptime:          v.jailed ? 0 : signingRate,
        sampledAt:       Date.now(),
      };
      _validators.set(v.operator_address, info);

      // Record in InfraMemory (layer="service" is the closest InfraLayer for a validator process)
      recordInfraSnapshot({
        ts:          Date.now(),
        resourceId:  v.operator_address,
        layer:       "service",
        cpuPct:      0,
        memPct:      0,
        diskIoPct:   0,
        netMbps:     0,
        restarts:    0,
        healthy:     !v.jailed && signingRate >= SIGNING_WARN_THRESHOLD,
        meta: {
          moniker:     v.description.moniker,
          signingRate,
          missedBlocks,
          jailed:      v.jailed,
        },
      });

      // Emit events for degraded validators
      if (v.jailed) {
        store_event({
          resourceId: v.operator_address,
          layer:      "validator" as const,
          category:   "consensus",
          label:      "validator_jailed",
          severity:   "critical",
          payload:    { moniker: v.description.moniker },
        });
      } else if (signingRate < SIGNING_CRIT_THRESHOLD) {
        store_event({
          resourceId: v.operator_address,
          layer:      "validator" as const,
          category:   "consensus",
          label:      "signing_rate_critical",
          severity:   "critical",
          payload:    { signingRate, missedBlocks, moniker: v.description.moniker },
        });
      } else if (signingRate < SIGNING_WARN_THRESHOLD) {
        store_event({
          resourceId: v.operator_address,
          layer:      "validator" as const,
          category:   "consensus",
          label:      "signing_rate_low",
          severity:   "warning",
          payload:    { signingRate, missedBlocks, moniker: v.description.moniker },
        });
      }
    }

    log.debug("validator_monitor: sampled", `${resp.validators.length} validators sampleCount=${_sampleCount}`);
  } catch (err) {
    log.warn("validator_monitor: sample_error", String(err));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getValidators(): ValidatorInfo[] {
  return [..._validators.values()];
}

export function getJailedValidators(): ValidatorInfo[] {
  return [..._validators.values()].filter(v => v.jailed);
}

export function getLowSigningValidators(threshold = SIGNING_WARN_THRESHOLD): ValidatorInfo[] {
  return [..._validators.values()].filter(v => v.signingRate < threshold && !v.jailed);
}

export function getValidatorMonitorStats() {
  const vals = [..._validators.values()];
  return {
    sampleCount:     _sampleCount,
    totalValidators: vals.length,
    jailed:          vals.filter(v => v.jailed).length,
    lowSigning:      vals.filter(v => v.signingRate < SIGNING_WARN_THRESHOLD).length,
    avgSigningRate:  vals.length > 0
      ? vals.reduce((s, v) => s + v.signingRate, 0) / vals.length
      : 1,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startValidatorMonitor(): void {
  if (_timer) return;
  void sampleValidators();
  _timer = setInterval(() => void sampleValidators(), SAMPLE_MS);
  log.info("validator_monitor: started", `intervalMs=${SAMPLE_MS} lcd=${LCD_URL}`);
}

export function stopValidatorMonitor(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  log.info("validator_monitor: stopped", "validator monitor halted");
}
