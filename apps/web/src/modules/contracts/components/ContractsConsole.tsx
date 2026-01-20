'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveApiBase } from '../../../lib/runtime';
import { jsonWithCsrf } from '../../../lib/csrf';
import { normalizeRole, roleOrder } from '../../identity-access/access-policy';
import { useSession } from '../../identity-access/session';
import type { Contract, ContractCallStats } from '@ghostl/types/contracts';
import { ContractsRegistry } from './ContractsRegistry';
import { ContractDetailCard } from './ContractDetailCard';
import { AdminControls } from './AdminControls';
import { ExecutionAnalytics } from './ExecutionAnalytics';

const API_URL = resolveApiBase();

type TestSummary = { status?: string; updatedAt?: string; mode?: string } | null;

type FormalSummary = { tool?: string; status?: string; issues?: number | null; updatedAt?: string } | null;

type DiagramFile = { name: string; path: string };

type DeployJob = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
};

const tabs = ['Registry', 'Tests', 'Formal', 'Diagrams', 'Deploy'] as const;

type Tab = (typeof tabs)[number];

export function ContractsConsole() {
  const { user } = useSession();
  const role = normalizeRole(user?.role);
  const isAdmin = roleOrder[role] >= roleOrder.ADMIN;
  const [activeTab, setActiveTab] = useState<Tab>('Registry');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [tests, setTests] = useState<TestSummary>(null);
  const [formal, setFormal] = useState<FormalSummary>(null);
  const [diagrams, setDiagrams] = useState<DiagramFile[]>([]);
  const [deployForm, setDeployForm] = useState({
    layer: 'all',
    network: 'ghostl2',
    rpc: '',
    deployerKeyEnv: 'DEPLOYER_PRIVATE_KEY'
  });
  const [deployJob, setDeployJob] = useState<DeployJob | null>(null);
  const [deployLog, setDeployLog] = useState('');
  const [deployOffset, setDeployOffset] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/contracts`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setContracts((data.networks || []) as Contract[]))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/contracts/tests/summary`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setTests(data.summary || null))
      .catch(() => undefined);
    fetch(`${API_URL}/api/contracts/formal/summary`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setFormal(data.summary || null))
      .catch(() => undefined);
    fetch(`${API_URL}/api/contracts/diagrams`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setDiagrams((data.files || []) as DiagramFile[]))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!deployJob) return;
    const timer = setInterval(async () => {
      const res = await fetch(
        `${API_URL}/api/contracts/deploy/${deployJob.id}?offset=${deployOffset}`,
        { credentials: 'include' }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { job: DeployJob; log: { text: string; nextOffset: number } };
      setDeployJob(data.job);
      if (data.log?.text) {
        setDeployLog((prev) => prev + data.log.text);
        setDeployOffset(data.log.nextOffset);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [deployJob, deployOffset]);

  const selectedContract = useMemo(() => contracts[0], [contracts]);
  const stats: ContractCallStats = { calls: 0, avgGas: 0, reverts: 0, timeRange: '24h' };

  const runTests = async (kind: string) => {
    setStatus('Starting tests...');
    const res = await fetch(`${API_URL}/api/contracts/tests/run`, {
      method: 'POST',
      headers: jsonWithCsrf(),
      credentials: 'include',
      body: JSON.stringify({ kind })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || 'Failed to run tests');
      return;
    }
    setStatus(`Tests running: ${data.job?.id || ''}`.trim());
  };

  const runFormal = async (tool: string) => {
    setStatus('Starting formal checks...');
    const res = await fetch(`${API_URL}/api/contracts/formal/run`, {
      method: 'POST',
      headers: jsonWithCsrf(),
      credentials: 'include',
      body: JSON.stringify({ tool })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || 'Failed to run formal checks');
      return;
    }
    setStatus(`Formal job running: ${data.job?.id || ''}`.trim());
  };

  const startDeploy = async () => {
    setStatus('Starting deploy job...');
    const res = await fetch(`${API_URL}/api/contracts/deploy`, {
      method: 'POST',
      headers: jsonWithCsrf(),
      credentials: 'include',
      body: JSON.stringify(deployForm)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || 'Deploy failed to start');
      return;
    }
    setDeployJob(data.job);
    setDeployLog('');
    setDeployOffset(0);
    setStatus('Deploy started');
  };

  const renderRegistry = () => (
    <div className="card-grid">
      <ContractsRegistry contracts={contracts} />
      {selectedContract && <ContractDetailCard contract={selectedContract} stats={stats} />}
      <AdminControls actions={[{ label: 'Pause', action: 'pause', enabled: true }]} />
      <ExecutionAnalytics stats={stats} />
    </div>
  );

  const renderTests = () => (
    <div className="card-grid">
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Foundry test summary</div>
        <div className="stack">
          <div className="spread"><span className="muted">Status</span><span>{tests?.status || 'n/a'}</span></div>
          <div className="spread"><span className="muted">Mode</span><span>{tests?.mode || 'default'}</span></div>
          <div className="spread"><span className="muted">Updated</span><span>{tests?.updatedAt || 'n/a'}</span></div>
        </div>
        {isAdmin && (
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="button" onClick={() => runTests('foundry')}>Run tests</button>
            <button className="button secondary" onClick={() => runTests('fuzz')}>Fuzz</button>
            <button className="button secondary" onClick={() => runTests('invariant')}>Invariants</button>
          </div>
        )}
      </div>
    </div>
  );

  const renderFormal = () => (
    <div className="card-grid">
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Formal checks</div>
        <div className="stack">
          <div className="spread"><span className="muted">Tool</span><span>{formal?.tool || 'n/a'}</span></div>
          <div className="spread"><span className="muted">Status</span><span>{formal?.status || 'n/a'}</span></div>
          <div className="spread"><span className="muted">Issues</span><span>{formal?.issues ?? 'n/a'}</span></div>
          <div className="spread"><span className="muted">Updated</span><span>{formal?.updatedAt || 'n/a'}</span></div>
        </div>
        {isAdmin && (
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="button" onClick={() => runFormal('slither')}>Slither</button>
            <button className="button secondary" onClick={() => runFormal('scribble')}>Scribble</button>
            <button className="button secondary" onClick={() => runFormal('echidna')}>Echidna</button>
          </div>
        )}
        <div className="muted" style={{ marginTop: 8 }}>
          Specs: /contracts/formal/*
        </div>
      </div>
    </div>
  );

  const renderDiagrams = () => (
    <div className="card-grid">
      {diagrams.map((file) => {
        const isImage = file.name.endsWith('.svg') || file.name.endsWith('.png');
        const href = `${API_URL}/api/contracts/diagrams/${encodeURIComponent(file.name)}`;
        return (
          <div key={file.name} className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{file.name}</div>
            {isImage ? <img src={href} alt={file.name} style={{ maxWidth: '100%' }} /> : <div className="muted">Preview not available</div>}
            <a className="button secondary" href={href} target="_blank" rel="noreferrer">Open</a>
          </div>
        );
      })}
      {!diagrams.length && <div className="muted">No diagrams available.</div>}
    </div>
  );

  const renderDeploy = () => (
    <div className="card-grid">
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>One-click deploy</div>
        <div className="stack">
          <label className="muted">Layer</label>
          <select value={deployForm.layer} onChange={(e) => setDeployForm({ ...deployForm, layer: e.target.value })}>
            <option value="l1">L1</option>
            <option value="l2">L2</option>
            <option value="l3">L3</option>
            <option value="all">All</option>
          </select>
          <label className="muted">Network</label>
          <input value={deployForm.network} onChange={(e) => setDeployForm({ ...deployForm, network: e.target.value })} />
          <label className="muted">RPC override (optional)</label>
          <input value={deployForm.rpc} onChange={(e) => setDeployForm({ ...deployForm, rpc: e.target.value })} />
          <label className="muted">Deployer key env var</label>
          <input value={deployForm.deployerKeyEnv} onChange={(e) => setDeployForm({ ...deployForm, deployerKeyEnv: e.target.value })} />
          {isAdmin ? (
            <button className="button" onClick={startDeploy}>Start deploy</button>
          ) : (
            <div className="muted">Admin role required to deploy.</div>
          )}
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Deploy logs</div>
        {deployJob ? (
          <div className="stack">
            <div className="spread"><span className="muted">Job</span><span>{deployJob.id}</span></div>
            <div className="spread"><span className="muted">Status</span><span>{deployJob.status}</span></div>
            <pre style={{ maxHeight: 320, overflow: 'auto' }}>{deployLog || 'Waiting for logs...'}</pre>
          </div>
        ) : (
          <div className="muted">No deployment running.</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="content">
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`button ${activeTab === tab ? '' : 'secondary'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {status && <div className="muted" style={{ marginBottom: 12 }}>{status}</div>}
      {activeTab === 'Registry' && renderRegistry()}
      {activeTab === 'Tests' && renderTests()}
      {activeTab === 'Formal' && renderFormal()}
      {activeTab === 'Diagrams' && renderDiagrams()}
      {activeTab === 'Deploy' && renderDeploy()}
    </div>
  );
}
