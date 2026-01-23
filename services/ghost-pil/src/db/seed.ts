import { readFileSync } from 'fs';
import path from 'path';
import { pool } from './index';
import { config, loadChains } from '../config';
import { buildSanctionsAdapter } from '../adapters/sanctions';
import { readdirSync } from 'fs';

type JurisdictionSeed = {
  code: string;
  name: string;
  region: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  regulatoryProfile: Record<string, number>;
};

type LegalSignalSeed = {
  jurisdictionCode: string;
  category: string;
  severity: string;
  confidence: number;
  detectedAt: string;
  summary: string;
  sourceRefs: string[];
};

const loadJson = <T>(filePath: string): T => JSON.parse(readFileSync(filePath, 'utf-8')) as T;

const migrationsPath = path.join(process.cwd(), 'src', 'db', 'migrations', '001_init.sql');
const validatorMigrationsPath = path.join(process.cwd(), 'src', 'db', 'migrations', '002_validator_economics.sql');

async function runMigrations() {
  const sql = readFileSync(migrationsPath, 'utf-8');
  await pool.query(sql);
  const validatorSql = readFileSync(validatorMigrationsPath, 'utf-8');
  await pool.query(validatorSql);
}

async function seedChains() {
  const chains = await loadChains();
  for (const chain of chains) {
    await pool.query(
      `INSERT INTO pil_chains (chain_id, chain_key, name, type, gas_token_symbol, rpc_url_ref)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (chain_id) DO UPDATE
       SET chain_key = EXCLUDED.chain_key,
           name = EXCLUDED.name,
           type = EXCLUDED.type,
           gas_token_symbol = EXCLUDED.gas_token_symbol,
           rpc_url_ref = EXCLUDED.rpc_url_ref,
           updated_at = NOW()` ,
      [chain.chainId, chain.key, chain.name, chain.type, chain.gasTokenSymbol, chain.rpcUrl]
    );
  }
}

async function seedJurisdictions() {
  const file = loadJson<{ jurisdictions: JurisdictionSeed[] }>(config.PIL_JURISDICTIONS_PATH);
  for (const jur of file.jurisdictions) {
    await pool.query(
      `INSERT INTO pil_jurisdictions (code, name, region, risk_tier, regulatory_profile)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           region = EXCLUDED.region,
           risk_tier = EXCLUDED.risk_tier,
           regulatory_profile = EXCLUDED.regulatory_profile,
           updated_at = NOW()` ,
      [jur.code, jur.name, jur.region, jur.riskTier, JSON.stringify(jur.regulatoryProfile)]
    );
  }
}

async function seedLegalSignals() {
  const file = loadJson<{ signals: LegalSignalSeed[] }>(config.PIL_LEGAL_SIGNALS_PATH);
  const nonSanctions = file.signals.filter(
    (signal) => !signal.category.toUpperCase().includes('SANCTION')
  );
  for (const signal of nonSanctions) {
    await pool.query(
      `INSERT INTO pil_legal_signals (jurisdiction_code, category, severity, confidence, detected_at, summary, source_refs)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING` ,
      [
        signal.jurisdictionCode,
        signal.category,
        signal.severity,
        signal.confidence,
        signal.detectedAt,
        signal.summary,
        JSON.stringify(signal.sourceRefs)
      ]
    );
  }

  const adapter = buildSanctionsAdapter();
  const sanctionsSignals = await adapter.listSignals();
  for (const signal of sanctionsSignals) {
    await pool.query(
      `INSERT INTO pil_legal_signals (jurisdiction_code, category, severity, confidence, detected_at, summary, source_refs)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING` ,
      [
        signal.jurisdictionCode,
        'SANCTIONS',
        signal.severity,
        signal.confidence,
        signal.detectedAt,
        signal.summary,
        JSON.stringify(signal.sourceRefs)
      ]
    );
  }
}

async function seedPolicyPack(chainId: number) {
  await pool.query(
    `INSERT INTO pil_policy_packs (id, jurisdiction_code, version, generated_by, confidence_score, effective_from, rules, source_refs, simulation_report, status)
     VALUES ('00000000-0000-0000-0000-000000000010', 'GLOBAL', 'v1', 'AI', 0.72, NOW(),
             $1, $2, $3, 'active')
     ON CONFLICT DO NOTHING`,
    [
      JSON.stringify([
        { type: 'SANCTIONS_BLOCK', actions: ['TRANSFER', 'BRIDGE'], severity: 'HIGH' },
        { type: 'AML_THRESHOLD_REQUIREMENT', actions: ['TRANSFER'], thresholdUsd: 10000 }
      ]),
      JSON.stringify(['FATF-UPDATE-2026-01']),
      JSON.stringify({ chainId, modelVersion: 'baseline-v1' })
    ]
  );
}

