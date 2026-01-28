'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import type { AnalyticsEvent, WebhookStatusSummary } from '@ghostl/types';
import { ethers, type InterfaceAbi } from 'ethers';
import { resolveAiAttestorBase, resolveApiBase } from '../../lib/runtime';
import { useSession } from '../identity-access/session';
import { apiRequest, type ApiError, formatApiError } from '../../lib/api';
import { DataFetchErrorCard } from '../../components/DataFetchErrorCard';

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

type AiContractKey = 'AIOracleRegistry' | 'AIAttestationHub' | 'PolicyGuard' | 'EvidenceAnchor';

type AiAbiResponse = {
  ok: boolean;
  abis: Partial<Record<AiContractKey | 'AIAttestationTypes' | 'IRiskScoringHook', unknown[]>>;
  addresses: Record<ChainRef, Partial<Record<AiContractKey | 'AIAttestationTypes' | 'IRiskScoringHook', string>>>;
};

type AiSignerInfo = {
  address: string;
  allowed: boolean;
  signerType: number;
  metadataURI: string;
  addedAt: number;
  disabledAt: number;
  updatedAt: number;
};

type AiPolicySnapshot = {
  riskThresholdBps: number;
  minConfidence: number;
  maxAttestationAgeSeconds: number;
};

type AiRiskSnapshot = {
  subject: string;
  layerId: number;
  riskScoreBps: number;
  confidence: number;
  attestationId: string;
  issuedAt: number;
  expiresAt: number;
};

type AiEvidenceAnchor = {
  index: number;
  kind: string;
  hash: string;
  uri: string;
  anchoredAt: number;
  anchoredBy: string;
};

type AttestorLayerStatus = {
  layer: number;
  rpcUrl: string;
  hubAddress: string | null;
  registryAddress: string | null;
  hasHub: boolean;
  hasRegistry: boolean;
  hasSigner: boolean;
  signerAllowed: boolean | null;
  chainId: string | null;
  hubLayerId: number | null;
  policy: AiPolicySnapshot | null;
};

type AttestorHealthResponse = {
  ok: boolean;
  service: string;
  defaultLayer: number;
  modelVersion: number;
  ttlSeconds: number;
  layers: AttestorLayerStatus[];
};

type AttestorConfigResponse = {
  ok: boolean;
  defaultLayer: number;
  modelVersion: number;
  ttlSeconds: number;
  minAttestIntervalSeconds: number;
  layers: AttestorLayerStatus[];
};

type AttestorOnChainRisk = {
  riskScoreBps: number;
  confidence: number;
  attestationId: string;
  issuedAt: number;
  expiresAt: number;
};

type AttestorRiskResponse = {
  ok: boolean;
  subject: string;
  layer: number;
  computed: {
    riskScoreBps: number;
    confidence: number;
    inputHash: string;
    outputHash: string;
    modelVersion: number;
  };
  onChain: AttestorOnChainRisk | null;
};

type AttestorSubmitResponse = {
  ok: boolean;
  layer: number;
  subject: string;
  signer: string;
  attestationId: string;
  txHash: string;
  chainId: string;
  nonce: string;
  retried?: boolean;
  risk: {
    riskScoreBps: number;
    confidence: number;
    inputHash: string;
    outputHash: string;
  };
};

const API_URL = resolveApiBase();
const ATTESTOR_URL = resolveAiAttestorBase();

