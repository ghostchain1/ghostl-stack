import test from 'node:test';
import assert from 'node:assert/strict';

import { compareFixDrafts, rankFixes, type ScoredFixDraft } from '../src/ranking/ranker.js';
import { demoRankInput } from '../src/ranking/fixtures.js';

test('rankFixes: deterministic ordering for identical inputs', () => {
  const input = demoRankInput();
  const baseline = rankFixes(input, 'prop_demo').map((f) => f.fix_id);
  for (let i = 0; i < 100; i++) {
    const next = rankFixes(input, 'prop_demo').map((f) => f.fix_id);
    assert.deepEqual(next, baseline);
  }
});

test('compareFixDrafts: tie-break falls through to lexicographic fix_id', () => {
  const base: Omit<ScoredFixDraft, 'fix_id'> = {
    description: 'x',
    diff_summary: 'same_len',
    risk_score: 10,
    blast_radius: 'low',
    uncertainty: 5,
    expected_benefit: 30,
    rollback_plan_json: { steps: ['noop'] },
    verification_steps_json: [{ kind: 'noop' }],
    required_gates: 'proposal_only',
    score: 99
  };

  const a: ScoredFixDraft = { ...base, fix_id: 'fix_a' };
  const b: ScoredFixDraft = { ...base, fix_id: 'fix_b' };
  assert.equal(compareFixDrafts(a, b) < 0, true);
  assert.equal(compareFixDrafts(b, a) > 0, true);
});

