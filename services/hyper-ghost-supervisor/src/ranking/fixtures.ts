import type { RankedFixInput } from '../types/hgop.js';

export const demoRankInput = (): RankedFixInput => ({
  incident: {
    incident_id: 'inc_demo',
    ts: 1710000000,
    env: 'devnet',
    scope: 'rollup:l3',
    severity: 'P1',
    title: 'demo',
    status: 'open',
    symptoms_json: { lag: 3000 },
    hypotheses_json: [{ id: 'nonce_gap' }],
    evidence_refs_json: [{ kind: 'doctor' }]
  },
  evidence: [],
  constraints: { exec: false },
  health: { probes: [] }
});