export function AiCommandCenter() {
  const session = useSession();
  const isAdmin = session.user?.role === 'ADMIN';
  const [chain, setChain] = useState<ChainRef>('l2');
  const [txHash, setTxHash] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [status, setStatus] = useState('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatusSummary | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<AnalyticsEvent[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [txIntel, setTxIntel] = useState<TxIntel | null>(null);
  const [walletIntel, setWalletIntel] = useState<WalletIntel | null>(null);
  const [contractIntel, setContractIntel] = useState<ContractIntel | null>(null);
  const [networkIntel, setNetworkIntel] = useState<NetworkIntel[]>([]);
  const [bridgeIntel, setBridgeIntel] = useState<BridgeIntel | null>(null);
  const [governanceIntel, setGovernanceIntel] = useState<GovernanceIntel | null>(null);
  const [forecasting, setForecasting] = useState<Forecasting | null>(null);
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);
  const aiDefaultsAppliedRef = useRef<Record<ChainRef, boolean>>({ l1: false, l2: false, l3: false });
  const [aiAbis, setAiAbis] = useState<AiAbiResponse['abis']>({});
  const [aiAddressHints, setAiAddressHints] = useState<AiAbiResponse['addresses'] | null>(null);
  const [aiRegistryAddress, setAiRegistryAddress] = useState('');
  const [aiHubAddress, setAiHubAddress] = useState('');
  const [aiGuardAddress, setAiGuardAddress] = useState('');
  const [aiAnchorAddress, setAiAnchorAddress] = useState('');
  const [aiSubject, setAiSubject] = useState('');
  const [aiSigners, setAiSigners] = useState<AiSignerInfo[]>([]);
  const [aiPolicies, setAiPolicies] = useState<AiPolicySnapshot | null>(null);
  const [aiMode, setAiMode] = useState<'OFF' | 'ADVISORY' | 'ENFORCE' | ''>('');
  const [aiRisk, setAiRisk] = useState<AiRiskSnapshot | null>(null);
  const [aiAnchors, setAiAnchors] = useState<AiEvidenceAnchor[]>([]);
  const [aiStatus, setAiStatus] = useState('');
  const [aiError, setAiError] = useState('');
  const [attestorSubject, setAttestorSubject] = useState('');
  const [attestorApiKey, setAttestorApiKey] = useState('');
  const [attestorHealth, setAttestorHealth] = useState<AttestorHealthResponse | null>(null);
  const [attestorConfig, setAttestorConfig] = useState<AttestorConfigResponse | null>(null);
  const [attestorRisk, setAttestorRisk] = useState<AttestorRiskResponse | null>(null);
  const [attestorSubmission, setAttestorSubmission] = useState<AttestorSubmitResponse | null>(null);
  const [attestorStatus, setAttestorStatus] = useState('');
  const [attestorError, setAttestorError] = useState('');

  const pushError = (title: string, error: ApiError) => {
    setErrors((prev) => [...prev.filter((entry) => entry.title !== title), { title, error }]);
  };

  const clearError = (title: string) => {
    setErrors((prev) => prev.filter((entry) => entry.title !== title));
  };

  const formatStatus = (error: ApiError) => {
    const info = formatApiError(error);
    return `${info.method} ${info.endpoint} · ${info.status} · ${info.hint}`;
  };

  const chainEndpoints = useMemo(
    () => endpoints.filter((e) => (e.layer || '').toLowerCase() === chain),
    [endpoints, chain]
  );

  const activeRpc = useMemo(() => {
    const healthy = chainEndpoints.find((endpoint) => endpoint.status === 'healthy');
    return (healthy || chainEndpoints[0])?.url || '';
  }, [chainEndpoints]);

  const layerId = chain === 'l1' ? 1 : chain === 'l2' ? 2 : 3;
  const attestorLayerStatus = useMemo(() => {
    const layers = attestorHealth?.layers || attestorConfig?.layers || [];
    return layers.find((layer) => layer.layer === layerId) || null;
  }, [attestorConfig, attestorHealth, layerId]);

  const loadEndpoints = async () => {
    const res = await apiRequest<Endpoint[]>('/integrations/rpc', { baseUrl: API_URL });
    if (!res.ok) {
      pushError('RPC registry', res.error);
      setEndpoints([]);
      return;
    }
    clearError('RPC registry');
    setEndpoints(res.data);
  };

  useEffect(() => {
    loadEndpoints().catch(() => undefined);
    const timer = setInterval(() => {
      loadEndpoints().catch(() => undefined);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const loadActivity = async () => {
      const [eventsRes, webhookRes, deliveriesRes] = await Promise.all([
        apiRequest<{ events?: AnalyticsEvent[] }>('/analytics/events?scope=ai&limit=8', { baseUrl: API_URL }),
        apiRequest<WebhookStatusSummary>('/webhooks/status', { baseUrl: API_URL }),
        apiRequest<{ deliveries?: AnalyticsEvent[] }>('/webhooks/deliveries?limit=5', { baseUrl: API_URL })
      ]);
      if (!eventsRes.ok) pushError('AI analytics events', eventsRes.error);
      else {
        clearError('AI analytics events');
        setEvents(eventsRes.data.events || []);
      }
      if (!webhookRes.ok) pushError('Webhook status', webhookRes.error);
      else {
        clearError('Webhook status');
        setWebhookStatus(webhookRes.data);
      }
      if (!deliveriesRes.ok) pushError('Webhook deliveries', deliveriesRes.error);
      else {
        clearError('Webhook deliveries');
        setWebhookDeliveries(deliveriesRes.data.deliveries || []);
      }
    };
    loadActivity();
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const loadAiAbis = async () => {
      try {
        const res = await fetch('/api/ai/contracts', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setAiError(`AI contracts ABI load failed: ${res.status}`);
          return;
        }
        const payload = (await res.json()) as AiAbiResponse;
        if (cancelled) return;
        setAiAbis(payload.abis || {});
        setAiAddressHints(payload.addresses || null);
        setAiError('');
      } catch (err) {
        if (!cancelled) setAiError(err instanceof Error ? err.message : 'ai_contracts_load_failed');
      }
    };
    loadAiAbis().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!aiAddressHints) return;
    if (aiDefaultsAppliedRef.current[chain]) return;
    const hints = aiAddressHints[chain];
    if (!hints) {
      aiDefaultsAppliedRef.current[chain] = true;
      return;
    }
    if (hints.AIOracleRegistry) {
      setAiRegistryAddress((prev) => prev || hints.AIOracleRegistry || '');
    }
    if (hints.AIAttestationHub) {
      setAiHubAddress((prev) => prev || hints.AIAttestationHub || '');
    }
    if (hints.PolicyGuard) {
      setAiGuardAddress((prev) => prev || hints.PolicyGuard || '');
    }
    if (hints.EvidenceAnchor) {
      setAiAnchorAddress((prev) => prev || hints.EvidenceAnchor || '');
    }
    aiDefaultsAppliedRef.current[chain] = true;
  }, [aiAddressHints, chain]);

  const summarizeEvent = (event: AnalyticsEvent) => {
    const payload = event.payload || {};
    const summaryFields = ['chain', 'txHash', 'address', 'proposalId', 'entity', 'messageCount'];
    const details = summaryFields
      .map((field) => (payload as Record<string, unknown>)[field])
      .filter((value) => value !== undefined && value !== null);
    return details.length ? details.join(' · ') : '';
  };

  const runTxIntel = async () => {
    if (!txHash) return;
    setStatus('Running transaction intelligence...');
    try {
      const res = await apiRequest<TxIntel>(`/ai/tx-intel?chain=${chain}&txHash=${txHash}`, { baseUrl: API_URL });
      if (!res.ok) {
        setStatus(formatStatus(res.error));
        return;
      }
      setTxIntel(res.data);
      setStatus('');
    } catch (err) {
      setStatus(formatStatus(err as ApiError));
    }
  };

  const runWalletIntel = async () => {
    if (!walletAddress) return;
    setStatus('Running wallet intelligence...');
    try {
      const res = await apiRequest<WalletIntel>(`/ai/wallet-intel?chain=${chain}&address=${walletAddress}`, { baseUrl: API_URL });
      if (!res.ok) {
        setStatus(formatStatus(res.error));
        return;
      }
      setWalletIntel(res.data);
      setStatus('');
    } catch (err) {
      setStatus(formatStatus(err as ApiError));
    }
  };

  const runContractIntel = async () => {
    if (!contractAddress) return;
    setStatus('Running contract intelligence...');
    try {
      const res = await apiRequest<ContractIntel>(`/ai/contract-intel?chain=${chain}&address=${contractAddress}`, { baseUrl: API_URL });
      if (!res.ok) {
        setStatus(formatStatus(res.error));
        return;
      }
      setContractIntel(res.data);
      setStatus('');
    } catch (err) {
      setStatus(formatStatus(err as ApiError));
    }
  };

  const runNetworkIntel = async () => {
    setStatus('Running network intelligence...');
    try {
      const res = await apiRequest<{ status: NetworkIntel[] }>(`/ai/network-intel?chain=${chain}`, { baseUrl: API_URL });
      if (!res.ok) {
        setStatus(formatStatus(res.error));
        return;
      }
      setNetworkIntel(res.data.status || []);
      setStatus('');
    } catch (err) {
      setStatus(formatStatus(err as ApiError));
    }
  };

  const runBridgeIntel = async () => {
    setStatus('Running bridge intelligence...');
    try {
      const res = await apiRequest<BridgeIntel>(`/ai/bridge-intel?chain=${chain}`, { baseUrl: API_URL });
      if (!res.ok) {
        setStatus(formatStatus(res.error));
        return;
      }
      setBridgeIntel(res.data);
      setStatus('');
    } catch (err) {
      setStatus(formatStatus(err as ApiError));
    }
  };

  const runGovernanceIntel = async () => {
    if (!proposalId) return;
    setStatus('Running governance intelligence...');
    try {
      const res = await apiRequest<GovernanceIntel>(
        `/ai/governance-intel?chain=${chain}&proposalId=${encodeURIComponent(proposalId)}`,
        { baseUrl: API_URL }
      );
      if (!res.ok) {
        setStatus(formatStatus(res.error));
        return;
      }
      setGovernanceIntel(res.data);
      setStatus('');
    } catch (err) {
      setStatus(formatStatus(err as ApiError));
    }
  };

  const runForecasting = async () => {
    setStatus('Running forecasts...');
    try {
      const res = await apiRequest<Forecasting>(`/ai/forecasting?chain=${chain}`, { baseUrl: API_URL });
      if (!res.ok) {
        setStatus(formatStatus(res.error));
        return;
      }
      setForecasting(res.data);
      setStatus('');
    } catch (err) {
      setStatus(formatStatus(err as ApiError));
    }
  };

  const policyKey = (key: string) => ethers.keccak256(ethers.toUtf8Bytes(key));
  const modeLabels: Array<'OFF' | 'ADVISORY' | 'ENFORCE'> = ['OFF', 'ADVISORY', 'ENFORCE'];
  const formatTs = (seconds: number) => (seconds > 0 ? new Date(seconds * 1000).toLocaleString() : 'n/a');

  const loadAiPack = async () => {
    if (!activeRpc) {
      setAiError('No RPC endpoint available for this chain.');
      return;
    }
    if (!aiAbis.AIOracleRegistry && !aiAbis.AIAttestationHub && !aiAbis.PolicyGuard && !aiAbis.EvidenceAnchor) {
      setAiError('AI contract ABIs are not available yet. Run the ABI export step.');
      return;
    }

    setAiStatus('Loading AI contract state...');
    setAiError('');

    try {
      const provider = new ethers.JsonRpcProvider(activeRpc);

      const registryAbi = aiAbis.AIOracleRegistry as InterfaceAbi | undefined;
      const guardAbi = aiAbis.PolicyGuard as InterfaceAbi | undefined;
      const hubAbi = aiAbis.AIAttestationHub as InterfaceAbi | undefined;
      const anchorAbi = aiAbis.EvidenceAnchor as InterfaceAbi | undefined;

      if (aiRegistryAddress && registryAbi) {
        const registry = new ethers.Contract(aiRegistryAddress, registryAbi, provider);
        const countRaw = (await registry.signerCount()) as bigint;
        const count = Number(countRaw);
        const limit = Math.min(count, 25);
        const nextSigners: AiSignerInfo[] = [];
        for (let i = 0; i < limit; i += 1) {
          const signerAddress = (await registry.signerAt(i)) as string;
          const info = (await registry.getSignerInfo(signerAddress)) as {
            allowed: boolean;
            signerType: bigint;
            metadataURI: string;
            addedAt: bigint;
            disabledAt: bigint;
            updatedAt: bigint;
          };
          nextSigners.push({
            address: signerAddress,
            allowed: Boolean(info.allowed),
            signerType: Number(info.signerType || 0n),
            metadataURI: info.metadataURI || '',
            addedAt: Number(info.addedAt || 0n),
            disabledAt: Number(info.disabledAt || 0n),
            updatedAt: Number(info.updatedAt || 0n)
          });
        }
        setAiSigners(nextSigners);

        const [riskThresholdRaw, minConfidenceRaw, maxAgeRaw] = (await Promise.all([
          registry.getPolicy(policyKey('ghostai.policy.risk.threshold.bps')),
          registry.getPolicy(policyKey('ghostai.policy.min.confidence')),
          registry.getPolicy(policyKey('ghostai.policy.max.attestation.age'))
        ])) as [bigint, bigint, bigint];
        setAiPolicies({
          riskThresholdBps: Number(riskThresholdRaw || 0n),
          minConfidence: Number(minConfidenceRaw || 0n),
          maxAttestationAgeSeconds: Number(maxAgeRaw || 0n)
        });
      } else {
        setAiSigners([]);
        setAiPolicies(null);
      }

      if (aiGuardAddress && guardAbi) {
        const guard = new ethers.Contract(aiGuardAddress, guardAbi, provider);
        const modeRaw = (await guard.mode()) as bigint;
        const modeIndex = Number(modeRaw);
        setAiMode(modeLabels[modeIndex] || '');
      } else {
        setAiMode('');
      }

      if (aiHubAddress && hubAbi && aiSubject && ethers.isAddress(aiSubject)) {
        const hub = new ethers.Contract(aiHubAddress, hubAbi, provider);
        const result = (await hub.getLatestRisk(aiSubject, layerId)) as [bigint, bigint, string, bigint, bigint];
        setAiRisk({
          subject: aiSubject,
          layerId,
          riskScoreBps: Number(result[0] || 0n),
          confidence: Number(result[1] || 0n),
          attestationId: result[2] || '',
          issuedAt: Number(result[3] || 0n),
          expiresAt: Number(result[4] || 0n)
        });
      } else if (aiSubject && !ethers.isAddress(aiSubject)) {
        setAiRisk(null);
        setAiError('Subject address is not a valid EVM address.');
      } else {
        setAiRisk(null);
      }

      if (aiAnchorAddress && anchorAbi) {
        const anchor = new ethers.Contract(aiAnchorAddress, anchorAbi, provider);
        const totalRaw = (await anchor.anchorCount()) as bigint;
        const total = Number(totalRaw);
        const take = Math.min(total, 10);
        const start = Math.max(0, total - take);
        const nextAnchors: AiEvidenceAnchor[] = [];
        for (let i = total - 1; i >= start; i -= 1) {
          const record = (await anchor.anchorAt(i)) as {
            kind: string;
            hash: string;
            uri: string;
            anchoredAt: bigint;
            anchoredBy: string;
          };
          nextAnchors.push({
            index: i,
            kind: record.kind,
            hash: record.hash,
            uri: record.uri,
            anchoredAt: Number(record.anchoredAt || 0n),
            anchoredBy: record.anchoredBy
          });
        }
        setAiAnchors(nextAnchors);
      } else {
        setAiAnchors([]);
      }

      setAiStatus('');
    } catch (err) {
      setAiStatus('');
      setAiError(err instanceof Error ? err.message : 'ai_contract_reads_failed');
    }
  };

  const attestorHeaders = (json: boolean) => {
    const headers: Record<string, string> = {};
    if (json) headers['content-type'] = 'application/json';
    if (attestorApiKey) headers['x-ghost-ai-key'] = attestorApiKey;
    return headers;
  };

  const attestorRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${ATTESTOR_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...(init?.body ? attestorHeaders(true) : attestorHeaders(false))
      }
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, error: text };
      }
    }
    if (!res.ok) {
      const message =
        typeof data === 'object' && data && 'error' in data ? String((data as { error?: string }).error) : `attestor_http_${res.status}`;
      throw new Error(message || `attestor_http_${res.status}`);
    }
    return data as T;
  };

  const loadAttestorStatus = async () => {
    setAttestorStatus('Loading AI attestor status...');
    setAttestorError('');
    try {
      const [health, cfg] = await Promise.all([
        attestorRequest<AttestorHealthResponse>('/healthz'),
        attestorRequest<AttestorConfigResponse>('/config')
      ]);
      setAttestorHealth(health);
      setAttestorConfig(cfg);
      setAttestorStatus('');
    } catch (err) {
      setAttestorStatus('');
      setAttestorError(err instanceof Error ? err.message : 'attestor_status_failed');
    }
  };

  const loadAttestorRisk = async () => {
    const subject = attestorSubject.trim();
    if (!subject || !ethers.isAddress(subject)) {
      setAttestorError('Enter a valid subject address to load risk.');
      return;
    }
    setAttestorStatus('Loading AI attestor risk...');
    setAttestorError('');
    try {
      const response = await attestorRequest<AttestorRiskResponse>(`/risk/${subject}?layer=${layerId}`);
      setAttestorRisk(response);
      setAttestorStatus('');
    } catch (err) {
      setAttestorStatus('');
      setAttestorError(err instanceof Error ? err.message : 'attestor_risk_failed');
    }
  };

  const runAttestorAttest = async () => {
    const subject = attestorSubject.trim();
    if (!subject || !ethers.isAddress(subject)) {
      setAttestorError('Enter a valid subject address before attesting.');
      return;
    }
    setAttestorStatus('Submitting attestation...');
    setAttestorError('');
    try {
      const response = await attestorRequest<AttestorSubmitResponse>('/attest', {
        method: 'POST',
        body: JSON.stringify({ subject, layer: layerId })
      });
      setAttestorSubmission(response);
      setAttestorStatus('');
      loadAttestorRisk().catch(() => undefined);
    } catch (err) {
      setAttestorStatus('');
      setAttestorError(err instanceof Error ? err.message : 'attestor_submit_failed');
    }
  };

  useEffect(() => {
    loadAttestorStatus().catch(() => undefined);
    // We refresh attestor status when the selected layer changes.
  }, [chain]);

  useEffect(() => {
    if (!activeRpc) return;
    if (!aiRegistryAddress && !aiHubAddress && !aiGuardAddress && !aiAnchorAddress) return;
    loadAiPack().catch(() => undefined);
    // We intentionally do not depend on aiSubject to avoid spamming reads while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRpc, chain, aiRegistryAddress, aiHubAddress, aiGuardAddress, aiAnchorAddress, aiAbis]);

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="AI Command Center" subtitle="GhostChain L1, GhostL2, GhostL3">
          {errors.length > 0 && (
            <div className="stack" style={{ marginBottom: 8 }}>
              {errors.map((entry) => (
                <DataFetchErrorCard key={entry.title} title={entry.title} error={entry.error} />
              ))}
            </div>
          )}
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
        <Card title="AI Contract Pack" subtitle="Registry, Hub, Guard, Evidence">
          {aiStatus && <div className="muted">{aiStatus}</div>}
          {aiError && <div className="muted">AI pack: {aiError}</div>}
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Active RPC</span>
              <span className="mono">{activeRpc || 'n/a'}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Layer</span>
              <span>L{layerId}</span>
            </div>
          </div>
          <div className="stack" style={{ marginTop: 8 }}>
            <input
              className="input"
              placeholder="AIOracleRegistry address"
              value={aiRegistryAddress}
              onChange={(e) => setAiRegistryAddress(e.target.value.trim())}
            />
            <input
              className="input"
              placeholder="AIAttestationHub address"
              value={aiHubAddress}
              onChange={(e) => setAiHubAddress(e.target.value.trim())}
            />
            <input
              className="input"
              placeholder="PolicyGuard address"
              value={aiGuardAddress}
              onChange={(e) => setAiGuardAddress(e.target.value.trim())}
            />
            <input
              className="input"
              placeholder="EvidenceAnchor address"
              value={aiAnchorAddress}
              onChange={(e) => setAiAnchorAddress(e.target.value.trim())}
            />
            <input
              className="input"
              placeholder="Subject address (for latest risk)"
              value={aiSubject}
              onChange={(e) => setAiSubject(e.target.value.trim())}
            />
            <Button onClick={loadAiPack}>Refresh AI Pack</Button>
          </div>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Badge>{aiMode || 'mode: n/a'}</Badge>
              {aiPolicies && (
                <>
                  <Badge tone="default">risk ≤ {aiPolicies.riskThresholdBps || 0} bps</Badge>
                  <Badge tone="default">confidence ≥ {aiPolicies.minConfidence || 0}</Badge>
                  <Badge tone="default">max age {aiPolicies.maxAttestationAgeSeconds || 0}s</Badge>
                </>
              )}
            </div>

            <div>
              <div className="muted">Allowed signers (up to 25)</div>
              {aiSigners.length === 0 && <div className="muted">No signers loaded.</div>}
              {aiSigners.map((signer) => (
                <div key={signer.address} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span className="mono">{signer.address}</span>
                  <span className="muted">
                    type {signer.signerType} · {signer.allowed ? 'allowed' : 'disabled'}
                  </span>
                </div>
              ))}
            </div>

            <div>
              <div className="muted">Latest risk</div>
              {!aiRisk && <div className="muted">Provide a subject + hub address to load risk.</div>}
              {aiRisk && (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone="default">risk {aiRisk.riskScoreBps} bps</Badge>
                    <Badge tone="default">confidence {aiRisk.confidence}</Badge>
                  </div>
                  <div className="muted mono">attestation {aiRisk.attestationId || 'n/a'}</div>
                  <div className="muted">issued {formatTs(aiRisk.issuedAt)}</div>
                  <div className="muted">expires {formatTs(aiRisk.expiresAt)}</div>
                </div>
              )}
            </div>

            <div>
              <div className="muted">Evidence anchors (latest 10)</div>
              {aiAnchors.length === 0 && <div className="muted">No anchors loaded.</div>}
              {aiAnchors.map((anchor) => (
                <div key={`${anchor.index}-${anchor.hash}`} className="stack" style={{ gap: 2 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>#{anchor.index}</span>
                    <span className="muted">{formatTs(anchor.anchoredAt)}</span>
                  </div>
                  <div className="mono">{anchor.kind}</div>
                  <div className="mono">{anchor.hash}</div>
                  {anchor.uri && <div className="muted">{anchor.uri}</div>}
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title="AI Attestor Service" subtitle="Off-chain attestations, on-chain verification">
          {attestorStatus && <div className="muted">{attestorStatus}</div>}
          {attestorError && <div className="muted">Attestor: {attestorError}</div>}
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Attestor Base</span>
              <span className="mono">{ATTESTOR_URL}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Layer</span>
              <span>L{layerId}</span>
            </div>
            {attestorLayerStatus && (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Chain ID</span>
                  <span className="mono">{attestorLayerStatus.chainId || 'n/a'}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Signer Allowed</span>
                  <span>{attestorLayerStatus.signerAllowed === null ? 'unknown' : attestorLayerStatus.signerAllowed ? 'yes' : 'no'}</span>
                </div>
              </>
            )}
          </div>
          {attestorLayerStatus?.policy && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <Badge tone="default">risk ≤ {attestorLayerStatus.policy.riskThresholdBps || 0} bps</Badge>
              <Badge tone="default">confidence ≥ {attestorLayerStatus.policy.minConfidence || 0}</Badge>
              <Badge tone="default">max age {attestorLayerStatus.policy.maxAttestationAgeSeconds || 0}s</Badge>
            </div>
          )}
          <div className="stack" style={{ marginTop: 8 }}>
            <input
              className="input"
              placeholder="Subject address for risk/attestation"
              value={attestorSubject}
              onChange={(e) => setAttestorSubject(e.target.value.trim())}
            />
            <input
              className="input"
              placeholder="Attestor API key (optional)"
              value={attestorApiKey}
              onChange={(e) => setAttestorApiKey(e.target.value.trim())}
            />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={loadAttestorStatus}>Refresh Attestor</Button>
              <Button onClick={loadAttestorRisk}>Load Risk</Button>
              <Button onClick={runAttestorAttest}>Attest Now</Button>
            </div>
          </div>
          <div className="stack" style={{ marginTop: 10, gap: 8 }}>
            <div>
              <div className="muted">Attestor risk</div>
              {!attestorRisk && <div className="muted">Enter a subject address and load risk.</div>}
              {attestorRisk && (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Badge tone="default">risk {attestorRisk.computed.riskScoreBps} bps</Badge>
                    <Badge tone="default">confidence {attestorRisk.computed.confidence}</Badge>
                    <Badge tone="default">model v{attestorRisk.computed.modelVersion}</Badge>
                  </div>
                  <div className="muted mono">input {attestorRisk.computed.inputHash}</div>
                  <div className="muted mono">output {attestorRisk.computed.outputHash}</div>
                  {attestorRisk.onChain && (
                    <div className="stack" style={{ gap: 2 }}>
                      <div className="muted">On-chain latest</div>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <Badge tone="default">risk {attestorRisk.onChain.riskScoreBps} bps</Badge>
                        <Badge tone="default">confidence {attestorRisk.onChain.confidence}</Badge>
                      </div>
                      <div className="muted mono">attestation {attestorRisk.onChain.attestationId || 'n/a'}</div>
                      <div className="muted">issued {formatTs(attestorRisk.onChain.issuedAt)}</div>
                      <div className="muted">expires {formatTs(attestorRisk.onChain.expiresAt)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="muted">Last submission</div>
              {!attestorSubmission && <div className="muted">No attestations submitted from this UI yet.</div>}
              {attestorSubmission && (
                <div className="stack" style={{ gap: 2 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Badge tone="default">nonce {attestorSubmission.nonce}</Badge>
                    {attestorSubmission.retried && <Badge tone="default">retried</Badge>}
                  </div>
                  <div className="muted mono">attestation {attestorSubmission.attestationId}</div>
                  <div className="muted mono">tx {attestorSubmission.txHash}</div>
                  <div className="muted">chain {attestorSubmission.chainId}</div>
                </div>
              )}
            </div>
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
      {isAdmin && (
        <div className="card-grid">
          <Card title="Recent AI Activity" subtitle="Admin-only analytics">
            {events.length === 0 && <div className="muted">No recent AI events.</div>}
            <div className="stack">
              {events.map((event) => (
                <div key={event.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div>{event.type}</div>
                    <div className="muted">{summarizeEvent(event)}</div>
                  </div>
                  <div className="muted">{event.at}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Webhook Status" subtitle="Admin-only delivery summary">
            {!webhookStatus && <div className="muted">No webhook data.</div>}
            {webhookStatus && (
              <div className="stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Deliveries (24h)</span>
                  <span>{webhookStatus.total24h}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Failures (24h)</span>
                  <span>{webhookStatus.failures24h}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Last delivery</span>
                  <span>{webhookStatus.lastDeliveryAt || 'n/a'}</span>
                </div>
                {webhookStatus.lastError && <div className="muted">Last error: {webhookStatus.lastError}</div>}
                <div className="stack">
                  {webhookDeliveries.map((delivery) => (
                    <div key={delivery.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <div>{delivery.status === 'error' ? 'Failed' : 'Delivered'}</div>
                      <div className="muted">{delivery.at}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
