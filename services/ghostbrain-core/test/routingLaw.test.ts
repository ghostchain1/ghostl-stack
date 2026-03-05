/**
 * services/ghostbrain-core/test/routingLaw.test.ts
 *
 * Covers the full layer-hop matrix defined in:
 *   src/core/routingLaw.ts
 *   contracts/src/RoutingLaw.sol  (canonical source-of-truth)
 *
 * Run:  npm test            (vitest)
 * Run:  npm test -- --ui    (vitest UI)
 */

import { describe, it, expect } from "vitest";
import {
  enforceRoutingLaw,
  type ActionMeta,
} from "../src/core/routingLaw.js";

// ──────────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────────

function meta(
  sourceLayer: ActionMeta["sourceLayer"],
  targetLayer: ActionMeta["targetLayer"],
  intent: ActionMeta["intent"] = "TX"
): ActionMeta {
  return { sourceLayer, targetLayer, intent };
}

function allowed(m: ActionMeta) {
  return enforceRoutingLaw(m);
}

// ──────────────────────────────────────────────────────────────────────────────
// Cross-chain routing matrix
// ──────────────────────────────────────────────────────────────────────────────

describe("RoutingLaw — cross-chain hops", () => {
  // ── L3 ────────────────────────────────────────────────────────────────────

  it("allows L3 → L2 (valid descent)", () => {
    const r = allowed(meta("L3", "L2"));
    expect(r.ok).toBe(true);
  });

  it("blocks L3 → L1 (skip-layer violation)", () => {
    const r = allowed(meta("L3", "L1"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/L3.*L1|skip|illegal/i);
  });

  it("blocks L3 → L3 (self-loop)", () => {
    const r = allowed(meta("L3", "L3"));
    expect(r.ok).toBe(false);
  });

  it("blocks L3 → EXTERNAL (L3 cannot reach external)", () => {
    const r = allowed(meta("L3", "EXTERNAL"));
    expect(r.ok).toBe(false);
  });

  // ── L2 ────────────────────────────────────────────────────────────────────

  it("allows L2 → L1 (valid ascent)", () => {
    const r = allowed(meta("L2", "L1"));
    expect(r.ok).toBe(true);
  });

  it("blocks L2 → L3 (upward skip not allowed)", () => {
    const r = allowed(meta("L2", "L3"));
    expect(r.ok).toBe(false);
  });

  it("blocks L2 → EXTERNAL (L2 cannot reach external directly)", () => {
    const r = allowed(meta("L2", "EXTERNAL"));
    expect(r.ok).toBe(false);
  });

  it("blocks L2 → L2 (self-loop)", () => {
    const r = allowed(meta("L2", "L2"));
    expect(r.ok).toBe(false);
  });

  // ── L1 ────────────────────────────────────────────────────────────────────

  it("allows L1 → EXTERNAL (L1 is the only egress point)", () => {
    const r = allowed(meta("L1", "EXTERNAL"));
    expect(r.ok).toBe(true);
  });

  it("blocks L1 → L2 (L1 has no outbound cross-chain)", () => {
    const r = allowed(meta("L1", "L2"));
    expect(r.ok).toBe(false);
  });

  it("blocks L1 → L3 (L1 has no outbound cross-chain)", () => {
    const r = allowed(meta("L1", "L3"));
    expect(r.ok).toBe(false);
  });

  it("blocks L1 → L1 (self-loop)", () => {
    const r = allowed(meta("L1", "L1"));
    expect(r.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Intent-specific constraints
// ──────────────────────────────────────────────────────────────────────────────

describe("RoutingLaw — BRIDGE intent", () => {
  it("blocks BRIDGE from L3 (only L1 may BRIDGE)", () => {
    const r = allowed(meta("L3", "L2", "BRIDGE"));
    expect(r.ok).toBe(false);
  });

  it("blocks BRIDGE from L2 (only L1 may BRIDGE)", () => {
    const r = allowed(meta("L2", "L1", "BRIDGE"));
    expect(r.ok).toBe(false);
  });

  it("allows BRIDGE from L1 to EXTERNAL", () => {
    const r = allowed(meta("L1", "EXTERNAL", "BRIDGE"));
    expect(r.ok).toBe(true);
  });
});

describe("RoutingLaw — EXTERNAL target routing", () => {
  it("allows TX from L1 to EXTERNAL target", () => {
    const r = allowed(meta("L1", "EXTERNAL", "TX"));
    expect(r.ok).toBe(true);
  });

  it("blocks TX from L2 to EXTERNAL target (only L1 may egress)", () => {
    const r = allowed(meta("L2", "EXTERNAL", "TX"));
    expect(r.ok).toBe(false);
  });

  it("blocks TX from L3 to EXTERNAL target (only L1 may egress)", () => {
    const r = allowed(meta("L3", "EXTERNAL", "TX"));
    expect(r.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Zod schema validation — malformed input
// ──────────────────────────────────────────────────────────────────────────────

describe("RoutingLaw — schema validation", () => {
  it("rejects unknown sourceLayer", () => {
    const r = enforceRoutingLaw({ sourceLayer: "L99", targetLayer: "L1", intent: "TX" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBeTruthy();
  });

  it("rejects unknown targetLayer", () => {
    const r = enforceRoutingLaw({ sourceLayer: "L1", targetLayer: "MOON", intent: "TX" });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown intent", () => {
    const r = enforceRoutingLaw({ sourceLayer: "L2", targetLayer: "L1", intent: "HACK" });
    expect(r.ok).toBe(false);
  });
});
