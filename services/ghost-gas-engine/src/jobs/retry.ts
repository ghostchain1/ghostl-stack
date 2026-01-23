import { readFileSync } from 'fs';
import { Wallet } from 'ethers';
import { config, loadChains, loadPolicies, signerForChain } from '../config.js';
import { createGhostRpc, type TxRequest } from '../rpc/ghost-rpc.js';
import { getActivePolicy } from '../policies/policy.js';
import { simulateTx } from '../services/simulator.js';
import { query } from '../db/index.js';
import { classifyFailure } from './classifier.js';
import { runAutonomyDecision, recordAutonomyOutcome, resolveAutonomyConfig } from '../autonomy/engine.js';
import { recordLearningOutcome } from '../ai-core/learn.js';
import { recordActionExecution } from '../ai-core/act.js';
import { recordVerification } from '../ai-core/verify.js';
import { updateDecisionStatus, getDecisionById, getAutonomyOverrides } from '../autonomy/store.js';
import { maybeEvolvePolicy } from '../autonomy/policy-evolution.js';

export type RetryJob = {
  deploymentId: string;
  chainKey: string;
  name?: string;
  txRequest?: TxRequest;
  rawTx?: string;
  foundry?: { path: string; txIndex?: number };
  nonceStrategy?: 'pending' | 'latest' | 'increment';
  mode?: 'OBSERVE_ONLY' | 'ADVISORY' | 'ASSISTED' | 'AUTONOMOUS' | 'AUTONOMOUS_STRICT' | 'DRY_RUN';
  decisionId?: string;
  approved?: boolean;
};

const toBigInt = (value?: string | number | bigint | null): bigint | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  const trimmed = value.toString();
  if (trimmed.startsWith('0x')) return BigInt(trimmed);
  return BigInt(trimmed);
};

const toHex = (value: bigint): string => `0x${value.toString(16)}`;

const loadFoundryTx = (reference: { path: string; txIndex?: number }): TxRequest => {
  const raw = readFileSync(reference.path, 'utf-8');
  const parsed = JSON.parse(raw);
  const index = reference.txIndex ?? 0;
  const tx = parsed?.transactions?.[index];
  if (!tx) throw new Error('foundry_transaction_not_found');
  const request = tx.transaction || tx.tx || tx;
  if (!request) throw new Error('foundry_transaction_invalid');
  return request as TxRequest;
};

const waitForReceipt = async (
  rpc: Awaited<ReturnType<typeof createGhostRpc>>,
  hash: string,
  timeoutMs: number
) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpc.getTransactionReceipt(hash);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
};

