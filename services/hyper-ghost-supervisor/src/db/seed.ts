import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './sqlite.js';
import { runMigrations } from './migrate.js';
import type { HgEnv } from '../types/hgop.js';

const now = () => Math.floor(Date.now() / 1000);

const stableId = (prefix: string, suffix: string) => `${prefix}_${suffix}`;

export function seedDemo(dbPath: string, env: HgEnv) {
  const db = openDb(dbPath);
  const migrationsDir = path.join(process.cwd(), 'src/db/migrations');
  runMigrations(db, { migrationsDir });

  const has = db.prepare('SELECT COUNT(1) AS n FROM incidents').get() as any;
  if (Number(has?.n || 0) > 0) return { ok: true, skipped: true };

  const incident1 = {
    incident_id: stableId('inc', 'l3_finality_lag'),
    ts: now(),
    env,
    scope: 'rollup:l3',
    severity: 'P1',
    title: 'L3 rollup finality lag above threshold',
    status: 'open',
    symptoms_json: JSON.stringify({ metric: 'rollup_finality_lag', observed: 3000, threshold: 512 }),
    hypotheses_json: JSON.stringify([{ id: 'nonce_gap', detail: 'batcher txmanager nonce gap causing queued txs' }]),
    evidence_refs_json: JSON.stringify([{ kind: 'doctor', ref: 'infra/scripts/doctor-l3.sh' }])
  };
  const incident2 = {
    incident_id: stableId('inc', 'rpc_timeouts'),
    ts: now(),
    env,
    scope: 'rpc:l2',
    severity: 'P2',
    title: 'L2 RPC intermittently timing out',
    status: 'open',
    symptoms_json: JSON.stringify({ endpoints: ['L2_RPC_URL'], error: 'ETIMEDOUT' }),
    hypotheses_json: JSON.stringify([{ id: 'mapper_overload', detail: 'ghost-mapper latency during peak load' }]),
    evidence_refs_json: JSON.stringify([{ kind: 'log', ref: 'l2-geth logs' }])
  };
  const incident3 = {
    incident_id: stableId('inc', 'observability_gap'),
    ts: now(),
    env,
    scope: 'observability',
    severity: 'P3',
    title: 'Prometheus scrape failures for critical targets',
    status: 'mitigated',
    symptoms_json: JSON.stringify({ job: 'ai-monitor', up: 0 }),
    hypotheses_json: JSON.stringify([{ id: 'dns', detail: 'service name mismatch after compose changes' }]),
    evidence_refs_json: JSON.stringify([{ kind: 'prometheus', ref: 'up{job=\"ai-monitor\"}' }])
  };

  db.prepare(
    `INSERT INTO incidents (
      incident_id, ts, env, scope, severity, title, status, symptoms_json, hypotheses_json, evidence_refs_json
    ) VALUES (
      @incident_id, @ts, @env, @scope, @severity, @title, @status, @symptoms_json, @hypotheses_json, @evidence_refs_json
    )`
  ).run(incident1);
  db.prepare(
    `INSERT INTO incidents (
      incident_id, ts, env, scope, severity, title, status, symptoms_json, hypotheses_json, evidence_refs_json
    ) VALUES (
      @incident_id, @ts, @env, @scope, @severity, @title, @status, @symptoms_json, @hypotheses_json, @evidence_refs_json
    )`
  ).run(incident2);
  db.prepare(
    `INSERT INTO incidents (
      incident_id, ts, env, scope, severity, title, status, symptoms_json, hypotheses_json, evidence_refs_json
    ) VALUES (
      @incident_id, @ts, @env, @scope, @severity, @title, @status, @symptoms_json, @hypotheses_json, @evidence_refs_json
    )`
  ).run(incident3);

  const proposalId = stableId('prop', 'demo1');
  db.prepare(
    `INSERT INTO proposals (
      proposal_id, incident_id, created_ts, constraints_json, signatures_json, status
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    proposalId,
    incident1.incident_id,
    now(),
    JSON.stringify({ gates: { exec: false } }),
    JSON.stringify({}),
    'draft'
  );

  const fixes = [
    {
      fix_id: stableId('fix', 'restart_l3_batcher'),
      proposal_id: proposalId,
      rank: 1,
      description: 'Restart l3-op-batcher to clear transient txmgr stall',
      diff_summary: 'Operational action only (no code changes). Restart: opstack-l3-op-batcher-1',
      risk_score: 10,
      blast_radius: 'low',
      uncertainty: 15,
      expected_benefit: 55,
      rollback_plan_json: JSON.stringify({ steps: ['docker restart opstack-l3-op-batcher-1 (if needed)'] }),
      verification_steps_json: JSON.stringify([
        {
          kind: 'http',
          url: 'http://localhost:39546',
          method: 'POST',
          body: { jsonrpc: '2.0', id: 1, method: 'ghost_compat_syncStatus', params: [] }
        }
      ]),
      required_gates: 'devnet_exec',
      score: 55 - 10 - 0 - 15
    },
    {
      fix_id: stableId('fix', 'increase_batcher_gascap'),
      proposal_id: proposalId,
      rank: 2,
      description: 'Increase batcher fee cap to reduce tx replacement churn',
      diff_summary: 'Edit infra/opstack/docker-compose.l3.yml: bump OP_BATCHER txmgr fee caps',
      risk_score: 25,
      blast_radius: 'med',
      uncertainty: 30,
      expected_benefit: 60,
      rollback_plan_json: JSON.stringify({ steps: ['git revert', 'docker compose up -d --force-recreate l3-op-batcher'] }),
      verification_steps_json: JSON.stringify([{ kind: 'doctor', cmd: 'bash infra/scripts/doctor-l3.sh' }]),
      required_gates: 'proposal_only',
      score: 60 - 25 - 10 - 30
    },
    {
      fix_id: stableId('fix', 'investigate_nonce_gap'),
      proposal_id: proposalId,
      rank: 3,
      description: 'Investigate and remediate nonce gaps in parent L2 txpool for batcher address',
      diff_summary: 'Collect txpool_contentFrom for batcher address; fill missing nonces if safe (dev only)',
      risk_score: 40,
      blast_radius: 'high',
      uncertainty: 35,
      expected_benefit: 70,
      rollback_plan_json: JSON.stringify({ steps: ['stop remediation and restart batcher with fresh key (dev only)'] }),
      verification_steps_json: JSON.stringify([{ kind: 'rpc', method: 'txpool_contentFrom', chain: 'l2' }]),
      required_gates: 'devnet_exec',
      score: 70 - 40 - 25 - 35
    }
  ];

  const stmt = db.prepare(
    `INSERT INTO fixes (
      fix_id, proposal_id, rank, description, diff_summary, risk_score, blast_radius, uncertainty, expected_benefit,
      rollback_plan_json, verification_steps_json, required_gates, score
    ) VALUES (
      @fix_id, @proposal_id, @rank, @description, @diff_summary, @risk_score, @blast_radius, @uncertainty, @expected_benefit,
      @rollback_plan_json, @verification_steps_json, @required_gates, @score
    )`
  );
  for (const fix of fixes) stmt.run({ ...fix, rollback_plan_json: fix.rollback_plan_json, verification_steps_json: fix.verification_steps_json });

  return { ok: true, skipped: false, proposalId, incidentIds: [incident1.incident_id, incident2.incident_id, incident3.incident_id] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = process.env.HG_DB_PATH || process.env.HGOP_DB_PATH || './.data/incident.db';
  const envRaw = (process.env.HG_ENV || process.env.NET_ENV || 'devnet').toLowerCase();
  const env: HgEnv = envRaw === 'mainnet' ? 'mainnet' : envRaw === 'testnet' ? 'testnet' : 'devnet';
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const res = seedDemo(dbPath, env);
  console.log(JSON.stringify(res, null, 2));
}
