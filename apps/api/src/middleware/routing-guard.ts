/**
 * routing-guard.ts — Express middleware enforcing GhostChain routing law.
 *
 * Routing law (constitutional):
 *   L3 → L2 only
 *   L2 → L1 only
 *   L1 → external only
 *   L3 → L1 is FORBIDDEN (no bypass)
 *
 * Applied on bridge, swap-execute, and admin write endpoints that carry
 * sourceChain / targetChain (or sourceLayer / targetLayer) in their bodies or
 * query strings so that the invariant is checked at the API gateway edge
 * before any upstream service is contacted.
 *
 * Field resolution order (body takes precedence over query):
 *   sourceChain | sourceLayer | fromChain | from_chain  (numeric or L1/L2/L3)
 *   targetChain | targetLayer | toChain   | to_chain
 *
 * If neither field is present the middleware passes through — the route is
 * considered layer-agnostic and is not subject to transition enforcement.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { assertRoutingTransition, assertExternalEgress, assertMainchainId, layerFromNumeric } from '@ghostl/routing-guard';

// ─── Field extraction ─────────────────────────────────────────────────────────

type RawLayerValue = string | number | undefined;

function pickField(sources: Record<string, unknown>, ...keys: string[]): RawLayerValue {
  for (const key of keys) {
    const v = sources[key];
    if (v !== undefined && v !== null && v !== '') return v as RawLayerValue;
  }
  return undefined;
}

function resolveLayer(raw: RawLayerValue): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  try {
    return layerFromNumeric(raw);
  } catch {
    return undefined;
  }
}

const SOURCE_KEYS = ['sourceChain', 'sourceLayer', 'fromChain', 'from_chain', 'source_chain', 'source'];
const TARGET_KEYS = ['targetChain', 'targetLayer', 'toChain', 'to_chain', 'target_chain', 'target'];

function extractLayers(req: Request): { source?: string; target?: string } {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const query = req.query as Record<string, unknown>;
  const merged = { ...query, ...body }; // body wins
  return {
    source: resolveLayer(pickField(merged, ...SOURCE_KEYS)),
    target: resolveLayer(pickField(merged, ...TARGET_KEYS)),
  };
}

// ─── Middleware factories ─────────────────────────────────────────────────────

/**
 * assertRoutingLawMiddleware
 *
 * Validates that the sourceLayer → targetLayer transition is permitted.
 * Pass-through when no layer fields are present (layer-agnostic routes).
 * Returns 400 when:
 *   - Source layer is present but target is absent (ambiguous transition)
 *   - Transition is forbidden by routing law (e.g. L3→L1)
 */
export const assertRoutingLawMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const { source, target } = extractLayers(req);

  // No layer context — pass through
  if (!source) return next();

  // Source present but target absent — ambiguous, require explicit target
  if (!target) {
    res.status(400).json({
      error: 'routing_law_target_required',
      hint: 'Provide targetChain or targetLayer when sourceChain/sourceLayer is specified.',
      source,
    });
    return;
  }

  try {
    assertRoutingTransition(source, target, { intent: req.path });
    return next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'routing_law_blocked';
    res.status(422).json({
      error: 'routing_law_violation',
      detail: message,
      source,
      target,
      correlationId: (req as Request & { correlationId?: string }).correlationId,
    });
  }
};

/**
 * requireL1EgressMiddleware
 *
 * Asserts that external egress may only originate from L1.
 * Used on endpoints that proximate external (off-chain) services.
 * Reads sourceLayer from body/query; pass-through when absent.
 */
export const requireL1EgressMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const { source } = extractLayers(req);
  if (!source) return next();

  try {
    assertExternalEgress(source);
    return next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'routing_law_external_forbidden';
    res.status(422).json({
      error: 'routing_law_egress_violation',
      detail: message,
      source,
      correlationId: (req as Request & { correlationId?: string }).correlationId,
    });
  }
};

// ─── Chain ID enforcement ────────────────────────────────────────────────────

/**
 * assertChainIdMiddleware
 *
 * Rejects requests that carry a numeric `chainId` (body or query) that is not
 * one of the three canonical GhostChain mainchains:
 *   14000101 → GhostChain (L1)
 *   901       → GhostL2   (L2)
 *   903       → GhostL3   (L3)
 *
 * Label-form values ("l1", "l2", "l3") and absent fields pass through
 * unchanged — label validation is handled upstream by Zod enum schemas.
 */
export const assertChainIdMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const query = req.query as Record<string, unknown>;
  const raw = body['chainId'] ?? body['chain_id'] ?? query['chainId'] ?? query['chain_id'];

  if (raw === undefined || raw === null || raw === '') return next();

  const asNum = Number(raw);
  // Only validate numeric chain IDs — label strings ('l1'/'l2'/'l3') are fine
  if (!Number.isFinite(asNum) || asNum === 0) return next();

  try {
    assertMainchainId(asNum);
    return next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'routing_guard_unknown_chain';
    res.status(422).json({
      error: 'chain_not_allowed',
      detail: message,
      chainId: asNum,
      allowed: [14000101, 901, 903],
      correlationId: (req as Request & { correlationId?: string }).correlationId,
    });
  }
};
