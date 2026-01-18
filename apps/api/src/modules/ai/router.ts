import express from 'express';
import { z } from 'zod';
import { ghostWalletRpcManager } from '../../services/rpc-manager';
import { env } from '../../config/env';
import { requirePermission } from '../../lib/rbac';

type ChainRef = 'l1' | 'l2' | 'l3';

const chainParam = z.enum(['l1', 'l2', 'l3']);

const selectorMap = {
  governance: new Set(['0x7d5e81e2', '0x15373e3d', '0x7f3b3035']),
  staking: new Set(['0xa694fc3a', '0x5c19a95c', '0x4f2be91f'])
};

const nowIso = () => new Date().toISOString();

const toBigInt = (value?: string | null) => {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
};

const weiToEth = (value: bigint) => Number(value) / 1e18;

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

const buildExplainability = (confidence: number, reasoning: string, refs: Record<string, string | number | null>) => ({
  confidence,
  reasoning,
  dataRefs: refs
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
    let classification: 'transfer' | 'contract call' | 'bridge' | 'governance' | 'staking' = 'contract call';
    if (!tx.to) classification = 'contract call';
    else if (addresses.has(to || '')) classification = 'bridge';
    else if (env.GOVERNANCE_CONTRACT_ADDRESS && to === env.GOVERNANCE_CONTRACT_ADDRESS.toLowerCase()) classification = 'governance';
    else if (env.STAKING_CONTRACT_ADDRESS && to === env.STAKING_CONTRACT_ADDRESS.toLowerCase()) classification = 'staking';
    else if (selectorMap.governance.has(selector)) classification = 'governance';
    else if (selectorMap.staking.has(selector)) classification = 'staking';
    else if (!selector || selector === '0x') classification = 'transfer';
    const baseFee = block?.baseFeePerGas ? BigInt(block.baseFeePerGas.toString()) : 0n;
    const gasPaid = receipt?.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice.toString()) : toBigInt(tx.gasPrice);
    const value = toBigInt(tx.value?.toString());
    const highGas = baseFee > 0n && gasPaid > baseFee * 10n;
    const highValue = weiToEth(value) > 100;
    const anomalies = [
      highGas ? 'gas_outlier' : null,
      highValue ? 'value_outlier' : null,
      receipt && receipt.status === 0 ? 'reverted' : null
    ].filter(Boolean) as string[];
    const riskScore = Math.min(1, anomalies.length * 0.35 + (classification === 'bridge' ? 0.2 : 0));
    const reasoning = [
      `classification:${classification}`,
      highGas ? 'gas_outlier' : null,
      highValue ? 'value_outlier' : null,
      receipt && receipt.status === 0 ? 'reverted' : null
    ]
      .filter(Boolean)
      .join('; ');
    const explainability = buildExplainability(0.72, reasoning || 'transaction signals', {
      txHash,
      blockNumber: tx.blockNumber ?? null,
      blockHash: block?.hash || null,
      from: tx.from,
      to: tx.to || null,
      selector: selector || null
    });
    return {
      txHash,
      chain,
      classification,
      anomalies,
      riskScore,
      explainability
    };
  });

