'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { resolveApiBase } from '../../lib/runtime';

type ChainRef = 'l1' | 'l2' | 'l3';

type Endpoint = {
  id: string;
  chainId?: string;
  chainName?: string;
  layer?: string;
  url: string;
  status: 'healthy' | 'degraded' | 'down';
};

type TxIntel = {
  txHash: string;
  chain: ChainRef;
  classification: string;
  anomalies: string[];
  riskScore: number;
  explainability: { confidence: number; reasoning: string; dataRefs: Record<string, string | number | null> };
};

type WalletIntel = {
  address: string;
  chain: ChainRef;
  profile: {
    balance: string;
    nonce: number;
    isContract: boolean;
    recentTxs: number;
    relatedWallets: string[];
    phishingRisk: boolean;
    riskScore: number;
  };
  explainability: { confidence: number; reasoning: string; dataRefs: Record<string, string | number | null> };
};

type ContractIntel = {
  address: string;
  chain: ChainRef;
  risk: number;
  findings: string[];
  explainability: { confidence: number; reasoning: string; dataRefs: Record<string, string | number | null> };
};

type NetworkIntel = {
  chain: ChainRef;
  avgBlockTimeSec: number;
  lastBlockAgeSec: number;
  stalled: boolean;
  status: string;
  explainability: { confidence: number; reasoning: string; dataRefs: Record<string, string | number | null> };
};

type BridgeIntel = {
  chain: ChainRef;
  flows: Array<{
    addresses: string[];
    totalEvents: number;
    lastEventBlock: number | null;
    delaySec: number | null;
    stuck: boolean;
    fraudLikelihood: number;
  }>;
  explainability: { confidence: number; reasoning: string; dataRefs: Record<string, string | number | null> };
};

type GovernanceIntel = {
  chain: ChainRef;
  proposals: Array<{ txHash: string; blockNumber: number; topic0: string }>;
  explainability: { confidence: number; reasoning: string; dataRefs: Record<string, string | number | null> };
};

type Forecasting = {
  chain: ChainRef;
  forecasts: Array<{ metric: string; horizon: string; value: number; confidence: number }>;
  explainability: { confidence: number; reasoning: string; dataRefs: Record<string, string | number | null> };
};

const API_URL = resolveApiBase();

