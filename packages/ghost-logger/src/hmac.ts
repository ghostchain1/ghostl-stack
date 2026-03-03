// hmac.ts — HMAC-SHA256 signing for GhostLog entries
// SPDX-License-Identifier: MIT
//
// Rules:
//   • Canonical form = JSON.stringify of entry with `hmac` field omitted,
//     keys sorted deterministically (depth-1 sort is sufficient for flat entries)
//   • If no secret is configured, signing is skipped (hmac field absent)
//   • Verification returns false rather than throwing on tamper

import { createHmac } from 'node:crypto';
import type { GhostLogEntry } from './types.js';

/** Produce a deterministic JSON string from a log entry (omit hmac field) */
function canonicalize(entry: GhostLogEntry): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hmac: _hmac, ...rest } = entry;
  // Sort top-level keys for determinism
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(rest).sort()) {
    sorted[k] = (rest as Record<string, unknown>)[k];
  }
  return JSON.stringify(sorted);
}

/** Sign a log entry in-place; returns the entry for chaining */
export function signEntry(entry: GhostLogEntry, secret: string): GhostLogEntry {
  const canonical = canonicalize(entry);
  entry.hmac = createHmac('sha256', secret).update(canonical).digest('hex');
  return entry;
}

/** Verify an entry's HMAC; returns false if absent or tampered */
export function verifyEntry(entry: GhostLogEntry, secret: string): boolean {
  if (!entry.hmac) return false;
  const expected = createHmac('sha256', secret)
    .update(canonicalize(entry))
    .digest('hex');
  // Constant-time comparison
  if (expected.length !== entry.hmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ entry.hmac.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Produce a chain HMAC over an array of per-entry HMACs.
 * Used by the log bundle signer for tamper-evident batch sealing.
 */
export function chainHmac(hmacs: string[], secret: string): string {
  return createHmac('sha256', secret).update(hmacs.join('|')).digest('hex');
}