export const runRetryJob = async (job: RetryJob) => {
  const chains = loadChains();
  const chain = chains.find((item) => item.key === job.chainKey);
  if (!chain) throw new Error('unknown_chain');

  const policies = loadPolicies();
  const fallback = policies.find((policy) => policy.chainKey === chain.key);
  if (!fallback) throw new Error('missing_policy');

  const rpc = await createGhostRpc(chain.rpcUrl);
  const policy = await getActivePolicy(chain.key, fallback);

  const txTemplate = job.txRequest || (job.foundry ? loadFoundryTx(job.foundry) : undefined);
  if (!txTemplate && !job.rawTx) throw new Error('missing_tx_request');
  if (!txTemplate && job.rawTx) {
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['running', job.deploymentId]);
    const txHash = await rpc.sendRawTransaction(job.rawTx);
    const receipt = await waitForReceipt(rpc, txHash, config.REQUEST_TIMEOUT_MS * 4);
    const status = receipt?.status === '0x1' || receipt?.status === 1 ? 'success' : 'failed';
    await query(
      `INSERT INTO gas_deployment_attempts (deployment_id, decision_id, attempt, tx_hash, status, failure_reason, classification)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        job.deploymentId,
        job.decisionId ?? null,
        1,
        txHash,
        status,
        receipt?.revertReason || null,
        status === 'success' ? 'CHAIN_OK' : 'RPC_NODE_BUG'
      ]
    );
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', [status, job.deploymentId]);
    return;
  }

  const initialSimulation = await simulateTx(chain, policy, txTemplate as TxRequest, rpc);
  await query(
    `INSERT INTO gas_simulations (chain_key, tx_request, estimated_gas, recommended_gas_limit, block_gas_limit, margin_percent, failure_reason, rpc_namespace)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      chain.key,
      txTemplate,
      initialSimulation.estimatedGas.toString(),
      initialSimulation.recommendedGasLimit.toString(),
      initialSimulation.blockGasLimit.toString(),
      initialSimulation.marginPercent,
      initialSimulation.likelyFailureReason,
      initialSimulation.rpcNamespace
    ]
  );

  const overrides = await getAutonomyOverrides();
  const settings = resolveAutonomyConfig(overrides);
  const existingDecision = job.decisionId ? await getDecisionById(job.decisionId) : null;
  const decisionResult = existingDecision
    ? { decision: existingDecision, aiDecisionId: null }
    : await runAutonomyDecision({
        chain,
        policy,
        simulation: initialSimulation,
        mode: job.mode,
        deploymentId: job.deploymentId
      });
  const decision = decisionResult.decision;
  const aiDecisionId = decisionResult.aiDecisionId;

  await query('UPDATE gas_deployments SET mode = $1, updated_at = now() WHERE id = $2', [
    decision.mode,
    job.deploymentId
  ]);

  if (decision.action === 'observe_only') {
    await updateDecisionStatus(decision.id, 'executed');
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['observed', job.deploymentId]);
    await recordAutonomyOutcome(chain.key, decision.id, {
      deploymentId: job.deploymentId,
      outcome: 'observed'
    });
    return;
  }

  if (decision.action === 'needs_approval' && !job.approved) {
    await updateDecisionStatus(decision.id, 'pending');
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['awaiting_approval', job.deploymentId]);
    return;
  }

  if (decision.action === 'abort') {
    await updateDecisionStatus(decision.id, 'blocked');
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['blocked', job.deploymentId]);
    await recordAutonomyOutcome(chain.key, decision.id, {
      deploymentId: job.deploymentId,
      outcome: 'blocked',
      reason: 'autonomy_abort'
    });
    return;
  }

  if (job.approved) {
    await updateDecisionStatus(decision.id, 'approved');
  }

  const signerKey = signerForChain(chain.key);
  if (!signerKey) throw new Error('missing_signer_private_key');

  const wallet = new Wallet(signerKey);
  const from = txTemplate?.from || wallet.address;

  if (txTemplate?.from && txTemplate.from.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('signer_mismatch');
  }

  const nonceBase = txTemplate?.nonce
    ? toBigInt(txTemplate.nonce)
    : toBigInt(await rpc.getTransactionCount(from, job.nonceStrategy === 'latest' ? 'latest' : 'pending'));

  if (nonceBase === null) throw new Error('nonce_unavailable');

  let lastHash: string | null = null;
  let lastGasLimit: bigint | null = null;
  let lastClassification: string | null = null;

  const applyPolicyEvolution = async () => {
    if (!settings.enabled) return;
    const summary = await query<{ total: string; success: string; out_of_gas: string }>(
      `SELECT COUNT(*)::text as total,
              COUNT(*) FILTER (WHERE status = 'success')::text as success,
              COUNT(*) FILTER (WHERE classification = 'OUT_OF_GAS')::text as out_of_gas
       FROM gas_deployment_attempts a
       JOIN gas_deployments d ON d.id = a.deployment_id
       WHERE d.chain_key = $1`,
      [chain.key]
    );

    const totals = summary[0];
    const totalAttempts = Number(totals?.total || 0);
    const successRate = totalAttempts ? Number(totals?.success || 0) / totalAttempts : 0;
    const outOfGasRate = totalAttempts ? Number(totals?.out_of_gas || 0) / totalAttempts : 0;
    await maybeEvolvePolicy({
      chainKey: chain.key,
      policy,
      successRate,
      outOfGasRate,
      overridesLocked: settings.policyLock
    });
  };

  const maxRetries = decision.selectedMaxRetries ?? Math.min(policy.retry.maxRetries, settings.maxRetries);
  const baseGasLimitRaw = decision.selectedGasLimit
    ? BigInt(decision.selectedGasLimit)
    : initialSimulation.recommendedGasLimit;
  const policyMaxGas = Math.min(policy.maxGasLimit, settings.maxGasLimit);
  const baseGasLimit = baseGasLimitRaw > BigInt(policyMaxGas) ? BigInt(policyMaxGas) : baseGasLimitRaw;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['running', job.deploymentId]);

    const simulation = await simulateTx(chain, policy, txTemplate as TxRequest, rpc);
    await query(
      `INSERT INTO gas_simulations (chain_key, tx_request, estimated_gas, recommended_gas_limit, block_gas_limit, margin_percent, failure_reason, rpc_namespace)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        chain.key,
        txTemplate,
        simulation.estimatedGas.toString(),
        simulation.recommendedGasLimit.toString(),
        simulation.blockGasLimit.toString(),
        simulation.marginPercent,
        simulation.likelyFailureReason,
        simulation.rpcNamespace
      ]
    );
    const stepFactor = BigInt(Math.round(Math.pow(policy.retry.multiplierStep, attempt - 1) * 100));
    let gasLimit = baseGasLimit * stepFactor / BigInt(100);
    const maxGas = BigInt(policyMaxGas);
    if (gasLimit > maxGas) gasLimit = maxGas;
    const maxBlock = simulation.blockGasLimit * BigInt(98) / BigInt(100);
    if (gasLimit > maxBlock) gasLimit = maxBlock;

    if (gasLimit >= maxBlock) {
      await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['failed', job.deploymentId]);
      throw new Error('gas_limit_exceeds_block_limit');
    }

    const feeData = await rpc.getFeeData();
    const nonce = nonceBase + BigInt(attempt - 1);

    const tx = {
      to: txTemplate?.to,
      data: txTemplate?.data,
      value: txTemplate?.value,
      nonce: Number(nonce),
      chainId: chain.chainId,
      gasLimit: gasLimit,
      ...(feeData.gasPrice
        ? { gasPrice: feeData.gasPrice }
        : {
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            type: 2
          })
    };

    await recordActionExecution({
      chainKey: chain.key,
      decisionId: aiDecisionId ?? decision.id,
      actionType: attempt === 1 ? 'submit' : 'retry',
      status: 'started',
      payload: { attempt, gasLimit: gasLimit.toString() }
    });

    let txHash: string | null = null;
    let receipt: any = null;
    let trace: any = null;
    let sendError: string | null = null;
    try {
      const rawTx = await wallet.signTransaction(tx);
      txHash = await rpc.sendRawTransaction(rawTx);
      receipt = await waitForReceipt(rpc, txHash, config.REQUEST_TIMEOUT_MS * 4);
      trace = receipt ? await rpc.traceTransaction(txHash) : null;
    } catch (err) {
      sendError = err instanceof Error ? err.message : 'send_failed';
    }

    const gasUsed = receipt?.gasUsed ? BigInt(receipt.gasUsed) : null;
    const classification = classifyFailure({
      error: sendError || receipt?.revertReason || null,
      trace,
      receiptStatus: receipt?.status ? Number(receipt.status) : null,
      gasUsed,
      gasLimit,
      estimatedGas: simulation.estimatedGas,
      txHashChanged: txHash ? (lastHash ? lastHash !== txHash : true) : false,
      gasLimitChanged: lastGasLimit ? lastGasLimit !== gasLimit : true,
      toolingOverrideExpected: true
    });

    lastClassification = classification;

    await query(
      `INSERT INTO gas_deployment_attempts
      (deployment_id, decision_id, attempt, tx_hash, nonce, gas_limit, gas_price, max_fee_per_gas, max_priority_fee_per_gas, status, failure_reason, classification, gas_used)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        job.deploymentId,
        decision.id,
        attempt,
        txHash,
        nonce.toString(),
        gasLimit.toString(),
        feeData.gasPrice?.toString() ?? null,
        feeData.maxFeePerGas?.toString() ?? null,
        feeData.maxPriorityFeePerGas?.toString() ?? null,
        receipt?.status === '0x1' || receipt?.status === 1 ? 'success' : 'failed',
        sendError || receipt?.revertReason || null,
        classification,
        gasUsed?.toString() ?? null
      ]
    );

    await recordVerification({
      chainKey: chain.key,
      decisionId: aiDecisionId ?? decision.id,
      txHash: txHash ?? null,
      status: receipt?.status === '0x1' || receipt?.status === 1 ? 'success' : 'failed',
      classification
    });

    await recordLearningOutcome({
      chainKey: chain.key,
      classification,
      errorSignature: (sendError || receipt?.revertReason || classification) as string,
      deploymentId: job.deploymentId,
      attempt
    });

    if (receipt && txHash) {
      await query(
        `INSERT INTO gas_tx_receipts (tx_hash, receipt, status, gas_used, effective_gas_price, block_number)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tx_hash) DO NOTHING`,
        [
          txHash,
          receipt,
          receipt?.status ? Number(receipt.status) : null,
          gasUsed?.toString() ?? null,
          receipt?.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice).toString() : null,
          receipt?.blockNumber ? Number(receipt.blockNumber) : null
        ]
      );
    }

    if (trace && txHash) {
      await query(
        `INSERT INTO gas_traces (tx_hash, trace)
         VALUES ($1,$2)
         ON CONFLICT (tx_hash) DO NOTHING`,
        [txHash, trace]
      );
    }

    if (txHash) lastHash = txHash;
    lastGasLimit = gasLimit;

    if (receipt?.status === '0x1' || receipt?.status === 1) {
      await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['success', job.deploymentId]);
      await updateDecisionStatus(decision.id, 'executed');
      await recordAutonomyOutcome(chain.key, decision.id, {
        deploymentId: job.deploymentId,
        outcome: 'success',
        attempts: attempt,
        gasLimit: gasLimit.toString(),
        gasUsed: gasUsed?.toString() ?? null,
        classification
      });
      await applyPolicyEvolution();
      return;
    }

    if (classification === 'LOGICAL_REVERT' || classification === 'CHAIN_CONFIG_BUG') {
      await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['failed', job.deploymentId]);
      await updateDecisionStatus(decision.id, 'executed');
      await recordAutonomyOutcome(chain.key, decision.id, {
        deploymentId: job.deploymentId,
        outcome: 'failed',
        attempts: attempt,
        gasLimit: gasLimit.toString(),
        classification
      });
      await applyPolicyEvolution();
      return;
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, policy.retry.backoffMs));
    }
  }

  await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['failed', job.deploymentId]);
  await updateDecisionStatus(decision.id, 'executed');
  await recordAutonomyOutcome(chain.key, decision.id, {
    deploymentId: job.deploymentId,
    outcome: 'failed',
    attempts: maxRetries,
    classification: lastClassification ?? 'OUT_OF_GAS'
  });
  await applyPolicyEvolution();
};