const walletIntel = async (chain: ChainRef, address: string) =>
  getProvider(chain, async (provider) => {
    const balance = await provider.getBalance(address);
    const nonce = await provider.getTransactionCount(address);
    const code = await provider.getCode(address);
    const latest = await provider.getBlockNumber();
    const lookback = Math.max(latest - 8, 0);
    const pastBalance = await provider.getBalance(address, lookback);
    const delta = balance - pastBalance;
    const recentBlocks = await fetchLatestBlocks(chain, 5);
    const related = new Set<string>();
    let recentTxs = 0;
    recentBlocks.forEach((block) => {
      (block.transactions || []).forEach((tx: any) => {
        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase();
        if (from === address.toLowerCase() || to === address.toLowerCase()) {
          recentTxs += 1;
          if (from) related.add(from);
          if (to) related.add(to);
        }
      });
    });
    related.delete(address.toLowerCase());
    const balanceDrop = pastBalance > 0n && balance * 100n < pastBalance * 50n;
    const phishingRisk = balanceDrop && recentTxs > 0;
    const riskScore = Math.min(1, (phishingRisk ? 0.7 : 0) + (nonce > 50 ? 0.2 : 0));
    const reasoning = [
      code !== '0x' ? 'contract_address' : 'externally_owned',
      balanceDrop ? 'balance_drop' : null,
      recentTxs ? `recent_txs:${recentTxs}` : null
    ]
      .filter(Boolean)
      .join('; ');
    const explainability = buildExplainability(0.68, reasoning || 'wallet signals', {
      address,
      balance: balance.toString(),
      nonce,
      lookbackBlock: lookback,
      balanceDelta: delta.toString()
    });
    return {
      address,
      chain,
      profile: {
        balance: balance.toString(),
        nonce,
        isContract: code !== '0x',
        recentTxs,
        relatedWallets: Array.from(related),
        phishingRisk,
        riskScore
      },
      explainability
    };
  });