export function AiCommandCenter() {
  const [chain, setChain] = useState<ChainRef>('l2');
  const [txHash, setTxHash] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [status, setStatus] = useState('');
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [txIntel, setTxIntel] = useState<TxIntel | null>(null);
  const [walletIntel, setWalletIntel] = useState<WalletIntel | null>(null);
  const [contractIntel, setContractIntel] = useState<ContractIntel | null>(null);
  const [networkIntel, setNetworkIntel] = useState<NetworkIntel[]>([]);
  const [bridgeIntel, setBridgeIntel] = useState<BridgeIntel | null>(null);
  const [governanceIntel, setGovernanceIntel] = useState<GovernanceIntel | null>(null);
  const [forecasting, setForecasting] = useState<Forecasting | null>(null);

  const chainEndpoints = useMemo(
    () => endpoints.filter((e) => (e.layer || '').toLowerCase() === chain),
    [endpoints, chain]
  );

  const loadEndpoints = async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/rpc`, { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as Endpoint[];
      setEndpoints(data);
    } catch {
      setEndpoints([]);
    }
  };

  useEffect(() => {
    loadEndpoints().catch(() => undefined);
    const timer = setInterval(() => {
      loadEndpoints().catch(() => undefined);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const runTxIntel = async () => {
    if (!txHash) return;
    setStatus('Running transaction intelligence...');
    try {
      const res = await fetch(`${API_URL}/ai/tx-intel?chain=${chain}&txHash=${txHash}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TxIntel;
      setTxIntel(data);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    }
  };

  const runWalletIntel = async () => {
    if (!walletAddress) return;
    setStatus('Running wallet intelligence...');
    try {
      const res = await fetch(`${API_URL}/ai/wallet-intel?chain=${chain}&address=${walletAddress}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as WalletIntel;
      setWalletIntel(data);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    }
  };

  const runContractIntel = async () => {
    if (!contractAddress) return;
    setStatus('Running contract intelligence...');
    try {
      const res = await fetch(`${API_URL}/ai/contract-intel?chain=${chain}&address=${contractAddress}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ContractIntel;
      setContractIntel(data);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    }
  };

  const runNetworkIntel = async () => {
    setStatus('Running network intelligence...');
    try {
      const res = await fetch(`${API_URL}/ai/network-intel?chain=${chain}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { status: NetworkIntel[] };
      setNetworkIntel(data.status || []);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    }
  };

  const runBridgeIntel = async () => {
    setStatus('Running bridge intelligence...');
    try {
      const res = await fetch(`${API_URL}/ai/bridge-intel?chain=${chain}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BridgeIntel;
      setBridgeIntel(data);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    }
  };

  const runGovernanceIntel = async () => {
    setStatus('Running governance intelligence...');
    try {
      const res = await fetch(`${API_URL}/ai/governance-intel?chain=${chain}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GovernanceIntel;
      setGovernanceIntel(data);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    }
  };

  const runForecasting = async () => {
    setStatus('Running forecasts...');
    try {
      const res = await fetch(`${API_URL}/ai/forecasting?chain=${chain}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Forecasting;
      setForecasting(data);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="AI Command Center" subtitle="GhostChain L1, GhostL2, GhostL3">
          {status && <div className="muted">{status}</div>}
          <div className="row">
            <label className="muted">Chain</label>
            <select className="input" value={chain} onChange={(e) => setChain(e.target.value as ChainRef)}>
              <option value="l1">GhostChain (L1)</option>
              <option value="l2">GhostL2 (L2)</option>
              <option value="l3">GhostL3 (L3)</option>
            </select>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {chainEndpoints.map((endpoint) => (
              <div key={endpoint.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div>{endpoint.chainName || endpoint.chainId}</div>
                  <div className="muted">{endpoint.url}</div>
                </div>
                <Badge>{endpoint.status}</Badge>
              </div>
            ))}
            {!chainEndpoints.length && <div className="muted">No RPC endpoints available.</div>}
          </div>
        </Card>
        <Card title="Transaction Intelligence" subtitle="Classify and score a transaction">
          <input className="input" placeholder="0x transaction hash" value={txHash} onChange={(e) => setTxHash(e.target.value)} />
          <Button onClick={runTxIntel}>Analyze</Button>
          {txIntel && (
            <div className="stack">
              <div className="row">
                <Badge>{txIntel.classification}</Badge>
                <Badge>risk {Math.round(txIntel.riskScore * 100)}%</Badge>
              </div>
              <div className="muted">Anomalies: {txIntel.anomalies.join(', ') || 'none'}</div>
              <div className="muted">Reasoning: {txIntel.explainability.reasoning}</div>
              <div className="muted">Confidence: {(txIntel.explainability.confidence * 100).toFixed(0)}%</div>
            </div>
          )}
        </Card>
        <Card title="Wallet Intelligence" subtitle="Profile a wallet">
          <input className="input" placeholder="0x wallet address" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} />
          <Button onClick={runWalletIntel}>Analyze</Button>
          {walletIntel && (
            <div className="stack">
              <div className="row">
                <Badge>{walletIntel.profile.isContract ? 'contract' : 'wallet'}</Badge>
                <Badge>risk {Math.round(walletIntel.profile.riskScore * 100)}%</Badge>
              </div>
              <div className="muted">Balance: {walletIntel.profile.balance}</div>
              <div className="muted">Recent txs: {walletIntel.profile.recentTxs}</div>
              <div className="muted">Reasoning: {walletIntel.explainability.reasoning}</div>
              <div className="muted">Confidence: {(walletIntel.explainability.confidence * 100).toFixed(0)}%</div>
            </div>
          )}
        </Card>
        <Card title="Contract Intelligence" subtitle="Scan a contract bytecode">
          <input className="input" placeholder="0x contract address" value={contractAddress} onChange={(e) => setContractAddress(e.target.value)} />
          <Button onClick={runContractIntel}>Analyze</Button>
          {contractIntel && (
            <div className="stack">
              <div className="row">
                <Badge>risk {Math.round(contractIntel.risk * 100)}%</Badge>
              </div>
              <div className="muted">Findings: {contractIntel.findings.join(', ')}</div>
              <div className="muted">Reasoning: {contractIntel.explainability.reasoning}</div>
              <div className="muted">Confidence: {(contractIntel.explainability.confidence * 100).toFixed(0)}%</div>
            </div>
          )}
        </Card>
      </div>
      <div className="card-grid">
        <Card title="Network & Validator Intelligence" subtitle="Chain health and sequencer signals">
          <Button onClick={runNetworkIntel}>Refresh</Button>
          <div className="stack">
            {networkIntel.map((entry) => (
              <div key={entry.chain} className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div>{entry.chain.toUpperCase()}</div>
                  <div className="muted">avg {entry.avgBlockTimeSec.toFixed(1)}s · age {entry.lastBlockAgeSec}s</div>
                </div>
                <Badge>{entry.status}</Badge>
              </div>
            ))}
            {!networkIntel.length && <div className="muted">No network signals.</div>}
          </div>
        </Card>
        <Card title="Bridge Intelligence" subtitle="Cross-layer message flow">
          <Button onClick={runBridgeIntel}>Refresh</Button>
          {bridgeIntel && (
            <div className="stack">
              {bridgeIntel.flows.map((flow, idx) => (
                <div key={`${flow.lastEventBlock}-${idx}`} className="stack">
                  <div className="muted">Events: {flow.totalEvents}</div>
                  <div className="muted">Last block: {flow.lastEventBlock ?? 'n/a'}</div>
                  <div className="muted">Delay: {flow.delaySec ?? 'n/a'}s</div>
                  <div className="muted">Fraud risk: {(flow.fraudLikelihood * 100).toFixed(0)}%</div>
                </div>
              ))}
              {!bridgeIntel.flows.length && <div className="muted">No bridge activity.</div>}
              <div className="muted">Reasoning: {bridgeIntel.explainability.reasoning}</div>
            </div>
          )}
        </Card>
        <Card title="Governance Intelligence" subtitle="On-chain proposals">
          <Button onClick={runGovernanceIntel}>Refresh</Button>
          {governanceIntel && (
            <div className="stack">
              {governanceIntel.proposals.map((proposal) => (
                <div key={proposal.txHash} className="muted">
                  {proposal.txHash} · block {proposal.blockNumber}
                </div>
              ))}
              {!governanceIntel.proposals.length && <div className="muted">No governance signals.</div>}
              <div className="muted">Reasoning: {governanceIntel.explainability.reasoning}</div>
            </div>
          )}
        </Card>
        <Card title="Predictive Analytics" subtitle="Read-only forecasts">
          <Button onClick={runForecasting}>Refresh</Button>
          {forecasting && (
            <div className="stack">
              {forecasting.forecasts.map((f) => (
                <div key={`${f.metric}-${f.horizon}`} className="muted">
                  {f.metric} ({f.horizon}) · {f.value.toFixed(4)} · {(f.confidence * 100).toFixed(0)}%
                </div>
              ))}
              {!forecasting.forecasts.length && <div className="muted">No forecasts available.</div>}
              <div className="muted">Reasoning: {forecasting.explainability.reasoning}</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
