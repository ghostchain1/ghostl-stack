import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Evidence, Fix, Incident, Proposal } from '../types/hgop.js';

export type ChangeManifest = {
  version: string;
  generatedAt: string;
  proposalId: string;
  incident: Pick<Incident, 'incident_id' | 'env' | 'scope' | 'severity' | 'title' | 'status' | 'ts'>;
  proposal: Pick<Proposal, 'proposal_id' | 'status' | 'created_ts'>;
  fixes: Array<
    Pick<
      Fix,
      | 'fix_id'
      | 'rank'
      | 'description'
      | 'diff_summary'
      | 'risk_score'
      | 'blast_radius'
      | 'uncertainty'
      | 'expected_benefit'
      | 'required_gates'
      | 'score'
    >
  >;
};

export type EvidenceBundle = {
  version: string;
  generatedAt: string;
  proposalId: string;
  evidence: Array<Pick<Evidence, 'evidence_id' | 'kind' | 'uri' | 'sha256' | 'created_ts'>>;
};

export const sha256Hex = (input: string | Buffer) => crypto.createHash('sha256').update(input).digest('hex');

export async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function writeCmfBundle(rootDir: string, proposal: Proposal, incident: Incident, fixes: Fix[], evidence: Evidence[]) {
  const base = path.join(rootDir, 'CMF', proposal.proposal_id);
  const governanceDir = path.join(base, 'governance');

  const manifest: ChangeManifest = {
    version: 'hgop-cmf-v1',
    generatedAt: new Date().toISOString(),
    proposalId: proposal.proposal_id,
    incident: {
      incident_id: incident.incident_id,
      env: incident.env,
      scope: incident.scope,
      severity: incident.severity,
      title: incident.title,
      status: incident.status,
      ts: incident.ts
    },
    proposal: { proposal_id: proposal.proposal_id, status: proposal.status, created_ts: proposal.created_ts },
    fixes: fixes.map((f) => ({
      fix_id: f.fix_id,
      rank: f.rank,
      description: f.description,
      diff_summary: f.diff_summary,
      risk_score: f.risk_score,
      blast_radius: f.blast_radius,
      uncertainty: f.uncertainty,
      expected_benefit: f.expected_benefit,
      required_gates: f.required_gates,
      score: f.score
    }))
  };

  const evidenceBundle: EvidenceBundle = {
    version: 'hgop-evidence-v1',
    generatedAt: new Date().toISOString(),
    proposalId: proposal.proposal_id,
    evidence: evidence.map((e) => ({
      evidence_id: e.evidence_id,
      kind: e.kind,
      uri: e.uri,
      sha256: e.sha256,
      created_ts: e.created_ts
    }))
  };

  await writeJson(path.join(base, 'change-manifest.json'), manifest);
  await writeJson(path.join(base, 'evidence-bundle.json'), evidenceBundle);

  const manifestHash = sha256Hex(JSON.stringify(manifest));
  await writeJson(path.join(governanceDir, 'manifest_hash.json'), { manifestHash, algo: 'sha256' });

  return { baseDir: base, governanceDir, manifestHash };
}
