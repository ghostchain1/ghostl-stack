export const LAYERS = ['L1', 'L2', 'L3'];

export const normalizeLayer = (layer) => {
  const raw = String(layer || '').trim().toUpperCase();
  if (raw === '1' || raw === 'L1') return 'L1';
  if (raw === '2' || raw === 'L2') return 'L2';
  if (raw === '3' || raw === 'L3') return 'L3';
  throw new Error(`invalid_layer:${String(layer)}`);
};

export const validateRecord = (record) => {
  if (!record || typeof record !== 'object') throw new Error('invalid_record');
  const domain = String(record.domain || '').trim().toLowerCase();
  const target = String(record.target || '').trim();
  if (!domain) throw new Error('domain_required');
  if (!target) throw new Error('target_required');
  const layer = normalizeLayer(record.layer);
  const ttl = Number(record.ttl || 60);
  if (!Number.isFinite(ttl) || ttl < 10 || ttl > 86_400) throw new Error('ttl_out_of_range');
  return {
    domain,
    target,
    layer,
    ttl,
    version: Number(record.version || 1),
    owner: String(record.owner || '').trim() || null,
    metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata : {}
  };
};
