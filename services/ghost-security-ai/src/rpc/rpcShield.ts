/**
 * RPC Shield
 *
 * Monitors GhostChain L1/L2/L3 block production health by comparing
 * block numbers across consecutive scan cycles.
 *
 * Detects:
 *   - Chain stall: no new block in SSA_BLOCK_STALL_SEC seconds
 *   - Block production slowdown: block time exceeds expected range
 *
 * Uses ghost_blockNumber — native http, no external libs.
 */

import { rpcCall, hexToNumber } from '../rpcHelper.js';
import { recordThreat, notifyGhostBrain } from '../securityBus.js';
import type { ThreatEvent } from '../types.js';

const L1_RPC = process.env.L1_RPC_URL ?? 'http://localhost:18545';
const L2_RPC = process.env.L2_RPC_URL ?? 'http://localhost:29545';
const L3_RPC = process.env.L3_RPC_URL ?? 'http://localhost:39545';

const STALL_SEC  = Number(process.env.SSA_BLOCK_STALL_SEC    ?? 120);    // secs before stall alert
const SLOW_MULT  = Number(process.env.SSA_BLOCK_SLOW_MULT    ?? 3);      // >3x normal block time = slow

// Average expected block times per chain (seconds)
const EXPECTED_BLOCK_S = { l1: 5, l2: 2, l3: 2 };

interface BlockState {
  block: number;
  ts:    number;
}

const _lastBlock: Record<'l1' | 'l2' | 'l3', BlockState | null> = {
  l1: null, l2: null, l3: null,
};

let _componentStatus: 'secure' | 'warning' | 'alert' = 'secure';
export function getRpcStatus(): typeof _componentStatus { return _componentStatus; }

async function checkChain(
  key: 'l1' | 'l2' | 'l3',
  rpcUrl: string,
): Promise<void> {
  try {
    const hexBlock = await rpcCall(rpcUrl, 'ghost_blockNumber', []);
    const block    = hexToNumber(hexBlock);
    const now      = Date.now();
    const prev     = _lastBlock[key];

    if (prev !== null) {
      const elapsedSec = (now - prev.ts) / 1_000;
      const blockDelta = block - prev.block;

      // No new block produced
      if (blockDelta === 0) {
        if (elapsedSec >= STALL_SEC) {
          _componentStatus = 'alert';
          const evt: ThreatEvent = {
            id:          `ssa-rpc-stall-${key}-${Date.now()}`,
            ts:          now,
            category:    'rpc',
            level:       'critical',
            title:       `Chain stall on ${key.toUpperCase()}`,
            description: `No new block produced on ${key.toUpperCase()} for ${elapsedSec.toFixed(0)}s ` +
                         `(threshold: ${STALL_SEC}s). Block stuck at #${block}.`,
            source:      rpcUrl,
            metadata:    { chain: key, block, elapsedSec },
          };
          recordThreat(evt);
          await notifyGhostBrain(evt);
        }
      } else {
        // Check for slowdown
        const expectedBlocks  = elapsedSec / EXPECTED_BLOCK_S[key];
        const slowFactor = expectedBlocks / Math.max(blockDelta, 1);
        if (slowFactor > SLOW_MULT) {
          _componentStatus = 'warning';
          const evt: ThreatEvent = {
            id:          `ssa-rpc-slow-${key}-${Date.now()}`,
            ts:          now,
            category:    'rpc',
            level:       'medium',
            title:       `Block production slowing on ${key.toUpperCase()}`,
            description: `Expected ~${expectedBlocks.toFixed(0)} blocks in ${elapsedSec.toFixed(0)}s ` +
                         `but only got ${blockDelta} (${slowFactor.toFixed(1)}x slower than expected).`,
            source:      rpcUrl,
            metadata:    { chain: key, blockDelta, expectedBlocks, slowFactor },
          };
          recordThreat(evt);
        } else {
          _componentStatus = 'secure';
        }
      }
    }

    _lastBlock[key] = { block, ts: now };
    console.log(`[SSA:rpc:shield] ${key.toUpperCase()} block=${block}`);
  } catch (err) {
    _componentStatus = 'warning';
    console.error(`[SSA:rpc:shield] ${key} poll failed:`, (err as Error).message);
  }
}

export async function analyseRpc(): Promise<void> {
  await Promise.allSettled([
    checkChain('l1', L1_RPC),
    checkChain('l2', L2_RPC),
    checkChain('l3', L3_RPC),
  ]);
}

export function getBlockStates(): Record<'l1' | 'l2' | 'l3', BlockState | null> {
  return { ..._lastBlock };
}
