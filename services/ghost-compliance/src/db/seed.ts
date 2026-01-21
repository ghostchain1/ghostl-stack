import { readFileSync } from 'fs';
import path from 'path';
import { pool } from './index';
import { parsePolicyBundle } from '../engine/parser';
import { evaluatePolicy } from '../engine/evaluator';
import { buildAttestation } from '../attest/attestation';
import type { DecisionInput } from '../engine/types';
import { createHash } from 'crypto';

const MIGRATION_FILE = path.join(__dirname, 'migrations', '001_init.sql');
const SEED_POLICY_FILE = path.join(__dirname, 'seed-policy.yml');

const run = async () => {
  const migration = readFileSync(MIGRATION_FILE, 'utf-8');
  await pool.query(migration);

  await pool.query(
    'INSERT INTO jurisdictions (code, name) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name',
    ['US', 'United States']
  );

  const lawRow = await pool.query(
    `INSERT INTO laws (jurisdiction_code, topic, title, summary)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    ['US', 'aml', 'Ghost AML Framework', 'AML reporting obligations for GhostChain operators.']
  );

  await pool.query(
    `INSERT INTO law_versions (law_id, version, effective_from, effective_to, text)
     VALUES ($1,$2,$3,$4,$5)`,
    [lawRow.rows[0].id, '2025.01', '2025-01-01', null, 'All transfers above USD 1000 require travel rule disclosure.']
  );

  const bundleYaml = readFileSync(SEED_POLICY_FILE, 'utf-8');
  const bundle = parsePolicyBundle(bundleYaml);
  const bundleRow = await pool.query(
    `INSERT INTO policy_bundles (bundle_id, version, status, yaml, bundle, signature, activated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id`,
    [bundle.metadata.bundleId, bundle.metadata.version, 'active', bundleYaml, bundle, null]
  );

  for (const rule of bundle.policies) {
    const effect = 'deny' in rule.effect ? 'deny' : 'require' in rule.effect ? 'require' : 'allow';
    await pool.query(
      `INSERT INTO policy_rules (bundle_id, rule_id, priority, actions, effect, effect_detail)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [bundleRow.rows[0].id, rule.id, rule.priority, rule.appliesTo.actions, effect, rule.effect]
    );
  }

  const subjectRow = await pool.query(
    `INSERT INTO compliance_subjects (wallet_address, chain_id, user_id, residency_country, kyc_level)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    ['0x0000000000000000000000000000000000000001', '901', 'user-1', 'US', '2']
  );

  const decisionInput: DecisionInput = {
    requestId: 'seed-request-1',
    subject: {
      type: 'wallet',
      walletAddress: '0x0000000000000000000000000000000000000001',
      chainId: '901',
      userId: 'user-1',
      residencyCountry: 'US',
      kycLevel: '2'
    },
    action: 'TRANSFER',
    resource: { amountUSD: 1500, token: 'GHOST' },
    context: { ipCountry: 'US', counterpartyRisk: 0.2 }
  };
  const decision = evaluatePolicy(bundle, decisionInput);
  const attestation = await buildAttestation(decisionInput, decisionInput.resource);

  const evidenceArtifacts = {
    requestId: decisionInput.requestId,
    action: decisionInput.action,
    subject: decisionInput.subject,
    resource: decisionInput.resource,
    context: decisionInput.context,
    decision
  };
  const evidenceHash = sha256(JSON.stringify(evidenceArtifacts));
  const evidenceRow = await pool.query(
    `INSERT INTO evidence_bundles (subject_id, prev_hash, hash, artifacts)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [subjectRow.rows[0].id, null, evidenceHash, evidenceArtifacts]
  );

  const decisionRow = await pool.query(
    `INSERT INTO compliance_decisions
     (request_id, subject_id, action, resource, context, decision, reasons, required_controls, disclosures, matched_rules, policy_bundle_id, evidence_bundle_id, attestation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      decisionInput.requestId,
      subjectRow.rows[0].id,
      decisionInput.action,
      decisionInput.resource,
      decisionInput.context,
      decision.decision,
      decision.reasons,
      decision.requiredControls,
      decision.disclosures,
      decision.matchedRules,
      bundleRow.rows[0].id,
      evidenceRow.rows[0].id,
      attestation
    ]
  );

  await pool.query('UPDATE evidence_bundles SET decision_id = $1 WHERE id = $2', [decisionRow.rows[0].id, evidenceRow.rows[0].id]);

  await pool.query(
    `INSERT INTO compliance_predictions (jurisdiction, topic, risk_delta, summary, features)
     VALUES ($1,$2,$3,$4,$5)`,
    ['US', 'aml', 0.42, 'Travel rule exposure rising in US AML updates.', { keywords: ['travel', 'rule', 'transfer'] }]
  );

  await pool.end();
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
