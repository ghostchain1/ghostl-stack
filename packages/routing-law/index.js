const LAYERS = new Set(['L1', 'L2', 'L3']);

export const normalizeLayer = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === '1' || raw === 'L1') return 'L1';
  if (raw === '2' || raw === 'L2') return 'L2';
  if (raw === '3' || raw === 'L3') return 'L3';
  throw new Error(`routing_law_invalid_layer:${String(value)}`);
};

export const assertRoutingLaw = ({ sourceLayer, targetLayer, externalEgress = false, intent = '' }) => {
  const source = normalizeLayer(sourceLayer);
  const target = targetLayer ? normalizeLayer(targetLayer) : null;

  if (externalEgress && source !== 'L1') {
    throw new Error(`routing_law_external_forbidden:${source}->external`);
  }

  if (source === 'L3') {
    if (target !== 'L2') {
      throw new Error(`routing_law_blocked:L3->${target || 'UNKNOWN'} intent=${intent}`);
    }
    return { ok: true, source, target, transition: 'L3->L2' };
  }

  if (source === 'L2') {
    if (target !== 'L1') {
      throw new Error(`routing_law_blocked:L2->${target || 'UNKNOWN'} intent=${intent}`);
    }
    return { ok: true, source, target, transition: 'L2->L1' };
  }

  if (source === 'L1') {
    if (externalEgress) {
      return { ok: true, source, target: 'EXTERNAL', transition: 'L1->EXTERNAL' };
    }
    if (target && target !== 'L1') {
      return { ok: true, source, target, transition: `L1->${target}` };
    }
    return { ok: true, source, target: target || 'L1', transition: 'L1->L1' };
  }

  if (!LAYERS.has(source)) {
    throw new Error(`routing_law_invalid_layer:${String(sourceLayer)}`);
  }

  throw new Error('routing_law_unhandled_transition');
};
