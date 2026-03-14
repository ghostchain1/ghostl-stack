'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { resolveApiBase } from '../../../lib/runtime';
import { apiRequest, formatApiError, type ApiError } from '../../../lib/api';
import { jsonWithCsrf } from '../../../lib/csrf';
import { normalizeRole, roleOrder } from '../../identity-access/access-policy';
import { useSession } from '../../identity-access/session';
import type { Contract, ContractCallStats } from '@ghostl/types/contracts';
import { ContractsRegistry } from './ContractsRegistry';
import { ContractDetailCard } from './ContractDetailCard';
import { AdminControls } from './AdminControls';
import { ExecutionAnalytics } from './ExecutionAnalytics';
import { DataFetchErrorCard } from '../../../components/DataFetchErrorCard';

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

type ContractsMeta = {
  registryCount?: number;
  localCount?: number;
  riskCount?: number;
  registryError?: string;
  riskError?: string;
};

const tabs = ['Registry', 'Tests', 'Formal', 'Diagrams', 'Deploy'] as const;

type Tab = (typeof tabs)[number];

export function ContractsConsole() {
  const { user } = useSession();
  const role = normalizeRole(user?.role);
  const isAdmin = roleOrder[role] >= roleOrder.ADMIN;
  const canReadContracts = roleOrder[role] >= roleOrder.READONLY;
  const [activeTab, setActiveTab] = useState<Tab>('Registry');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [contractsError, setContractsError] = useState<ApiError | null>(null);
  const [contractsMeta, setContractsMeta] = useState<ContractsMeta | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [tests, setTests] = useState<TestSummary>(null);
  const [testsError, setTestsError] = useState<ApiError | null>(null);
  const [formal, setFormal] = useState<FormalSummary>(null);
  const [formalError, setFormalError] = useState<ApiError | null>(null);
  const [diagrams, setDiagrams] = useState<DiagramFile[]>([]);
  const [diagramsError, setDiagramsError] = useState<ApiError | null>(null);
  const [diagramText, setDiagramText] = useState<Record<string, string>>({});
  const [diagramTextErrors, setDiagramTextErrors] = useState<Record<string, string>>({});
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
  const [seedLoading, setSeedLoading] = useState(false);
  const debugContracts = process.env.NEXT_PUBLIC_CONTRACTS_DEBUG === 'true';
  const formatStatus = (error: ApiError) => {
    const info = formatApiError(error);
    return `${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`;
  };

  useEffect(() => {
    const loadContracts = async (reason: 'load' | 'refresh') => {
      setContractsLoading(true);
      setContractsError(null);
      setContractsMeta(null);
      const cacheBuster = Date.now();
      const path = `/api/contracts?ts=${cacheBuster}`;
      if (debugContracts) {
        console.debug('[contracts] fetch:start', { reason, path, api: API_URL });
      }
      const result = await apiRequest<{ networks?: Contract[]; contracts?: Contract[]; meta?: Record<string, unknown> }>(
        path,
        { init: { cache: 'no-store', headers: { 'cache-control': 'no-store' } } }
      );
      if (!result.ok) {
        setContracts([]);
        setContractsError(result.error);
        setContractsLoading(false);
        if (debugContracts) {
          console.debug('[contracts] fetch:error', { reason, error: result.error });
        }
        return;
      }
      const nextContracts = (result.data.networks || result.data.contracts || []) as Contract[];
      setContracts(nextContracts);
      setContractsMeta((result.data.meta || {}) as ContractsMeta);
      setLastRefresh(new Date().toISOString());
      setContractsLoading(false);
      if (debugContracts) {
        console.debug('[contracts] fetch:success', {
          reason,
          count: nextContracts.length,
          meta: result.data.meta || {}
        });
      }
    };
    loadContracts('load');
  }, [debugContracts]);

  const refreshContracts = async () => {
    const cacheBuster = Date.now();
    setContractsLoading(true);
    setContractsError(null);
    setContractsMeta(null);
    const path = `/api/contracts?ts=${cacheBuster}`;
    if (debugContracts) {
      console.debug('[contracts] fetch:start', { reason: 'refresh', path, api: API_URL });
    }
    const result = await apiRequest<{ networks?: Contract[]; contracts?: Contract[]; meta?: Record<string, unknown> }>(
      path,
      { init: { cache: 'no-store', headers: { 'cache-control': 'no-store' } } }
    );
    if (!result.ok) {
      setContracts([]);
      setContractsError(result.error);
      setContractsLoading(false);
      if (debugContracts) {
        console.debug('[contracts] fetch:error', { reason: 'refresh', error: result.error });
      }
      return;
    }
    const nextContracts = (result.data.networks || result.data.contracts || []) as Contract[];
    setContracts(nextContracts);
    setContractsMeta((result.data.meta || {}) as ContractsMeta);
    setLastRefresh(new Date().toISOString());
    setContractsLoading(false);
    if (debugContracts) {
      console.debug('[contracts] fetch:success', {
        reason: 'refresh',
        count: nextContracts.length,
        meta: result.data.meta || {}
      });
    }
  };

  const seedRegistry = async () => {
    if (seedLoading) return;
    setSeedLoading(true);
    setStatus('Seeding registry...');
    try {
      const res = await apiRequest<{ registeredCount?: number; errors?: unknown[] }>('/api/contracts/seed', {
        init: { method: 'POST', headers: jsonWithCsrf() }
      });
      if (!res.ok) {
        setStatus(formatStatus(res.error));
        return;
      }
      const registeredCount = typeof res.data.registeredCount === 'number' ? res.data.registeredCount : 0;
      const errorCount = Array.isArray(res.data.errors) ? res.data.errors.length : 0;
      setStatus(`Seeded ${registeredCount} contracts${errorCount ? ` (${errorCount} skipped)` : ''}`);
      await refreshContracts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Seed failed';
      setStatus(message);
    } finally {
      setSeedLoading(false);
    }
  };

  const forceReload = () => {
    if (debugContracts) {
      console.debug('[contracts] force-reload');
    }
    window.location.reload();
  };

  useEffect(() => {
    let active = true;
    const loadReports = async () => {
      const [testsRes, formalRes, diagramsRes] = await Promise.all([
        apiRequest<{ summary?: TestSummary }>('/api/contracts/tests/summary'),
        apiRequest<{ summary?: FormalSummary }>('/api/contracts/formal/summary'),
        apiRequest<{ files?: DiagramFile[] }>('/api/contracts/diagrams')
      ]);
      if (!active) return;
      if (testsRes.ok) {
        setTests(testsRes.data.summary || null);
        setTestsError(null);
      } else {
        setTests(null);
        setTestsError(testsRes.error);
      }
      if (formalRes.ok) {
        setFormal(formalRes.data.summary || null);
        setFormalError(null);
      } else {
        setFormal(null);
        setFormalError(formalRes.error);
      }
      if (diagramsRes.ok) {
        setDiagrams((diagramsRes.data.files || []) as DiagramFile[]);
        setDiagramsError(null);
      } else {
        setDiagrams([]);
        setDiagramsError(diagramsRes.error);
      }
    };
    loadReports().catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!diagrams.length) return;
    const textExtensions = ['.mmd', '.md', '.dot'];
    const pending = diagrams.filter((file) => {
      if (!textExtensions.some((ext) => file.name.endsWith(ext))) return false;
      const hasText = Object.prototype.hasOwnProperty.call(diagramText, file.name);
      const hasError = Object.prototype.hasOwnProperty.call(diagramTextErrors, file.name);
      return !hasText && !hasError;
    });
    if (!pending.length) return;
    let cancelled = false;
    const loadText = async () => {
      await Promise.all(
        pending.map(async (file) => {
          try {
            const url = `${API_URL}/api/contracts/diagrams/${encodeURIComponent(file.name)}`;
            const res = await fetch(url, {
              credentials: 'include'
            });
            if (!res.ok) {
              const info = formatApiError({
                message: 'preview_failed',
                status: res.status,
                endpoint: url,
                method: 'GET'
              });
              throw new Error(`${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`);
            }
            const content = await res.text();
            if (cancelled) return;
            setDiagramText((prev) => ({ ...prev, [file.name]: content }));
          } catch (err) {
            if (cancelled) return;
            const message = err instanceof Error ? err.message : 'preview_failed';
            setDiagramTextErrors((prev) => ({ ...prev, [file.name]: message }));
          }
        })
      );
    };
    loadText();
    return () => {
      cancelled = true;
    };
  }, [diagrams, diagramText, diagramTextErrors]);

  useEffect(() => {
    if (!deployJob) return;
    const timer = setInterval(async () => {
      const result = await apiRequest<{ job: DeployJob; log: { text: string; nextOffset: number } }>(
        `/api/contracts/deploy/${deployJob.id}?offset=${deployOffset}`
      );
      if (!result.ok) {
        setStatus(formatStatus(result.error));
        return;
      }
      setDeployJob(result.data.job);
      if (result.data.log?.text) {
        setDeployLog((prev) => prev + result.data.log.text);
        setDeployOffset(result.data.log.nextOffset);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [deployJob, deployOffset]);

  const selectedContract = useMemo(() => contracts[0], [contracts]);
  const stats: ContractCallStats = { calls: 0, avgGas: 0, reverts: 0, timeRange: '24h' };

  const runTests = async (kind: string) => {
    setStatus('Starting tests...');
    const res = await apiRequest<{ job?: { id?: string } }>('/api/contracts/tests/run', {
      init: { method: 'POST', headers: jsonWithCsrf(), body: JSON.stringify({ kind }) }
    });
    if (!res.ok) {
      setStatus(formatStatus(res.error));
      return;
    }
    setStatus(`Tests running: ${res.data.job?.id || ''}`.trim());
  };

  const runFormal = async (tool: string) => {
    setStatus('Starting formal checks...');
    const res = await apiRequest<{ job?: { id?: string } }>('/api/contracts/formal/run', {
      init: { method: 'POST', headers: jsonWithCsrf(), body: JSON.stringify({ tool }) }
    });
    if (!res.ok) {
      setStatus(formatStatus(res.error));
      return;
    }
    setStatus(`Formal job running: ${res.data.job?.id || ''}`.trim());
  };

  const startDeploy = async () => {
    setStatus('Starting deploy job...');
    const res = await apiRequest<{ job?: DeployJob }>('/api/contracts/deploy', {
      init: { method: 'POST', headers: jsonWithCsrf(), body: JSON.stringify(deployForm) }
    });
    if (!res.ok) {
      setStatus(formatStatus(res.error));
      return;
    }
    setDeployJob(res.data.job || null);
    setDeployLog('');
    setDeployOffset(0);
    setStatus('Deploy started');
  };

  const renderRegistry = () => (
    <div className="card-grid">
      {!canReadContracts && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Contracts</div>
          <div className="muted">Your role does not have permission to view contracts.</div>
        </div>
      )}
      {canReadContracts && contractsError && (
        <DataFetchErrorCard title="Contracts registry" error={contractsError} />
      )}
      {canReadContracts && contractsLoading && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Contracts</div>
          <div className="muted">Loading latest contracts...</div>
        </div>
      )}
      {canReadContracts && !contractsLoading && !contractsError && !contracts.length && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Registry empty</div>
          <div className="muted" style={{ marginBottom: isAdmin ? 8 : 0 }}>
            No contracts registered.
          </div>
          {contractsMeta && (
            <div className="stack" style={{ gap: 4, marginBottom: isAdmin ? 8 : 0 }}>
              {contractsMeta.registryError && <div className="muted">Registry error: {contractsMeta.registryError}</div>}
              {contractsMeta.riskError && <div className="muted">Risk service error: {contractsMeta.riskError}</div>}
              <div className="muted">
                Registry count: {contractsMeta.registryCount ?? 0} | Local count: {contractsMeta.localCount ?? 0} | Risk count:{' '}
                {contractsMeta.riskCount ?? 0}
              </div>
              <div className="muted">Fix: deploy contracts or run seed to register deployments.</div>
            </div>
          )}
          {isAdmin && (
            <button className="button" type="button" onClick={seedRegistry} disabled={seedLoading}>
              {seedLoading ? 'Seeding...' : 'Seed registry'}
            </button>
          )}
        </div>
      )}
      {canReadContracts && !contractsLoading && !contractsError && contracts.length > 0 && (
        <ContractsRegistry contracts={contracts} />
      )}
      {canReadContracts && selectedContract && <ContractDetailCard contract={selectedContract} stats={stats} />}
      {canReadContracts && <AdminControls actions={[{ label: 'Pause', action: 'pause', enabled: true }]} />}
      {canReadContracts && <ExecutionAnalytics stats={stats} />}
    </div>
  );

  const renderTests = () => (
    <div className="card-grid">
      {testsError && <DataFetchErrorCard title="Foundry test summary" error={testsError} />}
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
      {formalError && <DataFetchErrorCard title="Formal checks summary" error={formalError} />}
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
      {diagramsError && <DataFetchErrorCard title="Contract diagrams" error={diagramsError} />}
      {diagrams.map((file) => {
        const isImage = file.name.endsWith('.svg') || file.name.endsWith('.png');
        const isText = file.name.endsWith('.mmd') || file.name.endsWith('.md') || file.name.endsWith('.dot');
        const href = `${API_URL}/api/contracts/diagrams/${encodeURIComponent(file.name)}`;
        const preview = diagramText[file.name];
        const error = diagramTextErrors[file.name];
        const snippet = preview && preview.length > 6000 ? `${preview.slice(0, 6000)}\n...` : preview;
        return (
          <div key={file.name} className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{file.name}</div>
            {isImage && (
              <Image
                alt={file.name}
                src={href}
                loader={({ src }) => src}
                unoptimized
                width={1200}
                height={800}
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            )}
            {!isImage && isText && (
              <pre className="code-preview">{snippet || (error ? `Preview failed: ${error}` : 'Loading preview...')}</pre>
            )}
            {!isImage && !isText && <div className="muted">Preview not available</div>}
            <a className="button secondary" href={href} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
        );
      })}
      {!diagrams.length && !diagramsError && <div className="muted">No diagrams available.</div>}
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
        <button className="button secondary" onClick={refreshContracts}>Refresh</button>
        <button className="button secondary" onClick={forceReload}>Force reload</button>
        {lastRefresh && <span className="muted">Last refresh: {lastRefresh}</span>}
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
