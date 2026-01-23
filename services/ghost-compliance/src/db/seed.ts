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

  const lawTitle = 'Ghost AML Framework';
  const lawSummary = 'AML reporting obligations for GhostChain operators.';
  const existingLaw = await pool.query(
    `SELECT id FROM laws WHERE jurisdiction_code = $1 AND topic = $2 AND title = $3 LIMIT 1`,
    ['US', 'aml', lawTitle]
  );
  const lawRow = existingLaw.rows[0]
    ? existingLaw
    : await pool.query(
        `INSERT INTO laws (jurisdiction_code, topic, title, summary)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        ['US', 'aml', lawTitle, lawSummary]
      );

  const lawVersion = '2025.01';
  const lawText = 'All transfers above USD 1000 require travel rule disclosure.';
  const existingLawVersion = await pool.query(
    `SELECT id FROM law_versions WHERE law_id = $1 AND version = $2 LIMIT 1`,
    [lawRow.rows[0].id, lawVersion]
  );
  if (!existingLawVersion.rows[0]) {
    await pool.query(
      `INSERT INTO law_versions (law_id, version, effective_from, effective_to, text)
       VALUES ($1,$2,$3,$4,$5)`,
      [lawRow.rows[0].id, lawVersion, '2025-01-01', null, lawText]
    );
  }

  const bundleYaml = readFileSync(SEED_POLICY_FILE, 'utf-8');
  const bundle = parsePolicyBundle(bundleYaml);
  const existingBundle = await pool.query(
    `SELECT id FROM policy_bundles WHERE bundle_id = $1 AND version = $2 LIMIT 1`,
    [bundle.metadata.bundleId, bundle.metadata.version]
  );
  const bundleRow = existingBundle.rows[0]
    ? existingBundle
    : await pool.query(
        `INSERT INTO policy_bundles (bundle_id, version, status, yaml, bundle, signature, activated_at)
         VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id`,
        [bundle.metadata.bundleId, bundle.metadata.version, 'active', bundleYaml, bundle, null]
      );

  for (const rule of bundle.policies) {
    const effect = 'deny' in rule.effect ? 'deny' : 'require' in rule.effect ? 'require' : 'allow';
    const existingRule = await pool.query(
      `SELECT id FROM policy_rules WHERE bundle_id = $1 AND rule_id = $2 LIMIT 1`,
      [bundleRow.rows[0].id, rule.id]
    );
    if (!existingRule.rows[0]) {
      await pool.query(
        `INSERT INTO policy_rules (bundle_id, rule_id, priority, actions, effect, effect_detail)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [bundleRow.rows[0].id, rule.id, rule.priority, rule.appliesTo.actions, effect, rule.effect]
      );
    }
  }

  const subjectWallet = '0x0000000000000000000000000000000000000001';
  const subjectChain = '901';
  const subjectUser = 'user-1';
  const subjectRow = await pool.query(
    `SELECT id FROM compliance_subjects WHERE wallet_address = $1 AND chain_id = $2 AND user_id = $3 LIMIT 1`,
    [subjectWallet, subjectChain, subjectUser]
  );
  const ensuredSubject = subjectRow.rows[0]
    ? subjectRow
    : await pool.query(
        `INSERT INTO compliance_subjects (wallet_address, chain_id, user_id, residency_country, kyc_level)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [subjectWallet, subjectChain, subjectUser, 'US', '2']
      );

  const existingDecision = await pool.query(
    `SELECT id FROM compliance_decisions WHERE request_id = $1 LIMIT 1`,
    ['seed-request-1']
  );

  if (!existingDecision.rows[0]) {
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
      [ensuredSubject.rows[0].id, null, evidenceHash, evidenceArtifacts]
    );

    const decisionRow = await pool.query(
      `INSERT INTO compliance_decisions
       (request_id, subject_id, action, resource, context, decision, reasons, required_controls, disclosures, matched_rules, policy_bundle_id, evidence_bundle_id, attestation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (request_id) DO NOTHING
       RETURNING id`,
      [
        decisionInput.requestId,
        ensuredSubject.rows[0].id,
        decisionInput.action,
        decisionInput.resource,
        decisionInput.context,
        decision.decision,
        decision.reasons,
        decision.requiredControls,
        decision.disclosures,
        JSON.stringify(decision.matchedRules),
        bundleRow.rows[0].id,
        evidenceRow.rows[0].id,
        attestation
      ]
    );

    if (decisionRow.rows[0]) {
      await pool.query('UPDATE evidence_bundles SET decision_id = $1 WHERE id = $2', [decisionRow.rows[0].id, evidenceRow.rows[0].id]);
    } else {
      await pool.query('DELETE FROM evidence_bundles WHERE id = $1', [evidenceRow.rows[0].id]);
    }
  }

  const predictionSummary = 'Travel rule exposure rising in US AML updates.';
  const existingPrediction = await pool.query(
    `SELECT id FROM compliance_predictions WHERE jurisdiction = $1 AND topic = $2 AND summary = $3 LIMIT 1`,
    ['US', 'aml', predictionSummary]
  );
  if (!existingPrediction.rows[0]) {
    await pool.query(
      `INSERT INTO compliance_predictions (jurisdiction, topic, risk_delta, summary, features)
       VALUES ($1,$2,$3,$4,$5)`,
      ['US', 'aml', 0.42, predictionSummary, { keywords: ['travel', 'rule', 'transfer'] }]
    );
  }

  await pool.end();
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
