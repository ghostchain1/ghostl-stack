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

type RiskScore = { label: string; score: number; reasons: string[] };
type Explainability = {
  confidence: number;
  reasoning: string;
  evidence: Array<{ kind: string; ref: string; detail: string }>;
  model: { name: string; version: string };
};

type TxIntel = {
  txHash: string;
  chain: { layer: string; chainId: number; name: string };
  classification: string;
  risk: RiskScore;
  anomalySignals: Array<{ name: string; severity: number; detail: string }>;
  summary: {
    from: string;
    to: string | null;
    valueWei: string;
    gasUsed: string | null;
    effectiveGasPriceWei: string | null;
    blockNumber: number | null;
  };
  explainability: Explainability;
};

type WalletIntel = {
  address: string;
  chain: { layer: string; chainId: number; name: string };
  risk: RiskScore;
  profile: {
    activityLevel: string;
    typicalTxValueWeiP50: string;
    typicalTxValueWeiP95: string;
    contractInteractionRate: number;
    uniqueCounterparties: number;
  };
  phishingDrainSignals: Array<{ name: string; severity: number; detail: string }>;
  clusters: Array<{ clusterId: string; relatedAddresses: string[]; reason: string }>;
  explainability: Explainability;
};

type ContractIntel = {
  address: string;
  chain: { layer: string; chainId: number; name: string };
  risk: RiskScore;
  findings: Array<{ id: string; severity: number; title: string; detail: string }>;
  fingerprint: { bytecodeHash: string; isProxyLikely: boolean; proxyTarget?: string | null };
  explainability: Explainability;
};

type NetworkIntel = {
  chain: { layer: string; chainId: number; name: string };
  risk: RiskScore;
  health: {
    headBlock: number;
    avgBlockTimeSec: number;
    txPerBlockAvg: number;
    baseFeeTrend: string;
  };
  anomalies: Array<{ name: string; severity: number; detail: string }>;
  earlyWarnings: Array<{ name: string; severity: number; detail: string }>;
  explainability: Explainability;
};

type BridgeIntel = {
  scope: { l1: { layer: string; chainId: number; name: string }; l2: { layer: string; chainId: number; name: string }; l3: { layer: string; chainId: number; name: string } };
  risk: RiskScore;
  messages: Array<{
    id: string;
    direction: string;
    srcTxHash: string;
    status: string;
    ageBlocks: number;
    detail: string;
  }>;
  stuckSignals: Array<{ name: string; severity: number; detail: string }>;
  explainability: Explainability;
};

type GovernanceIntel = {
  chain: { layer: string; chainId: number; name: string };
  proposalId: string;
  risk: RiskScore;
  impact: { security: string; gas: string; validatorOps: string };
  manipulationSignals: Array<{ name: string; severity: number; detail: string }>;
  explainability: Explainability;
};

type Forecasting = {
  chain: { layer: string; chainId: number; name: string };
  horizonBlocks: number;
  forecasts: { avgGasPriceWei: string; congestion: string; avgTxPerBlock: number };
  explainability: Explainability;
};

const API_URL = resolveApiBase();

export function AiCommandCenter() {
  const [chain, setChain] = useState<ChainRef>('l2');
  const [txHash, setTxHash] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [proposalId, setProposalId] = useState('');
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
    if (!proposalId) return;
    setStatus('Running governance intelligence...');
    try {
      const res = await fetch(
        `${API_URL}/ai/governance-intel?chain=${chain}&proposalId=${encodeURIComponent(proposalId)}`,
        { credentials: 'include' }
      );
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
                <Badge>
                  {txIntel.risk.label} {Math.round(txIntel.risk.score)}%
                </Badge>
              </div>
              <div className="muted">
                Signals: {txIntel.anomalySignals.map((signal) => signal.name).join(', ') || 'none'}
              </div>
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
                <Badge>{walletIntel.profile.activityLevel}</Badge>
                <Badge>
                  {walletIntel.risk.label} {Math.round(walletIntel.risk.score)}%
                </Badge>
              </div>
              <div className="muted">P50 value: {walletIntel.profile.typicalTxValueWeiP50}</div>
              <div className="muted">P95 value: {walletIntel.profile.typicalTxValueWeiP95}</div>
              <div className="muted">Counterparties: {walletIntel.profile.uniqueCounterparties}</div>
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
                <Badge>
                  {contractIntel.risk.label} {Math.round(contractIntel.risk.score)}%
                </Badge>
              </div>
              <div className="muted">
                Findings: {contractIntel.findings.map((finding) => finding.id).join(', ') || 'none'}
              </div>
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
              <div key={`${entry.chain.layer}-${entry.chain.chainId}`} className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div>{entry.chain.name}</div>
                  <div className="muted">
                    avg {entry.health.avgBlockTimeSec.toFixed(1)}s · tx/block {entry.health.txPerBlockAvg.toFixed(1)} · fee {entry.health.baseFeeTrend}
                  </div>
                </div>
                <Badge>{entry.risk.label}</Badge>
              </div>
            ))}
            {!networkIntel.length && <div className="muted">No network signals.</div>}
          </div>
        </Card>
        <Card title="Bridge Intelligence" subtitle="Cross-layer message flow">
          <Button onClick={runBridgeIntel}>Refresh</Button>
          {bridgeIntel && (
            <div className="stack">
              <div className="row">
                <Badge>{bridgeIntel.risk.label}</Badge>
                <div className="muted">Messages: {bridgeIntel.messages.length}</div>
              </div>
              {bridgeIntel.messages.slice(0, 4).map((message) => (
                <div key={message.id} className="stack">
                  <div className="muted">
                    {message.direction} · {message.status} · age {message.ageBlocks}
                  </div>
                  <div className="muted">Tx: {message.srcTxHash}</div>
                </div>
              ))}
              {!bridgeIntel.messages.length && <div className="muted">No bridge activity.</div>}
              <div className="muted">Reasoning: {bridgeIntel.explainability.reasoning}</div>
            </div>
          )}
        </Card>
        <Card title="Governance Intelligence" subtitle="On-chain proposals">
          <input className="input" placeholder="proposal id" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
          <Button onClick={runGovernanceIntel}>Refresh</Button>
          {governanceIntel && (
            <div className="stack">
              <div className="row">
                <Badge>{governanceIntel.risk.label}</Badge>
                <div className="muted">
                  {governanceIntel.impact.security} security · {governanceIntel.impact.gas} gas
                </div>
              </div>
              <div className="muted">Signals: {governanceIntel.manipulationSignals.map((signal) => signal.name).join(', ') || 'none'}</div>
              <div className="muted">Reasoning: {governanceIntel.explainability.reasoning}</div>
            </div>
          )}
        </Card>
        <Card title="Predictive Analytics" subtitle="Read-only forecasts">
          <Button onClick={runForecasting}>Refresh</Button>
          {forecasting && (
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>Avg gas price</div>
                <div className="muted">{forecasting.forecasts.avgGasPriceWei}</div>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>Congestion</div>
                <div className="muted">{forecasting.forecasts.congestion}</div>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>Avg tx/block</div>
                <div className="muted">{forecasting.forecasts.avgTxPerBlock.toFixed(2)}</div>
              </div>
              <div className="muted">Reasoning: {forecasting.explainability.reasoning}</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
