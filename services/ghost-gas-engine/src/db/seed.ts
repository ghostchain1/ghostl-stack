import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { pool } from './index.js';
import { loadChains, loadPolicies } from '../config.js';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'db', 'migrations');

const seedDeploymentId = '00000000-0000-0000-0000-000000000001';
const seedAttemptId = '00000000-0000-0000-0000-000000000002';
const seedSimulationId = '00000000-0000-0000-0000-000000000003';
const seedDecisionId = '00000000-0000-0000-0000-000000000004';
const seedForecastId = '00000000-0000-0000-0000-000000000005';
const seedPolicyHistoryId = '00000000-0000-0000-0000-000000000006';
const seedDriftId = '00000000-0000-0000-0000-000000000007';
const seedPreventedId = '00000000-0000-0000-0000-000000000008';
const seedObservationId = '00000000-0000-0000-0000-000000000009';
const seedPredictionId = '00000000-0000-0000-0000-000000000010';
const seedAiDecisionId = '00000000-0000-0000-0000-000000000011';
const seedAiActionId = '00000000-0000-0000-0000-000000000012';
const seedGovId = '00000000-0000-0000-0000-000000000013';

const run = async () => {
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  for (const file of migrationFiles) {
    const migration = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query(migration);
  }

  const chains = loadChains();
  const policies = loadPolicies();

  for (const chain of chains) {
    await pool.query(
      `INSERT INTO gas_chains (chain_key, chain_id, chain_name, chain_type, rpc_url, gas_token_symbol)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (chain_key) DO UPDATE
       SET chain_id = EXCLUDED.chain_id,
           chain_name = EXCLUDED.chain_name,
           chain_type = EXCLUDED.chain_type,
           rpc_url = EXCLUDED.rpc_url,
           gas_token_symbol = EXCLUDED.gas_token_symbol`,
      [chain.key, chain.chainId, chain.name, chain.type, chain.rpcUrl, chain.gasTokenSymbol]
    );
  }

  for (const policy of policies) {
    await pool.query('UPDATE gas_policies SET active = false WHERE chain_key = $1 AND version <> $2', [
      policy.chainKey,
      policy.version
    ]);
    await pool.query(
      `INSERT INTO gas_policies (chain_key, version, policy, active)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (chain_key, version) DO UPDATE SET policy = EXCLUDED.policy, active = EXCLUDED.active`,
      [policy.chainKey, policy.version, policy]
    );
  }

  if (process.env.SEED_SAMPLE_DATA !== 'false') {
    await pool.query(
      `INSERT INTO gas_simulations (id, chain_key, tx_request, estimated_gas, recommended_gas_limit, block_gas_limit, margin_percent, failure_reason, rpc_namespace)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedSimulationId,
        'l1',
        { from: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', to: '0x0000000000000000000000000000000000000000', value: '0x0' },
        210000,
        336000,
        30000000,
        20,
        null,
        'eth'
      ]
    );

    await pool.query(
      `INSERT INTO gas_deployments (id, chain_key, name, status)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO NOTHING`,
      [seedDeploymentId, 'l1', 'Seed deployment', 'success']
    );

    await pool.query(
      `INSERT INTO gas_deployment_attempts
       (id, deployment_id, decision_id, attempt, tx_hash, nonce, gas_limit, gas_price, status, classification, gas_used)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedAttemptId,
        seedDeploymentId,
        seedDecisionId,
        1,
        '0xseededtransactionhash000000000000000000000000000000000000000000000000000001',
        1,
        336000,
        1000000000,
        'success',
        'CHAIN_OK',
        210000
      ]
    );

    await pool.query(
      `INSERT INTO gas_tx_receipts (tx_hash, receipt, status, gas_used, effective_gas_price, block_number)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        '0xseededtransactionhash000000000000000000000000000000000000000000000000000001',
        { status: '0x1', gasUsed: '0x33450', blockNumber: '0x1' },
        1,
        210000,
        1000000000,
        1
      ]
    );

    await pool.query(
      `INSERT INTO gas_autonomy_decisions
       (id, deployment_id, chain_key, mode, action, status, risk_score, predicted_success, predicted_gas_used, selected_gas_limit, selected_max_retries, rationale, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedDecisionId,
        seedDeploymentId,
        'l1',
        'AUTONOMOUS',
        'submit',
        'executed',
        0.12,
        0.88,
        210000,
        336000,
        3,
        { reasons: ['history_stable', 'low_congestion'] },
        0.81
      ]
    );

    await pool.query(
      `INSERT INTO gas_autonomy_events (chain_key, event_type, payload)
       VALUES ($1,$2,$3)`,
      ['l1', 'decide', { decisionId: seedDecisionId, note: 'seed decision' }]
    );

    await pool.query(
      `INSERT INTO gas_risk_forecasts
       (id, chain_key, risk_score, predicted_failure_probability, failure_types, confidence, features)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedForecastId,
        'l1',
        0.18,
        0.18,
        ['out_of_gas'],
        0.74,
        { congestion: 0.2, failureRate: 0.1 }
      ]
    );

    await pool.query(
      `INSERT INTO gas_policy_history
       (id, chain_key, version, policy, applied_by, status, metrics)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedPolicyHistoryId,
        'l1',
        '2026.01.23-seed',
        { baseMultiplier: 1.6, safetyMarginPercent: 20 },
        'agent',
        'active',
        { successRate: 0.9 }
      ]
    );

    await pool.query(
      `INSERT INTO gas_policy_drift
       (id, chain_key, base_multiplier, safety_margin_percent, retry_multiplier_step, reason)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [seedDriftId, 'l1', 1.6, 20, 1.25, 'seed baseline']
    );

    await pool.query(
      `INSERT INTO gas_prevented_failures
       (id, chain_key, failure_type, risk_score, action, reason)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [seedPreventedId, 'l1', 'out_of_gas', 0.72, 'blocked', 'risk_threshold_exceeded']
    );

    await pool.query(
      `INSERT INTO ai_chain_observations
       (id, chain_key, block_number, gas_limit, gas_used, base_fee, block_time, rpc_latency_ms, rpc_namespace, success, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedObservationId,
        'l1',
        1,
        30000000,
        4500000,
        1000000000,
        new Date().toISOString(),
        42,
        'eth',
        true,
        null
      ]
    );

    await pool.query(
      `INSERT INTO ai_risk_predictions
       (id, chain_key, risk_score, predicted_failure_probability, confidence, time_horizon_seconds, affected_subsystem, recommended_action, features)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedPredictionId,
        'l1',
        0.22,
        0.22,
        0.78,
        120,
        'execution',
        'ALLOW',
        { failureRate: 0.1, congestion: 0.2 }
      ]
    );

    await pool.query(
      `INSERT INTO ai_core_decisions
       (id, chain_key, mode, action, status, risk_score, confidence, forecast_id, deployment_id, rationale)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedAiDecisionId,
        'l1',
        'AUTONOMOUS',
        'ALLOW',
        'executed',
        0.22,
        0.78,
        seedPredictionId,
        seedDeploymentId,
        { note: 'seed decision' }
      ]
    );

    await pool.query(
      `INSERT INTO ai_core_actions
       (id, decision_id, chain_key, action_type, status, payload)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [seedAiActionId, seedAiDecisionId, 'l1', 'ALLOW', 'executed', { note: 'seed action' }]
    );

    await pool.query(
      `INSERT INTO ai_failure_fingerprints
       (fingerprint, chain_key, classification, error_signature, occurrences)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (fingerprint) DO NOTHING`,
      ['seed-fingerprint', 'l1', 'OUT_OF_GAS', 'seed', 3]
    );

    await pool.query(
      `INSERT INTO ai_suppression_rules
       (fingerprint, chain_key, active, reason)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      ['seed-fingerprint', 'l1', true, 'seed suppression']
    );

    await pool.query(
      `INSERT INTO ai_governance_recommendations
       (id, chain_key, category, severity, summary, recommendation, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedGovId,
        'l1',
        'execution-risk',
        'medium',
        'Seed recommendation',
        'Review gas policy baselines.',
        'open'
      ]
    );

    await pool.query(
      `INSERT INTO ai_policy_constraints
       (chain_key, max_risk, max_gas_limit, max_retries, allowed_actions)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING`,
      ['l1', 0.75, 30000000, 5, ['ALLOW', 'MODIFY', 'RETRY']]
    );

    await pool.query(
      `INSERT INTO ai_core_events (chain_key, module, event_type, payload)
       VALUES ($1,$2,$3,$4)`,
      ['l1', 'observe', 'seed_event', { note: 'seed ai core event' }]
    );
  }

  await pool.end();
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
