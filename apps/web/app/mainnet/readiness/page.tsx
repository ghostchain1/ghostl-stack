'use client';

import { useEffect, useState } from 'react';

type Readiness = {
  ok: boolean;
  constitution?: { path: string; exists: boolean; hash: string | null };
  governance?: {
    proposalId: string;
    approvalPath: string;
    approvalExists: boolean;
    quorumReached: boolean;
    allowDeploy: boolean;
    approvedAt: string | null;
    timelockExpiresAt: string | null;
    timelockExpired: boolean;
  };
  releaseManifest?: { path: string; exists: boolean; hash: string | null };
  attestation?: {
    signaturePath: string;
    signatureExists: boolean;
    publicKeyPath: string;
    publicKeyExists: boolean;
    verified: boolean;
  };
  onchain?: {
    rpcL1: string;
    mainnetLaunchGateAddress: string | null;
    releaseGateAddress: string | null;
    releaseGateAllowed: boolean;
    releaseGateError: string | null;
  };
  error?: string;
};

const pill = (ok: boolean) => ({
  display: 'inline-block',
  padding: '4px 8px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background: ok ? 'rgba(25,135,84,0.12)' : 'rgba(220,53,69,0.12)',
  color: ok ? '#198754' : '#dc3545'
});

export default function MainnetReadinessPage() {
  const [data, setData] = useState<Readiness | null>(null);

  useEffect(() => {
    fetch('/api/mainnet/readiness', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((error) => setData({ ok: false, error: String(error) }));
  }, []);

  const releaseReady = Boolean(
    data?.constitution?.exists &&
      data?.governance?.approvalExists &&
      data?.governance?.quorumReached &&
      data?.governance?.timelockExpired &&
      data?.releaseManifest?.exists &&
      data?.attestation?.verified &&
      data?.onchain?.releaseGateAllowed
  );

  return (
    <div className="content">
      <div className="card-grid">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="spread">
            <h2 style={{ margin: 0 }}>Mainnet Readiness</h2>
            <span style={pill(releaseReady)}>{releaseReady ? 'READY' : 'BLOCKED'}</span>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Constitutional lock status for mainnet deployment gate.
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Constitution</h3>
          <div>Path: {data?.constitution?.path || 'n/a'}</div>
          <div>Hash: {data?.constitution?.hash || 'n/a'}</div>
          <div style={pill(Boolean(data?.constitution?.exists))}>{data?.constitution?.exists ? 'present' : 'missing'}</div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Governance</h3>
          <div>Proposal: {data?.governance?.proposalId || 'n/a'}</div>
          <div>Approval file: {data?.governance?.approvalPath || 'n/a'}</div>
          <div>Quorum: {String(Boolean(data?.governance?.quorumReached))}</div>
          <div>Timelock expired: {String(Boolean(data?.governance?.timelockExpired))}</div>
          <div style={pill(Boolean(data?.governance?.approvalExists && data?.governance?.quorumReached && data?.governance?.timelockExpired))}>
            {data?.governance?.approvalExists ? 'verified' : 'missing'}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Release Manifest</h3>
          <div>Path: {data?.releaseManifest?.path || 'n/a'}</div>
          <div>Hash: {data?.releaseManifest?.hash || 'n/a'}</div>
          <div style={pill(Boolean(data?.releaseManifest?.exists))}>{data?.releaseManifest?.exists ? 'present' : 'missing'}</div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Attestation</h3>
          <div>Signature: {data?.attestation?.signaturePath || 'n/a'}</div>
          <div>Public key: {data?.attestation?.publicKeyPath || 'n/a'}</div>
          <div style={pill(Boolean(data?.attestation?.verified))}>{data?.attestation?.verified ? 'verified' : 'not verified'}</div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>On-chain Gate</h3>
          <div>RPC L1: {data?.onchain?.rpcL1 || 'n/a'}</div>
          <div>MainnetLaunchGate: {data?.onchain?.mainnetLaunchGateAddress || 'n/a'}</div>
          <div>ReleaseGate: {data?.onchain?.releaseGateAddress || 'n/a'}</div>
          <div>ReleaseGate allowed: {String(Boolean(data?.onchain?.releaseGateAllowed))}</div>
          {data?.onchain?.releaseGateError ? <div className="muted">Error: {data.onchain.releaseGateError}</div> : null}
        </div>
      </div>
    </div>
  );
}
