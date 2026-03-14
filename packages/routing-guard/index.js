const allowedTransitions = new Set([
  'L3->L2',
  'L2->L1',
  'L1->L2',
  'L2->L3'
]);

/** Canonical chain IDs for GhostChain mainchains. */
const MAINCHAIN_CHAIN_IDS = Object.freeze({
  14000101: 'GhostChain',
  901: 'GhostL2',
  903: 'GhostL3',
});

const normalizeLayer = (layer) => {
  const raw = String(layer || '').trim().toUpperCase();
  if (raw === '1' || raw === 'L1') return 'L1';
  if (raw === '2' || raw === 'L2') return 'L2';
  if (raw === '3' || raw === 'L3') return 'L3';
  throw new Error(`invalid_layer:${String(layer)}`);
};

export const layerFromNumeric = (value) => normalizeLayer(value);

export const assertRoutingTransition = (sourceLayer, targetLayer, opts = {}) => {
  const source = normalizeLayer(sourceLayer);
  const target = normalizeLayer(targetLayer);
  const transition = `${source}->${target}`;
  if (!allowedTransitions.has(transition)) {
    const intent = opts.intent ? ` intent=${opts.intent}` : '';
    throw new Error(`routing_guard_blocked:${transition}${intent}`);
  }
  return { ok: true, source, target, transition };
};

export const assertExternalEgress = (sourceLayer) => {
  const source = normalizeLayer(sourceLayer);
  if (source !== 'L1') {
    throw new Error(`routing_guard_blocked_external:${source}->external`);
  }
  return { ok: true, source, transition: `${source}->external` };
};

export const assertEndpointAllowlisted = (endpointUrl, allowlist = []) => {
  const endpoint = String(endpointUrl || '').trim();
  if (!endpoint) throw new Error('endpoint_missing');
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return { ok: true, endpoint, mode: 'open' };
  }
  const normalized = allowlist.map((item) => String(item || '').trim()).filter(Boolean);
  if (!normalized.includes(endpoint)) {
    throw new Error(`endpoint_not_allowlisted:${endpoint}`);
  }
  return { ok: true, endpoint, mode: 'allowlist' };
};

/**
 * Assert that a numeric chain ID is one of the three canonical GhostChain
 * mainchains: GhostChain (14000101), GhostL2 (901), GhostL3 (903).
 * Throws `routing_guard_unknown_chain:<id>` for any other ID.
 */
export const assertMainchainId = (chainId) => {
  const id = Number(chainId);
  const name = MAINCHAIN_CHAIN_IDS[id];
  if (!name) {
    throw new Error(`routing_guard_unknown_chain:${chainId}`);
  }
  return { ok: true, chainId: id, name };
};