const contractIntel = async (chain: ChainRef, address: string) =>
  getProvider(chain, async (provider) => {
    const code = await provider.getCode(address);
    if (!code || code === '0x') {
      return {
        address,
        chain,
        risk: 0,
        findings: ['no_bytecode'],
        explainability: buildExplainability(0.9, 'no contract bytecode', { address })
      };
    }
    const bytecode = code.replace(/^0x/, '');
    const hasDelegatecall = bytecode.includes('f4');
    const hasSelfdestruct = bytecode.includes('ff');
    const hasCallcode = bytecode.includes('f2');
    const findings = [
      hasDelegatecall ? 'delegatecall' : null,
      hasSelfdestruct ? 'selfdestruct' : null,
      hasCallcode ? 'callcode' : null,
      `bytecode_bytes:${bytecode.length / 2}`
    ].filter(Boolean) as string[];
    const risk = Math.min(1, (hasDelegatecall ? 0.4 : 0) + (hasSelfdestruct ? 0.3 : 0) + (hasCallcode ? 0.2 : 0));
    const explainability = buildExplainability(0.76, findings.join('; '), { address, bytecodeSize: bytecode.length / 2 });
    return { address, chain, risk, findings, explainability };
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
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'tx_not_found' });
    }
  });

  router.get('/ai/wallet-intel', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l2');
    const address = typeof req.query.address === 'string' ? req.query.address : '';
    if (!chain.success || !isAddress(address)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const result = await walletIntel(chain.data, address);
      res.json(result);
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
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'contract_error' });
    }
  });

  router.get('/ai/network-intel', guard, async (req, res) => {
    const chainInput = req.query.chain;
    const chains = chainInput ? [chainInput] : ['l1', 'l2', 'l3'];
    const results = await Promise.all(
      chains.map(async (c) => {
        const parsed = chainParam.safeParse(c);
        if (!parsed.success) return null;
        return getProvider(parsed.data, async (provider) => {
          const blocks = await fetchLatestBlocks(parsed.data, 6);
          const times = blocks.map((b) => Number(b.timestamp)).filter(Boolean);
          const latest = blocks[blocks.length - 1];
          const deltas = times.slice(1).map((t, idx) => t - times[idx]);
          const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
          const lastAge = latest ? Math.max(0, Math.floor(Date.now() / 1000) - Number(latest.timestamp)) : 0;
          const stalled = avg > 0 && lastAge > avg * 3;
          const status = stalled ? 'DEGRADED' : 'OK';
          const explainability = buildExplainability(0.7, `avg_block_time:${avg.toFixed(2)}s; last_age:${lastAge}s`, {
            chain: parsed.data,
            latestBlock: latest?.number ?? null
          });
          return {
            chain: parsed.data,
            avgBlockTimeSec: avg,
            lastBlockAgeSec: lastAge,
            stalled,
            status,
            explainability
          };
        });
      })
    );
    res.json({ status: results.filter(Boolean) });
  });

  router.get('/ai/bridge-intel', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l2');
    if (!chain.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const bridgeAddresses = [env.BRIDGE_L2L3_ADDRESS, env.L1_ROLLUP_L2_ADDRESS, env.L2_ROLLUP_L3_ADDRESS, env.L3_INBOX_ADDRESS]
      .filter((addr): addr is string => Boolean(addr))
      .map((addr) => addr.toLowerCase());
    if (!bridgeAddresses.length) {
      res.json({
        chain: chain.data,
        flows: [],
        explainability: buildExplainability(0.6, 'bridge addresses not configured', { chain: chain.data })
      });
      return;
    }
    const result = await getProvider(chain.data, async (provider) => {
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(latest - 500, 0);
      const logs = await provider.getLogs({ fromBlock, toBlock: latest, address: bridgeAddresses });
      const lastLog = logs[logs.length - 1];
      const lastBlock = lastLog ? await provider.getBlock(lastLog.blockNumber) : null;
      const lastSeen = lastBlock ? Number(lastBlock.timestamp) : null;
      const delaySec = lastSeen ? Math.max(0, Math.floor(Date.now() / 1000) - lastSeen) : null;
      const stuck = delaySec !== null && delaySec > 600;
      const explainability = buildExplainability(0.66, `logs:${logs.length}; delay:${delaySec ?? 'n/a'}s`, {
        chain: chain.data,
        fromBlock,
        latestBlock: latest
      });
      return {
        chain: chain.data,
        flows: [
          {
            addresses: bridgeAddresses,
            totalEvents: logs.length,
            lastEventBlock: lastLog?.blockNumber ?? null,
            delaySec,
            stuck,
            fraudLikelihood: stuck ? 0.6 : 0.1
          }
        ],
        explainability
      };
    });
    res.json(result);
  });

  router.get('/ai/governance-intel', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l1');
    if (!chain.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const governanceAddr = env.GOVERNANCE_CONTRACT_ADDRESS;
    if (!governanceAddr) {
      res.json({
        chain: chain.data,
        proposals: [],
        explainability: buildExplainability(0.6, 'governance contract not configured', { chain: chain.data })
      });
      return;
    }
    const result = await getProvider(chain.data, async (provider) => {
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(latest - 500, 0);
      const logs = await provider.getLogs({ fromBlock, toBlock: latest, address: governanceAddr });
      const proposals = logs.map((log) => ({
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        topic0: log.topics[0]
      }));
      const explainability = buildExplainability(0.68, `governance_logs:${logs.length}`, {
        chain: chain.data,
        contract: governanceAddr,
        fromBlock,
        latestBlock: latest
      });
      return {
        chain: chain.data,
        proposals,
        explainability
      };
    });
    res.json(result);
  });

  router.get('/ai/forecasting', guard, async (req, res) => {
    const chain = chainParam.safeParse(req.query.chain || 'l2');
    if (!chain.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const result = await getProvider(chain.data, async (provider) => {
      const blocks = await fetchLatestBlocks(chain.data, 8);
      const gasRatios = blocks
        .map((b) => (b.gasUsed && b.gasLimit ? Number(b.gasUsed) / Number(b.gasLimit) : null))
        .filter((v): v is number => v !== null);
      const baseFees = blocks.map((b) => (b.baseFeePerGas ? Number(b.baseFeePerGas) : null)).filter((v): v is number => v !== null);
      const avgGas = gasRatios.length ? gasRatios.reduce((a, b) => a + b, 0) / gasRatios.length : 0;
      const avgFee = baseFees.length ? baseFees.reduce((a, b) => a + b, 0) / baseFees.length : 0;
      const confidence = Math.min(0.9, 0.5 + gasRatios.length * 0.05);
      const forecasts = [
        { metric: 'congestion', horizon: '15m', value: avgGas, confidence },
        { metric: 'gas', horizon: '15m', value: avgFee, confidence },
        { metric: 'validator_load', horizon: '15m', value: avgGas, confidence }
      ];
      const explainability = buildExplainability(confidence, 'rolling_block_average', {
        chain: chain.data,
        sampleBlocks: blocks.length
      });
      return { chain: chain.data, forecasts, explainability };
    });
    res.json(result);
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
