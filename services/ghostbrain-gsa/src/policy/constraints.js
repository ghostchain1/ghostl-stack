/**
 * @file src/policy/constraints.js
 * @description Constitutional constraints: routing law + branding invariants.
 *
 * These are the ABSOLUTE CONSTRAINTS — any policy decision that would violate
 * these must be DENIED regardless of other approvals.
 *
 * Routing Law:
 *   GhostL3 (903) → GhostL2 (901) ONLY
 *   GhostL2 (901) → GhostChain L1 (14000101) ONLY
 *   No L3 → L1 direct
 *   External bridging/settlement ONLY via L1 (14000101)
 *
 * Brand Law:
 *   Name=Ghost, Symbol=GST, Decimals=18
 *   No ETH/WETH/Gwei user-facing leaks (bridge exception allowlist applies)
 */

import { config } from '../config.js';

const { L1, L2, L3 } = config.brand.chainIds;

/** Valid intra-chain routes: [srcChainId, dstChainId] */
const VALID_ROUTES = new Set([`${L3}→${L2}`, `${L2}→${L1}`]);

/** User-facing strings that are FORBIDDEN in non-bridge contexts */
const FORBIDDEN_BRAND_STRINGS = ['ETH', 'WETH', 'Gwei', 'GhostChain', 'ether'];

/**
 * @param {number} srcChainId
 * @param {number} dstChainId
 * @returns {{ ok: boolean, reason?: string }}
 */
export function assertRoutingLaw(srcChainId, dstChainId) {
  const route = `${srcChainId}→${dstChainId}`;
  if (!VALID_ROUTES.has(route)) {
    return {
      ok: false,
      reason: `ROUTING_LAW_VIOLATION: route ${route} is forbidden. ` +
              `Valid routes: L3→L2 (${L3}→${L2}), L2→L1 (${L2}→${L1})`,
    };
  }
  return { ok: true };
}

/**
 * Assert that an external egress action originates from L1 only.
 * @param {number} srcChainId
 * @returns {{ ok: boolean, reason?: string }}
 */
export function assertExternalEgressFromL1(srcChainId) {
  if (srcChainId !== L1) {
    return {
      ok: false,
      reason: `ROUTING_LAW_VIOLATION: external egress must originate from L1 (${L1}), got ${srcChainId}`,
    };
  }
  return { ok: true };
}

/**
 * Validate token metadata against branding law.
 * @param {{ name?: string, symbol?: string, decimals?: number }} metadata
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function assertBrandingLaw(metadata) {
  const violations = [];
  const { name: BRAND_NAME, symbol: BRAND_SYMBOL, decimals: BRAND_DECIMALS } = config.brand;

  if (metadata.name !== undefined && metadata.name !== BRAND_NAME) {
    violations.push(`BRAND_VIOLATION: token name="${metadata.name}" must be "${BRAND_NAME}"`);
  }
  if (metadata.symbol !== undefined && metadata.symbol !== BRAND_SYMBOL) {
    violations.push(`BRAND_VIOLATION: token symbol="${metadata.symbol}" must be "${BRAND_SYMBOL}"`);
  }
  if (metadata.decimals !== undefined && metadata.decimals !== BRAND_DECIMALS) {
    violations.push(`BRAND_VIOLATION: token decimals=${metadata.decimals} must be ${BRAND_DECIMALS}`);
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Scan a text payload for forbidden brand strings.
 * Returns only violations that are NOT in bridge-exception contexts.
 * @param {string} text
 * @param {{ bridgeContext?: boolean, filePath?: string }} [opts]
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function assertNoBrandLeak(text, opts = {}) {
  if (opts.bridgeContext) return { ok: true, violations: [] };
  const filePath = opts.filePath ?? '';
  // Bridge exception: paths matching bridge/, weth, adapter, contracts/lib
  const isBridgeExempt = /bridge|weth|adapter|contracts\/lib|node_modules/i.test(filePath);
  if (isBridgeExempt) return { ok: true, violations: [] };

  const violations = [];
  for (const forbidden of FORBIDDEN_BRAND_STRINGS) {
    // Only flag in metadata-like contexts (symbol:, name:, currency:) not docs
    const metadataPattern = new RegExp(`\\b(?:symbol|currency|token)\\s*[=:]\\s*["']?${forbidden}["']?`, 'i');
    if (metadataPattern.test(text)) {
      violations.push(`BRAND_LEAK: "${forbidden}" found in token metadata context`);
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Validate a proposed patch against ALL constitutional constraints.
 * @param {{ routeCheck?: { src: number, dst: number }, metadata?: object, text?: string, filePath?: string }} patch
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function validatePatchAgainstConstitution(patch) {
  const all = [];

  if (patch.routeCheck) {
    const r = assertRoutingLaw(patch.routeCheck.src, patch.routeCheck.dst);
    if (!r.ok) all.push(r.reason);
  }
  if (patch.metadata) {
    const b = assertBrandingLaw(patch.metadata);
    all.push(...b.violations);
  }
  if (patch.text) {
    const l = assertNoBrandLeak(patch.text, { filePath: patch.filePath });
    all.push(...l.violations);
  }

  return { ok: all.length === 0, violations: all };
}
