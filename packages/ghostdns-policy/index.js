import { createHash } from 'node:crypto';

const toLayer = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'L1' || raw === '1') return 'L1';
  if (raw === 'L2' || raw === '2') return 'L2';
  if (raw === 'L3' || raw === '3') return 'L3';
  throw new Error(`invalid_layer:${String(value)}`);
};

export const assertResolutionLayer = (requestLayer, recordLayer) => {
  const requester = toLayer(requestLayer);
  const ownerLayer = toLayer(recordLayer);
  if (requester === ownerLayer) return { ok: true, requester, ownerLayer };
  if (requester === 'L1') return { ok: true, requester, ownerLayer };
  if (requester === 'L2' && ownerLayer === 'L3') return { ok: true, requester, ownerLayer };
  throw new Error(`ghostdns_resolution_blocked:${requester}->${ownerLayer}`);
};

export const assertMutationOrigin = (originLayer) => {
  const layer = toLayer(originLayer);
  if (layer !== 'L1') {
    throw new Error(`ghostdns_mutation_blocked:${layer}`);
  }
  return { ok: true, layer };
};

export const evaluatePolicyDecision = ({
  action,
  requestLayer,
  recordLayer,
  emergency = false,
  confidence = 1
}) => {
  const normalizedAction = String(action || '').trim().toLowerCase();
  const evaluatedAt = new Date().toISOString();
  const requester = toLayer(requestLayer);
  const owner = toLayer(recordLayer || requestLayer);
  const boundedConfidence = Math.max(0, Math.min(1, Number(confidence || 0)));

  if (emergency) {
    return {
      allow: false,
      reason: 'emergency_lock',
      confidence: boundedConfidence,
      action: normalizedAction,
      requestLayer: requester,
      recordLayer: owner,
      evaluatedAt
    };
  }

  if (normalizedAction === 'resolve') {
    assertResolutionLayer(requester, owner);
    return {
      allow: true,
      reason: 'resolution_allowed',
      confidence: boundedConfidence,
      action: normalizedAction,
      requestLayer: requester,
      recordLayer: owner,
      evaluatedAt
    };
  }

  if (normalizedAction === 'mutate') {
    assertMutationOrigin(requester);
    return {
      allow: true,
      reason: 'mutation_allowed_l1',
      confidence: boundedConfidence,
      action: normalizedAction,
      requestLayer: requester,
      recordLayer: owner,
      evaluatedAt
    };
  }

  return {
    allow: false,
    reason: 'unsupported_action',
    confidence: boundedConfidence,
    action: normalizedAction,
    requestLayer: requester,
    recordLayer: owner,
    evaluatedAt
  };
};

export const decisionDigest = (decision) =>
  createHash('sha256').update(JSON.stringify(decision)).digest('hex');