async function seedPolicyPacksFromFiles() {
  const baseDir = path.join(process.cwd(), 'config', 'policy-packs');
  let entries: string[] = [];
  try {
    entries = readdirSync(baseDir).filter((name) => name.endsWith('.json'));
  } catch {
    return;
  }

  for (const name of entries) {
    const pack = loadJson<{
      id: string;
      jurisdictionCode: string;
      version: string;
      generatedBy: string;
      confidenceScore: number;
      effectiveFrom: string;
      sunsetAt?: string | null;
      rules: unknown;
      sourceRefs: unknown;
      simulationReport: unknown;
      status: string;
    }>(path.join(baseDir, name));

    await pool.query(
      `INSERT INTO pil_policy_packs (id, jurisdiction_code, version, generated_by, confidence_score, effective_from, sunset_at, rules, source_refs, simulation_report, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (jurisdiction_code, version) DO UPDATE
       SET generated_by = EXCLUDED.generated_by,
           confidence_score = EXCLUDED.confidence_score,
           effective_from = EXCLUDED.effective_from,
           sunset_at = EXCLUDED.sunset_at,
           rules = EXCLUDED.rules,
           source_refs = EXCLUDED.source_refs,
           simulation_report = EXCLUDED.simulation_report,
           status = EXCLUDED.status`,
      [
        pack.id,
        pack.jurisdictionCode,
        pack.version,
        pack.generatedBy,
        pack.confidenceScore,
        pack.effectiveFrom,
        pack.sunsetAt || null,
        JSON.stringify(pack.rules),
        JSON.stringify(pack.sourceRefs),
        JSON.stringify(pack.simulationReport),
        pack.status
      ]
    );
  }
}

async function seedSimulation(chainId: number) {
  await pool.query(
    `INSERT INTO pil_sim_runs (id, chain_id, horizon, params_json, model_version, status)
     VALUES ('00000000-0000-0000-0000-000000000020', $1, '1h',
             $2, 'baseline-v1', 'completed')
     ON CONFLICT DO NOTHING`,
    [chainId, JSON.stringify({ gasLimitDelta: 0.1, feeDelta: 0.05 })]
  );
  await pool.query(
    `INSERT INTO pil_sim_results (run_id, throughput, predicted_fees, predicted_revert_rate, predicted_oog_rate, confidence, results_json)
     SELECT '00000000-0000-0000-0000-000000000020', 1250, 0.12, 0.02, 0.01, 0.71, $1
     WHERE NOT EXISTS (SELECT 1 FROM pil_sim_results WHERE run_id = '00000000-0000-0000-0000-000000000020')`,
    [JSON.stringify({ notes: 'Baseline replay with mild fee adjustments' })]
  );
}

async function seedRecommendation(chainId: number) {
  await pool.query(
    `INSERT INTO pil_recommendations (id, chain_id, recommendation_type, summary, rationale, risks, confidence, sim_run_ids, rollback_plan, required_approvals, status)
     VALUES ('00000000-0000-0000-0000-000000000030', $1, 'FEE_TUNING',
             'Increase base gas multiplier by 10%', 'Simulation shows lower OOG rate with minor fee impact',
             ARRAY['fee_pressure'], 0.68, ARRAY['00000000-0000-0000-0000-000000000020'], 'Revert to v1 policy pack', 1, 'DRAFT')
     ON CONFLICT DO NOTHING`,
    [chainId]
  );
}

async function seedAttestation() {
  await pool.query(
    `INSERT INTO pil_compliance_proofs (subject_hash, issuer_id, statement, proof_hash, jurisdiction_code, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      '0x4a1f3c2e6b1d74ac9e6b1b4d3a7e0a4f6c5b9d2c6a1e4f7b9c0d2e3f4a5b6c7d',
      'ghost-issuer-1',
      'KYC_APPROVED',
      '0x9d1b2f3a4c5e6d7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f',
      'GLOBAL',
      new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      'UNVERIFIED'
    ]
  );
}

async function seedValidators() {
  const validatorsRaw = loadJson<{ validators: Array<{ id: string; chainId: number; jurisdictionCode: string }> }>(
    config.PIL_VALIDATOR_CONFIG_PATH
  );
  for (const validator of validatorsRaw.validators) {
    await pool.query(
      `INSERT INTO pil_validator_scores (validator_id, chain_id, jurisdiction_code, score, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (validator_id, chain_id) DO UPDATE
       SET score = EXCLUDED.score,
           reason = EXCLUDED.reason,
           jurisdiction_code = EXCLUDED.jurisdiction_code,
           updated_at = NOW()` ,
      [validator.id, validator.chainId, validator.jurisdictionCode, 100, 'baseline']
    );
  }
}

async function run() {
  await runMigrations();
  if (!config.PIL_SEED_SAMPLE_DATA) return;
  await seedChains();
  await seedJurisdictions();
  await seedLegalSignals();
  const chainRows = await pool.query<{ chain_id: string }>('SELECT chain_id FROM pil_chains ORDER BY chain_id LIMIT 1');
  const chainId = chainRows.rows[0]?.chain_id ? Number(chainRows.rows[0].chain_id) : 0;
  if (chainId) {
    await seedPolicyPack(chainId);
    await seedSimulation(chainId);
    await seedRecommendation(chainId);
  }
  await seedPolicyPacksFromFiles();
  await seedAttestation();
  await seedValidators();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('ghost-pil seed failed', err);
    process.exit(1);
  });
