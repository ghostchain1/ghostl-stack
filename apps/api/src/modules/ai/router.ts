import express from 'express';
import { JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import { z } from 'zod';
import { ghostWalletRpcManager } from '../../services/rpc-manager';
import { env } from '../../config/env';
import { requirePermission } from '../../lib/rbac';

type ChainRef = 'l1' | 'l2' | 'l3';
type ChainLayer = 'L1' | 'L2' | 'L3';
type ChainDescriptor = { layer: ChainLayer; chainId: number; name: 'GhostChain' | 'GhostL2' | 'GhostL3' };

const chainParam = z.enum(['l1', 'l2', 'l3']);
const chainLayerSchema = z.enum(['L1', 'L2', 'L3']);
const chainRefSchema = z.object({
  layer: chainLayerSchema,
  chainId: z.number().int(),
  name: z.enum(['GhostChain', 'GhostL2', 'GhostL3'])
});
const explainabilitySchema = z.object({
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  evidence: z.array(
    z.object({
      kind: z.enum(['rpc', 'event', 'receipt', 'trace', 'bytecode', 'abi', 'state']),
      ref: z.string(),
      detail: z.string()
    })
  ),
  model: z.object({
    name: z.string(),
    version: z.string()
  })
});
const riskScoreSchema = z.object({
  label: z.enum(['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  score: z.number().min(0).max(100),
  reasons: z.array(z.string())
});
const txIntelSchema = z.object({
  chain: chainRefSchema,
  txHash: z.string(),
  classification: z.enum(['TRANSFER', 'CONTRACT_CALL', 'CONTRACT_DEPLOY', 'BRIDGE', 'GOVERNANCE', 'STAKING', 'UNKNOWN']),
  risk: riskScoreSchema,
  anomalySignals: z.array(
    z.object({
      name: z.string(),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      detail: z.string()
    })
  ),
  summary: z.object({
    from: z.string(),
    to: z.string().nullable(),
    valueWei: z.string(),
    gasUsed: z.string().nullable(),
    effectiveGasPriceWei: z.string().nullable(),
    blockNumber: z.number().int().nullable()
  }),
  explainability: explainabilitySchema
});
const walletIntelSchema = z.object({
  chain: chainRefSchema,
  address: z.string(),
  risk: riskScoreSchema,
  profile: z.object({
    activityLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    typicalTxValueWeiP50: z.string(),
    typicalTxValueWeiP95: z.string(),
    contractInteractionRate: z.number().min(0).max(1),
    uniqueCounterparties: z.number().int()
  }),
  phishingDrainSignals: z.array(
    z.object({
      name: z.string(),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      detail: z.string()
    })
  ),
  clusters: z.array(
    z.object({
      clusterId: z.string(),
      relatedAddresses: z.array(z.string()),
      reason: z.string()
    })
  ),
  explainability: explainabilitySchema
});
const contractIntelSchema = z.object({
  chain: chainRefSchema,
  address: z.string(),
  risk: riskScoreSchema,
  findings: z.array(
    z.object({
      id: z.string(),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      title: z.string(),
      detail: z.string(),
      evidence: z.array(
        z.object({
          kind: z.enum(['bytecode', 'abi', 'trace', 'state']),
          ref: z.string(),
          detail: z.string()
        })
      )
    })
  ),
  fingerprint: z.object({
    bytecodeHash: z.string(),
    isProxyLikely: z.boolean(),
    proxyTarget: z.string().nullable().optional()
  }),
  explainability: explainabilitySchema
});
const networkIntelSchema = z.object({
  chain: chainRefSchema,
  risk: riskScoreSchema,
  health: z.object({
    headBlock: z.number().int(),
    avgBlockTimeSec: z.number(),
    txPerBlockAvg: z.number(),
    baseFeeTrend: z.enum(['DOWN', 'FLAT', 'UP', 'UNKNOWN'])
  }),
  anomalies: z.array(
    z.object({
      name: z.string(),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      detail: z.string()
    })
  ),
  earlyWarnings: z.array(
    z.object({
      name: z.string(),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      detail: z.string()
    })
  ),
  explainability: explainabilitySchema
});
const bridgeIntelSchema = z.object({
  scope: z.object({
    l1: chainRefSchema,
    l2: chainRefSchema,
    l3: chainRefSchema
  }),
  risk: riskScoreSchema,
  messages: z.array(
    z.object({
      id: z.string(),
      direction: z.enum(['L3_TO_L2', 'L2_TO_L1']),
      srcTxHash: z.string(),
      status: z.enum(['PENDING', 'FINALIZED', 'STUCK', 'FAILED']),
      ageBlocks: z.number().int(),
      detail: z.string()
    })
  ),
  stuckSignals: z.array(
    z.object({
      name: z.string(),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      detail: z.string()
    })
  ),
  explainability: explainabilitySchema
});
const governanceIntelSchema = z.object({
  chain: chainRefSchema,
  proposalId: z.string(),
  risk: riskScoreSchema,
  impact: z.object({
    security: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    gas: z.enum(['DECREASE', 'NEUTRAL', 'INCREASE']),
    validatorOps: z.enum(['LOW', 'MEDIUM', 'HIGH'])
  }),
  manipulationSignals: z.array(
    z.object({
      name: z.string(),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      detail: z.string()
    })
  ),
  explainability: explainabilitySchema
});
const forecastingSchema = z.object({
  chain: chainRefSchema,
  horizonBlocks: z.number().int(),
  forecasts: z.object({
    avgGasPriceWei: z.string(),
    congestion: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    avgTxPerBlock: z.number()
  }),
  explainability: explainabilitySchema
});

const selectorMap = {
  governance: new Set(['0x7d5e81e2', '0x15373e3d', '0x7f3b3035']),
  staking: new Set(['0xa694fc3a', '0x5c19a95c', '0x4f2be91f'])
};

const toBigInt = (value?: string | null) => {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
};

const chainDescriptor = (layer: ChainRef): ChainDescriptor => {
  if (layer === 'l1') {
    return {
      layer: 'L1',
      chainId: Number(process.env.GHOSTCHAIN_L1_CHAIN_ID || '14000101'),
      name: 'GhostChain'
    };
  }
  if (layer === 'l2') {
    return {
      layer: 'L2',
      chainId: Number(process.env.GHOSTL2_CHAIN_ID || env.CHAIN_ID || '901'),
      name: 'GhostL2'
    };
  }
  return {
    layer: 'L3',
    chainId: Number(process.env.GHOSTL3_CHAIN_ID || '903'),
    name: 'GhostL3'
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
};

const scoreToLabel = (score: number) => {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 20) return 'LOW';
  return 'SAFE';
};

const weightSeverity = (weight: number): 1 | 2 | 3 | 4 | 5 => {
  if (weight >= 30) return 5;
  if (weight >= 25) return 4;
  if (weight >= 20) return 4;
  if (weight >= 15) return 3;
  if (weight >= 10) return 2;
  return 1;
};

const scanRecentTxs = async (provider: JsonRpcProvider, address: string, lookbackBlocks: number, maxTxs: number) => {
  const latest = await provider.getBlockNumber();
  const lower = address.toLowerCase();
  const start = Math.max(latest - lookbackBlocks + 1, 0);
  const pageSize = 200;
  const results: Array<{ hash: string; from: string; to: string | null; value: bigint; data: string; blockNumber: number }> = [];
  for (let from = latest; from >= start && results.length < maxTxs; from -= pageSize) {
    const to = Math.max(from - pageSize + 1, start);
    const blockNumbers = [];
    for (let b = from; b >= to; b -= 1) blockNumbers.push(b);
    const blocks = await Promise.all(blockNumbers.map((bn) => provider.getBlock(bn, true)));
    blocks.forEach((block) => {
      if (!block || !block.transactions) return;
      block.transactions.forEach((tx: any) => {
        const fromAddr = (tx.from || '').toLowerCase();
        const toAddr = tx.to ? tx.to.toLowerCase() : null;
        if (fromAddr === lower || toAddr === lower) {
          results.push({
            hash: tx.hash,
            from: tx.from,
            to: tx.to || null,
            value: toBigInt(tx.value?.toString()),
            data: tx.data || '0x',
            blockNumber: block.number
          });
        }
      });
    });
  }
  return results.slice(0, maxTxs);
};

const parseApproveAmount = (data: string) => {
  if (!data || !data.startsWith('0x095ea7b3') || data.length < 10 + 64 * 2) return null;
  const amountHex = `0x${data.slice(data.length - 64)}`;
  try {
    return BigInt(amountHex);
  } catch {
    return null;
  }
};

const maxUint256 = (1n << 256n) - 1n;

const computeRisk = (features: Array<{ name: string; weight: number; detail: string }>) => {
  const score = clamp(
    features.reduce((sum, feature) => sum + feature.weight, 0),
    0,
    100
  );
  return {
    score,
    label: scoreToLabel(score),
    reasons: features.map((f) => f.name)
  };
};

const parseSelector = (data?: string | null) => {
  if (!data || data === '0x' || data.length < 10) return '';
  return data.slice(0, 10).toLowerCase();
};

const isAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);

const addressesFor = () => {
  const list = [
    env.BRIDGE_ADDRESS,
    env.BRIDGE_L2L3_ADDRESS,
    env.L1_ROLLUP_L2_ADDRESS,
    env.L2_ROLLUP_L3_ADDRESS,
    env.L3_INBOX_ADDRESS,
    env.GOVERNANCE_CONTRACT_ADDRESS,
    env.STAKING_CONTRACT_ADDRESS
  ].filter((addr): addr is string => Boolean(addr));
  return new Set(list.map((addr) => addr.toLowerCase()));
};

const getProvider = async <T>(chain: ChainRef, fn: (provider: any) => Promise<T>) =>
  ghostWalletRpcManager.withProvider(chain, fn);

const fetchLatestBlocks = async (chain: ChainRef, count: number) =>
  getProvider(chain, async (provider) => {
    const latest = await provider.getBlockNumber();
    const start = Math.max(latest - count + 1, 0);
    const blocks = await Promise.all(
      Array.from({ length: latest - start + 1 }, (_, idx) => provider.getBlock(start + idx, true))
    );
    return blocks.filter(Boolean);
  });

const buildExplainability = (
  confidence: number,
  reasoning: string,
  evidence: Array<{ kind: 'rpc' | 'event' | 'receipt' | 'trace' | 'bytecode' | 'abi' | 'state'; ref: string; detail: string }>
) => ({
  confidence,
  reasoning,
  evidence,
  model: { name: 'risk-v1', version: '1.0.0' }
});

const txIntel = async (chain: ChainRef, txHash: string) =>
  getProvider(chain, async (provider) => {
    const tx = await provider.getTransaction(txHash);
    if (!tx) throw new Error('tx_not_found');
    const receipt = await provider.getTransactionReceipt(txHash);
    const block = tx.blockNumber ? await provider.getBlock(tx.blockNumber) : null;
    const to = tx.to ? tx.to.toLowerCase() : null;
    const selector = parseSelector(tx.data);
    const addresses = addressesFor();
    let classification: 'TRANSFER' | 'CONTRACT_CALL' | 'CONTRACT_DEPLOY' | 'BRIDGE' | 'GOVERNANCE' | 'STAKING' | 'UNKNOWN' =
      'UNKNOWN';
    if (!tx.to) classification = 'CONTRACT_DEPLOY';
    else if (addresses.has(to || '')) classification = 'BRIDGE';
    else if (env.GOVERNANCE_CONTRACT_ADDRESS && to === env.GOVERNANCE_CONTRACT_ADDRESS.toLowerCase()) classification = 'GOVERNANCE';
    else if (env.STAKING_CONTRACT_ADDRESS && to === env.STAKING_CONTRACT_ADDRESS.toLowerCase()) classification = 'STAKING';
    else if (selectorMap.governance.has(selector)) classification = 'GOVERNANCE';
    else if (selectorMap.staking.has(selector)) classification = 'STAKING';
    else if (!selector || selector === '0x') classification = 'TRANSFER';
    else classification = 'CONTRACT_CALL';

    const txValue = toBigInt(tx.value?.toString());
    const recentTxs = await scanRecentTxs(provider, tx.from, 2000, 120);
    const fromTxs = recentTxs.filter((item) => item.from.toLowerCase() === tx.from.toLowerCase());
    const counterparties = new Set(fromTxs.map((item) => (item.to || '').toLowerCase()).filter(Boolean));
    const isNewCounterparty = tx.to ? !counterparties.has(tx.to.toLowerCase()) : false;
    const valueSeries = fromTxs.map((item) => Number(item.value)).filter((v) => Number.isFinite(v));
    const p95Value = percentile(valueSeries, 95);
    const valueOutlier = valueSeries.length > 10 && Number(txValue) > p95Value;

    const recentBlocks = await fetchLatestBlocks(chain, 40);
    const gasSeries = recentBlocks
      .map((b) => (b?.gasUsed ? Number(b.gasUsed) : null))
      .filter((v): v is number => v !== null);
    const p95Gas = percentile(gasSeries, 95);
    const gasOutlier = receipt?.gasUsed ? Number(receipt.gasUsed) > p95Gas : false;

    let knownBadOpcodePattern = false;
    let bytecodeHash: string | null = null;
    if (tx.to) {
      const code = await provider.getCode(tx.to);
      if (code && code !== '0x') {
        bytecodeHash = keccak256(code as `0x${string}`);
        const hasDelegatecall = code.toLowerCase().includes('f4');
        const hasOwnerSelector = code.toLowerCase().includes('8da5cb5b');
        knownBadOpcodePattern = hasDelegatecall && !hasOwnerSelector;
      }
    }

    const bridgeSensitive = classification === 'BRIDGE';

    const replayLike =
      fromTxs.filter((item) => item.data === tx.data && Math.abs(item.blockNumber - (tx.blockNumber ?? item.blockNumber)) < 20)
        .length >= 2;

    const approvalAmount = parseApproveAmount(tx.data);
    const approvalUnlimited = approvalAmount !== null && approvalAmount === maxUint256;

    const features = [
      isNewCounterparty ? { name: 'isNewCounterparty', weight: 10, detail: 'recipient not seen in lookback' } : null,
      valueOutlier ? { name: 'valueOutlier', weight: 20, detail: 'value exceeds p95 of sender history' } : null,
      gasOutlier ? { name: 'gasOutlier', weight: 10, detail: 'gasUsed exceeds p95 of recent blocks' } : null,
      knownBadOpcodePattern
        ? { name: 'knownBadOpcodePattern', weight: 15, detail: 'delegatecall pattern without owner signal' }
        : null,
      bridgeSensitive ? { name: 'bridgeSensitive', weight: 15, detail: 'bridge contract interaction' } : null,
      replayLike ? { name: 'replayLike', weight: 10, detail: 'repeated calldata in short window' } : null,
      approvalUnlimited ? { name: 'approvalUnlimited', weight: 20, detail: 'ERC20 approve max uint' } : null
    ].filter(Boolean) as Array<{ name: string; weight: number; detail: string }>;

    const risk = computeRisk(features);
    const anomalySignals = features.map((feature) => ({
      name: feature.name,
      severity: weightSeverity(feature.weight),
      detail: feature.detail
    }));

    const explainability = {
      confidence: 0.73,
      reasoning: features.length ? `signals:${features.map((f) => f.name).join(',')}` : 'no abnormal signals',
      evidence: [
        { kind: 'rpc', ref: 'eth_getTransactionByHash', detail: txHash },
        { kind: 'receipt', ref: 'eth_getTransactionReceipt', detail: receipt?.transactionHash || txHash },
        { kind: 'rpc', ref: 'eth_getBlockByNumber', detail: String(tx.blockNumber ?? '') },
        ...(bytecodeHash ? [{ kind: 'bytecode' as const, ref: tx.to || '', detail: bytecodeHash }] : [])
      ],
      model: { name: 'risk-v1', version: '1.0.0' }
    };

    return {
      chain: chainDescriptor(chain),
      txHash,
      classification,
      risk,
      anomalySignals,
      summary: {
        from: tx.from,
        to: tx.to || null,
        valueWei: txValue.toString(),
        gasUsed: receipt?.gasUsed ? receipt.gasUsed.toString() : null,
        effectiveGasPriceWei: receipt?.effectiveGasPrice ? receipt.effectiveGasPrice.toString() : null,
        blockNumber: tx.blockNumber ?? null
      },
      explainability
    };
  });

const walletIntel = async (chain: ChainRef, address: string, lookbackBlocks = 20_000, maxTxs = 200) =>
  getProvider(chain, async (provider) => {
    const lower = address.toLowerCase();
    const txs = await scanRecentTxs(provider, address, lookbackBlocks, maxTxs);
    const valueSeries = txs.map((tx) => Number(tx.value)).filter((v) => Number.isFinite(v));
    const p50 = percentile(valueSeries, 50);
    const p95 = percentile(valueSeries, 95);
    const counterparties = new Set(
      txs
        .map((tx) => (tx.from.toLowerCase() === lower ? tx.to : tx.from))
        .filter((addr): addr is string => Boolean(addr))
        .map((addr) => addr.toLowerCase())
    );
    counterparties.delete(lower);
    const codeCache = new Map<string, boolean>();
    let contractInteractions = 0;
    for (const tx of txs) {
      if (!tx.to) continue;
      const key = tx.to.toLowerCase();
      if (!codeCache.has(key)) {
        const code = await provider.getCode(tx.to);
        codeCache.set(key, code !== '0x');
      }
      if (codeCache.get(key)) contractInteractions += 1;
    }
    const interactionRate = txs.length ? contractInteractions / txs.length : 0;
    const activityLevel = txs.length > 120 ? 'HIGH' : txs.length > 40 ? 'MEDIUM' : 'LOW';

    const latestBlock = await provider.getBlockNumber();
    const recentCutoff = Math.max(latestBlock - 300, 0);
    const recentTxs = txs.filter((tx) => tx.blockNumber >= recentCutoff);
    const outgoingRecent = recentTxs.filter((tx) => tx.from.toLowerCase() === lower);
    const outgoingValue = outgoingRecent.reduce((sum, tx) => sum + tx.value, 0n);
    const avgOutgoing = txs.length ? txs.filter((tx) => tx.from.toLowerCase() === lower).reduce((sum, tx) => sum + tx.value, 0n) / BigInt(txs.length) : 0n;
    const suddenSpendSpike = avgOutgoing > 0n && outgoingValue > avgOutgoing * 5n;

    const approvalTxs = txs.filter((tx) => tx.from.toLowerCase() === lower && tx.data?.startsWith('0x095ea7b3'));
    const newTokenApprovals = approvalTxs.length > 0 && approvalTxs.length >= Math.max(2, Math.floor(txs.length * 0.1));

    const recentNewCounterparties = new Set(
      outgoingRecent.map((tx) => (tx.to ? tx.to.toLowerCase() : '')).filter(Boolean)
    );
    const manyNewCounterparties = recentNewCounterparties.size >= 8;

    const highContractInteractionRate = interactionRate > 0.7;
    const drainPattern = suddenSpendSpike && approvalTxs.length >= 2 && manyNewCounterparties;

    const features = [
      suddenSpendSpike ? { name: 'suddenSpendSpike', weight: 25, detail: 'outgoing value spike in recent window' } : null,
      newTokenApprovals ? { name: 'newTokenApprovals', weight: 20, detail: 'multiple new approvals detected' } : null,
      manyNewCounterparties ? { name: 'manyNewCounterparties', weight: 15, detail: 'spike in new counterparties' } : null,
      highContractInteractionRate
        ? { name: 'highContractInteractionRate', weight: 10, detail: 'contract interaction rate high' }
        : null,
      drainPattern ? { name: 'drainPattern', weight: 30, detail: 'outflows + approvals + new counterparties' } : null
    ].filter(Boolean) as Array<{ name: string; weight: number; detail: string }>;

    const risk = computeRisk(features);
    const phishingDrainSignals = features.map((feature) => ({
      name: feature.name,
      severity: weightSeverity(feature.weight),
      detail: feature.detail
    }));

    const clusters = Array.from(counterparties)
      .slice(0, 6)
      .map((counterparty) => ({
        clusterId: keccak256(toUtf8Bytes(`${address}:${counterparty}`)).slice(0, 12),
        relatedAddresses: [counterparty],
        reason: 'shared_counterparty'
      }));

    const explainability = {
      confidence: 0.7,
      reasoning: features.length ? `signals:${features.map((f) => f.name).join(',')}` : 'no abnormal signals',
      evidence: [
        { kind: 'rpc', ref: 'eth_getBlockByNumber', detail: `lookback:${lookbackBlocks}` },
        { kind: 'rpc', ref: 'eth_getTransactionByHash', detail: `txs:${txs.length}` }
      ],
      model: { name: 'risk-v1', version: '1.0.0' }
    };

    return {
      chain: chainDescriptor(chain),
      address,
      risk,
      profile: {
        activityLevel,
        typicalTxValueWeiP50: p50.toString(),
        typicalTxValueWeiP95: p95.toString(),
        contractInteractionRate: Number(interactionRate.toFixed(4)),
        uniqueCounterparties: counterparties.size
      },
      phishingDrainSignals,
      clusters,
      explainability
    };
  });

const contractIntel = async (chain: ChainRef, address: string) =>
  getProvider(chain, async (provider) => {
    const code = await provider.getCode(address);
    if (!code || code === '0x') {
      const risk = { score: 0, label: 'SAFE', reasons: ['NO_BYTECODE'] };
      return {
        chain: chainDescriptor(chain),
        address,
        risk,
        findings: [],
        fingerprint: { bytecodeHash: keccak256('0x'), isProxyLikely: false, proxyTarget: null },
        explainability: {
          confidence: 0.9,
          reasoning: 'no contract bytecode',
          evidence: [{ kind: 'bytecode', ref: address, detail: 'empty' }],
          model: { name: 'risk-v1', version: '1.0.0' }
        }
      };
    }
    const bytecode = code.toLowerCase();
    const bytecodeHash = keccak256(code as `0x${string}`);
    const isProxyLikely = bytecode.includes('363d3d373d3d3d363d73') || bytecode.includes('f4');
    const hasDelegatecall = bytecode.includes('f4');
    const hasSelfdestruct = bytecode.includes('ff');
    const hasCallcode = bytecode.includes('f2');
    const hasOwnerSelector = bytecode.includes('8da5cb5b') || bytecode.includes('f2fde38b');
    const hasReentrancyPattern = bytecode.includes('f1') && bytecode.includes('55');
    const upgradeabilityOpaque = isProxyLikely && !bytecode.includes('5c60da1b');

    const findings = [
      hasDelegatecall
        ? {
            id: 'DELEGATECALL_USAGE',
            severity: 4,
            title: 'Delegatecall usage detected',
            detail: 'Bytecode contains delegatecall opcode',
            evidence: [{ kind: 'bytecode', ref: address, detail: 'opcode f4 present' }]
          }
        : null,
      hasReentrancyPattern
        ? {
            id: 'REENTRANCY_PATTERN',
            severity: 4,
            title: 'Potential reentrancy pattern',
            detail: 'Call followed by state write pattern detected',
            evidence: [{ kind: 'bytecode', ref: address, detail: 'opcode f1 and 55 present' }]
          }
        : null,
      hasOwnerSelector
        ? {
            id: 'OWNER_CENTRALIZATION',
            severity: 3,
            title: 'Owner-managed control surface',
            detail: 'Owner/transferOwnership selectors detected',
            evidence: [{ kind: 'bytecode', ref: address, detail: 'selectors 8da5cb5b/f2fde38b' }]
          }
        : null,
      upgradeabilityOpaque
        ? {
            id: 'UPGRADEABILITY_OPAQUE',
            severity: 3,
            title: 'Proxy pattern without explicit implementation selector',
            detail: 'Proxy-like bytecode without implementation getter selector',
            evidence: [{ kind: 'bytecode', ref: address, detail: 'proxy pattern detected' }]
          }
        : null,
      hasSelfdestruct
        ? {
            id: 'SELFDESTRUCT_PRESENT',
            severity: 3,
            title: 'Selfdestruct opcode present',
            detail: 'Bytecode contains selfdestruct opcode',
            evidence: [{ kind: 'bytecode', ref: address, detail: 'opcode ff present' }]
          }
        : null,
      hasCallcode
        ? {
            id: 'CALLCODE_PRESENT',
            severity: 2,
            title: 'Callcode opcode present',
            detail: 'Bytecode contains callcode opcode',
            evidence: [{ kind: 'bytecode', ref: address, detail: 'opcode f2 present' }]
          }
        : null
    ].filter(Boolean) as Array<{
      id: string;
      severity: 1 | 2 | 3 | 4 | 5;
      title: string;
      detail: string;
      evidence: Array<{ kind: 'bytecode' | 'abi' | 'trace' | 'state'; ref: string; detail: string }>;
    }>;

    const features = [
      hasDelegatecall ? { name: 'delegatecallUsage', weight: 20, detail: 'delegatecall opcode present' } : null,
      hasReentrancyPattern ? { name: 'reentrancyPattern', weight: 25, detail: 'call then state write pattern' } : null,
      hasOwnerSelector ? { name: 'ownerCentralization', weight: 15, detail: 'owner selectors detected' } : null,
      upgradeabilityOpaque ? { name: 'upgradeabilityOpaque', weight: 15, detail: 'proxy pattern without implementation getter' } : null
    ].filter(Boolean) as Array<{ name: string; weight: number; detail: string }>;

    const risk = computeRisk(features);

    const explainability = {
      confidence: 0.78,
      reasoning: findings.length ? `findings:${findings.map((f) => f.id).join(',')}` : 'no high-risk patterns',
      evidence: [
        { kind: 'bytecode', ref: address, detail: bytecodeHash },
        ...findings.flatMap((finding) => finding.evidence)
      ],
      model: { name: 'risk-v1', version: '1.0.0' }
    };

    return {
      chain: chainDescriptor(chain),
      address,
      risk,
      findings,
      fingerprint: {
        bytecodeHash,
        isProxyLikely,
        proxyTarget: null
      },
      explainability
    };
  });

export const buildAiRouter = () => {
  const router = express.Router();
  const guard = requirePermission('ai:read');

  router.get('/ai/modules', guard, (_req, res) => {
    res.json({
      modules: [
        {
          id: 'tx-intel',
          name: 'Transaction Intelligence',
          chainScope: ['L1', 'L2', 'L3'],
          inputSchema: { txHash: '0x...', chain: 'l1|l2|l3' },
          outputSchema: { classification: 'string', riskScore: 'number', explainability: 'object' }
        },
        {
          id: 'wallet-intel',
          name: 'Wallet Intelligence',
          chainScope: ['L1', 'L2', 'L3'],
          inputSchema: { address: '0x...', chain: 'l1|l2|l3' },
          outputSchema: { profile: 'object', explainability: 'object' }
        },
        {
          id: 'contract-intel',
          name: 'Contract Intelligence',
          chainScope: ['L1', 'L2', 'L3'],
          inputSchema: { address: '0x...', chain: 'l1|l2|l3' },
          outputSchema: { risk: 'number', findings: 'array', explainability: 'object' }
        },
        {
          id: 'network-intel',
          name: 'Network & Validator Intelligence',
          chainScope: ['L1', 'L2', 'L3'],
          inputSchema: { chain: 'l1|l2|l3' },
          outputSchema: { status: 'object', explainability: 'object' }
        },
        {
          id: 'bridge-intel',
          name: 'Bridge & Cross-Layer Intelligence',
          chainScope: ['L1', 'L2', 'L3'],
          inputSchema: { chain: 'l1|l2|l3' },
          outputSchema: { flows: 'array', explainability: 'object' }
        },
        {
          id: 'governance-intel',
          name: 'Governance & Protocol Intelligence',
          chainScope: ['L1', 'L2', 'L3'],
          inputSchema: { chain: 'l1|l2|l3' },
          outputSchema: { proposals: 'array', explainability: 'object' }
        },
        {
          id: 'forecasting',
          name: 'Predictive Analytics',
          chainScope: ['L1', 'L2', 'L3'],
          inputSchema: { chain: 'l1|l2|l3' },
          outputSchema: { forecasts: 'array', explainability: 'object' }
        },
        {
          id: 'explainability',
          name: 'Explainability Layer',
          chainScope: ['L1', 'L2', 'L3'],
          inputSchema: { entity: 'string', chain: 'l1|l2|l3', type: 'tx|wallet|contract' },
          outputSchema: { explainability: 'object' }
        }
      ]
    });
  });

  router.get('/ai/tx-intel', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l2');
    const txHash = typeof req.query.txHash === 'string' ? req.query.txHash : '';
    if (!chain.success || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const result = await txIntel(chain.data, txHash);
      const parsed = txIntelSchema.safeParse(result);
      if (!parsed.success) {
        res.status(500).json({ error: 'tx_intel_schema_invalid' });
        return;
      }
      res.json(parsed.data);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'tx_not_found' });
    }
  });

  router.get('/ai/wallet-intel', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l2');
    const address = typeof req.query.address === 'string' ? req.query.address : '';
    const lookbackBlocks = Number(req.query.lookbackBlocks || 20_000);
    const maxTxs = Number(req.query.maxTxs || 200);
    if (!chain.success || !isAddress(address)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const result = await walletIntel(
        chain.data,
        address,
        Number.isFinite(lookbackBlocks) ? lookbackBlocks : 20_000,
        Number.isFinite(maxTxs) ? maxTxs : 200
      );
      const parsed = walletIntelSchema.safeParse(result);
      if (!parsed.success) {
        res.status(500).json({ error: 'wallet_intel_schema_invalid' });
        return;
      }
      res.json(parsed.data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'wallet_error' });
    }
  });

  router.get('/ai/contract-intel', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l2');
    const address = typeof req.query.address === 'string' ? req.query.address : '';
    if (!chain.success || !isAddress(address)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const result = await contractIntel(chain.data, address);
      const parsed = contractIntelSchema.safeParse(result);
      if (!parsed.success) {
        res.status(500).json({ error: 'contract_intel_schema_invalid' });
        return;
      }
      res.json(parsed.data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'contract_error' });
    }
  });

  router.get('/ai/network-intel', guard, async (req, res) => {
    const chainInput = req.query.chain;
    const chains = chainInput ? [chainInput] : ['l1', 'l2', 'l3'];
    const windowBlocks = Number(req.query.windowBlocks || 500);
    const results = await Promise.all(
      chains.map(async (c) => {
        const parsed = chainParam.safeParse(c);
        if (!parsed.success) return null;
        return getProvider(parsed.data, async (provider) => {
          const sampleSize = Number.isFinite(windowBlocks) ? Math.min(Math.max(windowBlocks, 10), 120) : 60;
          const blocks = await fetchLatestBlocks(parsed.data, sampleSize);
          const times = blocks.map((b) => Number(b.timestamp)).filter(Boolean);
          const latest = blocks[blocks.length - 1];
          const deltas = times.slice(1).map((t, idx) => t - times[idx]);
          const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
          const lastAge = latest ? Math.max(0, Math.floor(Date.now() / 1000) - Number(latest.timestamp)) : 0;
          const stalled = avg > 0 && lastAge > avg * 3;
          const warning = avg > 0 && lastAge > avg * 2;
          const txCounts = blocks.map((b) => (b.transactions ? b.transactions.length : 0));
          const txPerBlockAvg = txCounts.length ? txCounts.reduce((a, b) => a + b, 0) / txCounts.length : 0;
          const baseFees = blocks.map((b) => (b.baseFeePerGas ? Number(b.baseFeePerGas) : null)).filter((v): v is number => v !== null);
          let baseFeeTrend: 'DOWN' | 'FLAT' | 'UP' | 'UNKNOWN' = 'UNKNOWN';
          if (baseFees.length >= 4) {
            const mid = Math.floor(baseFees.length / 2);
            const firstAvg = baseFees.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
            const lastAvg = baseFees.slice(mid).reduce((a, b) => a + b, 0) / (baseFees.length - mid);
            if (firstAvg > 0 && lastAvg > firstAvg * 1.1) baseFeeTrend = 'UP';
            else if (firstAvg > 0 && lastAvg < firstAvg * 0.9) baseFeeTrend = 'DOWN';
            else baseFeeTrend = 'FLAT';
          }
          const anomalies = [
            stalled ? { name: 'chain_stall', severity: 4 as const, detail: 'last block age exceeds 3x avg' } : null
          ].filter(Boolean) as Array<{ name: string; severity: 1 | 2 | 3 | 4 | 5; detail: string }>;
          const earlyWarnings = [
            warning ? { name: 'block_delay', severity: 3 as const, detail: 'last block age exceeds 2x avg' } : null
          ].filter(Boolean) as Array<{ name: string; severity: 1 | 2 | 3 | 4 | 5; detail: string }>;
          const features = [
            ...anomalies.map((a) => ({ name: a.name, weight: a.severity * 10, detail: a.detail })),
            ...earlyWarnings.map((a) => ({ name: a.name, weight: a.severity * 5, detail: a.detail }))
          ];
          const risk = computeRisk(features);
          const explainability = buildExplainability(0.7, `avg_block_time:${avg.toFixed(2)}s; last_age:${lastAge}s`, [
            { kind: 'rpc', ref: 'eth_getBlockByNumber', detail: `head:${latest?.number ?? ''}` }
          ]);
          return {
            chain: chainDescriptor(parsed.data),
            risk,
            health: {
              headBlock: latest?.number ?? 0,
              avgBlockTimeSec: avg,
              txPerBlockAvg,
              baseFeeTrend
            },
            anomalies,
            earlyWarnings,
            explainability
          };
        });
      })
    );
    const outputs = results.filter(Boolean) as Array<z.infer<typeof networkIntelSchema>>;
    for (const output of outputs) {
      const parsed = networkIntelSchema.safeParse(output);
      if (!parsed.success) {
        res.status(500).json({ error: 'network_intel_schema_invalid' });
        return;
      }
    }
    res.json({ status: outputs });
  });

  router.get('/ai/bridge-intel', guard, async (req, res) => {
    const lookbackBlocks = Number(req.query.lookbackBlocks || 10_000);
    const l1 = chainDescriptor('l1');
    const l2 = chainDescriptor('l2');
    const l3 = chainDescriptor('l3');
    const l1Addresses = [env.BRIDGE_ADDRESS, env.L1_ROLLUP_L2_ADDRESS]
      .filter((addr): addr is string => Boolean(addr))
      .map((addr) => addr.toLowerCase());
    const l2Addresses = [env.BRIDGE_L2L3_ADDRESS, env.L2_ROLLUP_L3_ADDRESS, env.L3_INBOX_ADDRESS]
      .filter((addr): addr is string => Boolean(addr))
      .map((addr) => addr.toLowerCase());
    if (!l1Addresses.length && !l2Addresses.length) {
      res.json({
        scope: { l1, l2, l3 },
        risk: { score: 0, label: 'SAFE', reasons: [] },
        messages: [],
        stuckSignals: [],
        explainability: buildExplainability(0.6, 'bridge addresses not configured', [
          { kind: 'state', ref: 'bridge_addresses', detail: 'missing' }
        ])
      });
      return;
    }
    const result = await Promise.all([
      getProvider('l1', async (provider) => {
        const latest = await provider.getBlockNumber();
        const fromBlock = Math.max(latest - (Number.isFinite(lookbackBlocks) ? lookbackBlocks : 10_000), 0);
        const logs = l1Addresses.length ? await provider.getLogs({ fromBlock, toBlock: latest, address: l1Addresses }) : [];
        return { logs, latest };
      }),
      getProvider('l2', async (provider) => {
        const latest = await provider.getBlockNumber();
        const fromBlock = Math.max(latest - (Number.isFinite(lookbackBlocks) ? lookbackBlocks : 10_000), 0);
        const logs = l2Addresses.length ? await provider.getLogs({ fromBlock, toBlock: latest, address: l2Addresses }) : [];
        return { logs, latest };
      })
    ]);
    const l1Logs = result[0].logs;
    const l2Logs = result[1].logs;
    const l1Head = result[0].latest;
    const l2Head = result[1].latest;
    const l1Messages = l1Logs.map((log) => {
      const ageBlocks = l1Head - log.blockNumber;
      const status = ageBlocks > 2000 ? 'STUCK' : ageBlocks > 200 ? 'PENDING' : 'FINALIZED';
      return {
        id: `${log.transactionHash}:${log.index}`,
        direction: 'L2_TO_L1' as const,
        srcTxHash: log.transactionHash,
        status,
        ageBlocks,
        detail: `log:${log.topics[0]}`
      };
    });
    const l2Messages = l2Logs.map((log) => {
      const ageBlocks = l2Head - log.blockNumber;
      const status = ageBlocks > 2000 ? 'STUCK' : ageBlocks > 200 ? 'PENDING' : 'FINALIZED';
      return {
        id: `${log.transactionHash}:${log.index}`,
        direction: 'L3_TO_L2' as const,
        srcTxHash: log.transactionHash,
        status,
        ageBlocks,
        detail: `log:${log.topics[0]}`
      };
    });
    const messages = [...l2Messages, ...l1Messages];
    const stuckSignals = messages
      .filter((message) => message.status === 'STUCK')
      .map((message) => ({
        name: 'bridge_message_stuck',
        severity: 4 as const,
        detail: `${message.direction}:${message.id}`
      }));
    const risk = computeRisk(stuckSignals.map((signal) => ({ name: signal.name, weight: 15, detail: signal.detail })));
    const explainability = buildExplainability(0.66, `messages:${messages.length}`, [
      { kind: 'rpc', ref: 'eth_getLogs', detail: `l1:${l1Logs.length} l2:${l2Logs.length}` }
    ]);
    const payload = {
      scope: { l1, l2, l3 },
      risk,
      messages,
      stuckSignals,
      explainability
    };
    const parsed = bridgeIntelSchema.safeParse(payload);
    if (!parsed.success) {
      res.status(500).json({ error: 'bridge_intel_schema_invalid' });
      return;
    }
    res.json(parsed.data);
  });

  router.get('/ai/governance-intel', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l1');
    const proposalId = typeof req.query.proposalId === 'string' ? req.query.proposalId : '';
    if (!chain.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    if (!proposalId) {
      res.status(400).json({ error: 'proposal_id_required' });
      return;
    }
    const governanceAddr = env.GOVERNANCE_CONTRACT_ADDRESS;
    if (!governanceAddr) {
      const payload = {
        chain: chainDescriptor(chain.data),
        proposalId,
        risk: { score: 0, label: 'SAFE', reasons: [] },
        impact: { security: 'LOW', gas: 'NEUTRAL', validatorOps: 'LOW' },
        manipulationSignals: [],
        explainability: buildExplainability(0.6, 'governance contract not configured', [
          { kind: 'state', ref: 'governance_contract', detail: 'missing' }
        ])
      };
      const parsed = governanceIntelSchema.safeParse(payload);
      if (!parsed.success) {
        res.status(500).json({ error: 'governance_intel_schema_invalid' });
        return;
      }
      res.json(parsed.data);
      return;
    }
    const result = await getProvider(chain.data, async (provider) => {
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(latest - 1000, 0);
      const logs = await provider.getLogs({ fromBlock, toBlock: latest, address: governanceAddr });
      const matched = logs.filter((log) => log.topics.some((topic) => topic.toLowerCase().includes(proposalId.toLowerCase().replace(/^0x/, ''))));
      const manipulationSignals = matched.length > 3 ? [{ name: 'proposal_activity_spike', severity: 2 as const, detail: 'high log count' }] : [];
      const risk = computeRisk(manipulationSignals.map((signal) => ({ name: signal.name, weight: 10, detail: signal.detail })));
      const impact = {
        security: matched.length ? 'MEDIUM' : 'LOW',
        gas: 'NEUTRAL',
        validatorOps: 'LOW'
      };
      const explainability = buildExplainability(0.68, `governance_logs:${logs.length}`, [
        { kind: 'rpc', ref: 'eth_getLogs', detail: `from:${fromBlock} to:${latest}` },
        { kind: 'event', ref: governanceAddr, detail: `matches:${matched.length}` }
      ]);
      return {
        chain: chainDescriptor(chain.data),
        proposalId,
        risk,
        impact,
        manipulationSignals,
        explainability
      };
    });
    const parsed = governanceIntelSchema.safeParse(result);
    if (!parsed.success) {
      res.status(500).json({ error: 'governance_intel_schema_invalid' });
      return;
    }
    res.json(parsed.data);
  });

  router.get('/ai/forecasting', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l2');
    const horizonBlocks = Number(req.query.horizonBlocks || 200);
    const windowBlocks = Number(req.query.windowBlocks || 2000);
    if (!chain.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const result = await getProvider(chain.data, async (provider) => {
      const sampleSize = Number.isFinite(windowBlocks) ? Math.min(Math.max(windowBlocks, 20), 200) : 80;
      const blocks = await fetchLatestBlocks(chain.data, sampleSize);
      const gasRatios = blocks
        .map((b) => (b.gasUsed && b.gasLimit ? Number(b.gasUsed) / Number(b.gasLimit) : null))
        .filter((v): v is number => v !== null);
      const baseFees = blocks.map((b) => (b.baseFeePerGas ? Number(b.baseFeePerGas) : null)).filter((v): v is number => v !== null);
      const avgGas = gasRatios.length ? gasRatios.reduce((a, b) => a + b, 0) / gasRatios.length : 0;
      const avgFee = baseFees.length ? baseFees.reduce((a, b) => a + b, 0) / baseFees.length : 0;
      const avgTxPerBlock = blocks.length ? blocks.reduce((sum, b) => sum + (b.transactions ? b.transactions.length : 0), 0) / blocks.length : 0;
      const congestion = avgGas > 0.75 ? 'HIGH' : avgGas > 0.4 ? 'MEDIUM' : 'LOW';
      const confidence = Math.min(0.9, 0.5 + gasRatios.length * 0.01);
      const explainability = buildExplainability(confidence, 'rolling_block_average', [
        { kind: 'rpc', ref: 'eth_getBlockByNumber', detail: `sample:${blocks.length}` }
      ]);
      return {
        chain: chainDescriptor(chain.data),
        horizonBlocks: Number.isFinite(horizonBlocks) ? Math.max(1, horizonBlocks) : 200,
        forecasts: {
          avgGasPriceWei: Math.round(avgFee).toString(),
          congestion,
          avgTxPerBlock
        },
        explainability
      };
    });
    const parsed = forecastingSchema.safeParse(result);
    if (!parsed.success) {
      res.status(500).json({ error: 'forecasting_schema_invalid' });
      return;
    }
    res.json(parsed.data);
  });

  router.get('/ai/explain', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l2');
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const entity = typeof req.query.entity === 'string' ? req.query.entity : '';
    if (!chain.success || !['tx', 'wallet', 'contract'].includes(type) || !entity) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    if (type === 'tx') {
      try {
        const result = await txIntel(chain.data, entity);
        res.json({ explainability: result.explainability });
      } catch (err) {
        res.status(404).json({ error: err instanceof Error ? err.message : 'tx_not_found' });
      }
      return;
    }
    if (type === 'wallet') {
      try {
        const result = await walletIntel(chain.data, entity);
        res.json({ explainability: result.explainability });
      } catch (err) {
        res.status(404).json({ error: err instanceof Error ? err.message : 'wallet_not_found' });
      }
      return;
    }
    try {
      const result = await contractIntel(chain.data, entity);
      res.json({ explainability: result.explainability });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'contract_not_found' });
    }
  });

  return router;
};
