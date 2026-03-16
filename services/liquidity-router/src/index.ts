import "dotenv/config";
import fs from "node:fs/promises";
import express from "express";
import { ghost } from "@ghostchain/sdk";
import {
  AdapterRegistryAbi,
  CircuitBreakerAbi,
  LoadBalancerVaultAbi,
  PolicyRegistryAbi,
  SettlementOracleAbi
} from "./abi.js";
import { appendAuditLog, hashJson, signAuditRecord } from "./audit.js";
import { parseRpcUrlList, RpcPool, type ExternalRpcMap, type LatestBlockInfo } from "./rpc.js";
import {
  breakerStateGauge,
  breakerState,
  deployedPrincipalGauge,
  deployedPrincipal,
  externalRpcBlockAgeGauge,
  externalRpcLatencyGauge,
  externalRpcUpGauge,
  gravityIndexGauge,
  policyViolationCounter,
  policyViolationsTotal,
  registry,
  riskScoreGauge,
  settlementLagGauge,
  settlementLagSeconds,
  yieldAccrued,
  yieldSettledCounter,
  yieldSettled
} from "./metrics.js";

const env = process.env;

const VAULT_ADDR = env.VAULT_ADDR || "";
const VAULT_TOKEN = env.VAULT_TOKEN || "";
const LGE_VAULT_PATH = env.LGE_VAULT_PATH || "secret/data/ghost/liquidity-router";
const VAULT_TIMEOUT_MS = Number(env.LGE_VAULT_TIMEOUT_MS || "2000");
let vaultLoaded = false;
let vaultData: Record<string, unknown> | null = null;

const loadVaultSecrets = async () => {
  if (vaultLoaded) return vaultData;
  vaultLoaded = true;
  if (!VAULT_ADDR || !VAULT_TOKEN) return null;

  const url = `${VAULT_ADDR.replace(/\/$/, "")}/v1/${LGE_VAULT_PATH.replace(/^\//, "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "X-Vault-Token": VAULT_TOKEN }, signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.json();
    const data = (body as any)?.data?.data || (body as any)?.data;
    if (!data || typeof data !== "object") return null;
    vaultData = data as Record<string, unknown>;
    return vaultData;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const readSecret = async (key: string): Promise<string> => {
  const filePath = env[`${key}_FILE`] || "";
  if (filePath) {
    try {
      const value = String(await fs.readFile(filePath, "utf8")).trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  if (env[key]) return env[key] || "";
  const vault = await loadVaultSecrets();
  const allow = new Set(["LGE_OPERATOR_PRIVATE_KEY", "LGE_RELAYER_PRIVATE_KEYS"]);
  if (vault && allow.has(key)) {
    const v = vault[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

const PORT = Number(env.PORT || "7607");
const AUDIT_DIR = env.AUDIT_DIR || "/audit";
const LOOP_MS = Math.max(1000, Number(env.LGE_LOOP_MS || "10000"));
const SETTLEMENT_LEAD_SECONDS = Math.max(10, Number(env.LGE_SETTLEMENT_LEAD_SECONDS || "60"));

const DRY_RUN = (env.LGE_WRITE_ENABLED || "0") !== "1";

const RPC_L1 = env.RPC_L1 || "http://localhost:18545";
const RPC_TIMEOUT_MS = Math.max(250, Number(env.LGE_RPC_TIMEOUT_MS || "1500"));

const EXTERNAL_RPC_DEFAULT_URLS = parseRpcUrlList(env.LGE_EXTERNAL_RPC || "");
const EXTERNAL_RPCS_JSON_RAW = env.LGE_EXTERNAL_RPCS_JSON || env.LGE_EXTERNAL_RPCS || "";
const EXTERNAL_RPC_MAP: ExternalRpcMap = (() => {
  if (!EXTERNAL_RPCS_JSON_RAW.trim()) return {};
  try {
    const parsed = JSON.parse(EXTERNAL_RPCS_JSON_RAW);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ExternalRpcMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const urls = value.map((u) => String(u)).flatMap(parseRpcUrlList);
      if (urls.length > 0) out[key] = urls;
    }
    return out;
  } catch {
    // eslint-disable-next-line no-console
    console.warn("Invalid JSON in LGE_EXTERNAL_RPCS_JSON/LGE_EXTERNAL_RPCS; falling back to LGE_EXTERNAL_RPC");
    return {};
  }
})();

const VAULT_ADDRESS = env.LGE_VAULT_ADDRESS || "";
const ORACLE_ADDRESS = env.LGE_ORACLE_ADDRESS || "";
const ADAPTER_REGISTRY_ADDRESS = env.LGE_ADAPTER_REGISTRY_ADDRESS || "";
const BREAKER_ADDRESS = env.LGE_CIRCUIT_BREAKER_ADDRESS || "";
const POLICY_REGISTRY_ADDRESS = env.POLICY_REGISTRY_ADDRESS || env.LGE_POLICY_REGISTRY_ADDRESS || "";

const SETTLEMENT_ASSET = env.LGE_SETTLEMENT_ASSET || env.GAS_TOKEN_ADDRESS_L1 || env.CANONICAL_GAS_TOKEN_ADDRESS || ""; // ERC20 address or "native"
const SETTLEMENT_YIELD_WEI = env.LGE_SETTLEMENT_YIELD_WEI || "0";
const SETTLEMENT_FEE_WEI = env.LGE_SETTLEMENT_FEE_WEI || "0";

const ZK_PROVER_URL = env.LGE_ZK_PROVER_URL || "";
const ZK_PROVER_TIMEOUT_MS = Math.max(250, Number(env.LGE_ZK_PROVER_TIMEOUT_MS || "5000"));

const DEPLOY_ASSET = env.LGE_DEPLOY_ASSET || SETTLEMENT_ASSET;
const DEPLOY_TARGET_WEI = env.LGE_DEPLOY_TARGET_WEI || "0";
const DEPLOY_STEP_WEI = env.LGE_DEPLOY_STEP_WEI || "0";
const MAX_RISK = Math.max(0, Math.min(1, Number(env.LGE_MAX_RISK || "0.65")));

const STRATEGY_ID = env.LGE_STRATEGY_ID ? (env.LGE_STRATEGY_ID as `0x${string}`) : ghost.id("lge.strategy.mock");

const adapterIds = (env.LGE_ADAPTER_IDS || "1")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

if (!VAULT_ADDRESS || !ORACLE_ADDRESS || !ADAPTER_REGISTRY_ADDRESS || !BREAKER_ADDRESS) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing env: LGE_VAULT_ADDRESS, LGE_ORACLE_ADDRESS, LGE_ADAPTER_REGISTRY_ADDRESS, LGE_CIRCUIT_BREAKER_ADDRESS"
  );
  process.exit(1);
}

const OPERATOR_PRIVATE_KEY = await readSecret("LGE_OPERATOR_PRIVATE_KEY");
const RELAYER_PRIVATE_KEYS_RAW = await readSecret("LGE_RELAYER_PRIVATE_KEYS");

const operatorWallet = OPERATOR_PRIVATE_KEY ? new ghost.Wallet(OPERATOR_PRIVATE_KEY) : null;
const relayerWallets: ghost.Wallet[] = RELAYER_PRIVATE_KEYS_RAW
  ? RELAYER_PRIVATE_KEYS_RAW.split(",").map((k) => new ghost.Wallet(k.trim())).filter(Boolean)
  : [];

const l1Provider = new ghost.JsonRpcProvider(RPC_L1);
const l1Signer = operatorWallet ? operatorWallet.connect(l1Provider) : null;

const adapterRegistry = new ghost.Contract(ADAPTER_REGISTRY_ADDRESS, AdapterRegistryAbi, l1Provider);
const breaker = new ghost.Contract(BREAKER_ADDRESS, CircuitBreakerAbi, l1Provider);
const vault = new ghost.Contract(VAULT_ADDRESS, LoadBalancerVaultAbi, l1Signer || l1Provider);
const oracle = new ghost.Contract(ORACLE_ADDRESS, SettlementOracleAbi, l1Signer || l1Provider);
const policyRegistry = POLICY_REGISTRY_ADDRESS
  ? new ghost.Contract(POLICY_REGISTRY_ADDRESS, PolicyRegistryAbi, l1Provider)
  : null;

const app = express();
app.use(express.json());

const logEvent = (level: "info" | "warn" | "error", message: string, extra: Record<string, unknown> = {}) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, service: "liquidity-router", ...extra }));
};

const policySnapshot = async () => {
  if (!policyRegistry) return { ok: false as const };
  try {
    const constitutionHash = await policyRegistry.constitutionHash();
    return { ok: true as const, constitutionHash: String(constitutionHash) };
  } catch (e) {
    return { ok: false as const, error: (e as any)?.message || String(e) };
  }
};

const externalPools = new Map<string, RpcPool>();
const getExternalPool = (externalChainId: bigint): RpcPool | null => {
  const key = externalChainId.toString();
  const existing = externalPools.get(key);
  if (existing) return existing;
  const urls = EXTERNAL_RPC_MAP[key] && EXTERNAL_RPC_MAP[key].length > 0 ? EXTERNAL_RPC_MAP[key] : EXTERNAL_RPC_DEFAULT_URLS;
  if (!urls || urls.length === 0) return null;
  const pool = new RpcPool(urls);
  externalPools.set(key, pool);
  return pool;
};

type CommitmentResult = { commitment: string; external: LatestBlockInfo | null; blockAgeSec: number | null };

const computeCommitment = async (adapterId: number, externalChainId: bigint): Promise<CommitmentResult> => {
  const pool = getExternalPool(externalChainId);
  if (!pool) {
    return {
      commitment: ghost.keccak256(
        ghost.toUtf8Bytes(`lge:static:${adapterId}:${externalChainId.toString()}:${Math.floor(Date.now() / 1000)}`)
      ),
      external: null,
      blockAgeSec: null
    };
  }

  try {
    const latest = await pool.fetchLatestBlock(externalChainId, RPC_TIMEOUT_MS);
    const age = Math.max(0, Math.floor(Date.now() / 1000) - latest.blockTimestamp);
    externalRpcUpGauge.set({ externalChainId: externalChainId.toString() }, 1);
    externalRpcLatencyGauge.set({ externalChainId: externalChainId.toString() }, latest.latencyMs);
    externalRpcBlockAgeGauge.set({ externalChainId: externalChainId.toString() }, age);

    const bundle = {
      adapterId,
      externalChainId: externalChainId.toString(),
      externalBlockNumber: latest.blockNumber,
      externalBlockHash: latest.blockHash
    };
    return { commitment: hashJson(bundle), external: latest, blockAgeSec: age };
  } catch (e) {
    externalRpcUpGauge.set({ externalChainId: externalChainId.toString() }, 0);
    throw e;
  }
};

const parseSettlementAsset = () => {
  if (!SETTLEMENT_ASSET) return { kind: "missing" as const };
  if (SETTLEMENT_ASSET === "native") return { kind: "native" as const };
  if (!ghost.isAddress(SETTLEMENT_ASSET)) return { kind: "invalid" as const, value: SETTLEMENT_ASSET };
  return { kind: "erc20" as const, address: ghost.getAddress(SETTLEMENT_ASSET) };
};

const settlementAsset = parseSettlementAsset();
if (settlementAsset.kind === "missing" || settlementAsset.kind === "invalid") {
  // eslint-disable-next-line no-console
  console.error("Invalid env: LGE_SETTLEMENT_ASSET must be an ERC20 address or 'native'");
  process.exit(1);
}

const deployAsset = (() => {
  if (!DEPLOY_ASSET) return { kind: "missing" as const };
  if (DEPLOY_ASSET === "native") return { kind: "native" as const };
  if (!ghost.isAddress(DEPLOY_ASSET)) return { kind: "invalid" as const, value: DEPLOY_ASSET };
  return { kind: "erc20" as const, address: ghost.getAddress(DEPLOY_ASSET) };
})();
if (deployAsset.kind === "missing" || deployAsset.kind === "invalid") {
  // eslint-disable-next-line no-console
  console.error("Invalid env: LGE_DEPLOY_ASSET must be an ERC20 address or 'native'");
  process.exit(1);
}

const toBigInt = (label: string, value: string) => {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`invalid_${label}:${value}`);
  }
};

const normalizeHex = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const requestZkProof = async (payload: Record<string, unknown>): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ZK_PROVER_TIMEOUT_MS);
  try {
    const res = await fetch(ZK_PROVER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`zk_prover_http_${res.status}`);
    const body = (await res.json()) as any;
    const proof = body?.proof;
    if (typeof proof !== "string" || !proof.trim()) throw new Error("zk_prover_invalid_response");
    return normalizeHex(proof);
  } finally {
    clearTimeout(timer);
  }
};

const YIELD_AMOUNT = toBigInt("yield", SETTLEMENT_YIELD_WEI);
const FEE_AMOUNT = toBigInt("fee", SETTLEMENT_FEE_WEI);
const DEPLOY_TARGET = toBigInt("deploy_target", DEPLOY_TARGET_WEI);
const DEPLOY_STEP = toBigInt("deploy_step", DEPLOY_STEP_WEI);

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "liquidity-router",
    dryRun: DRY_RUN,
    rpcL1: RPC_L1,
    adapters: adapterIds
  })
);

app.get("/metrics", async (_req, res) => {
  res.set("content-type", registry.contentType);
  res.send(await registry.metrics());
});

app.get("/status", async (_req, res) => {
  const snap = await policySnapshot();
  res.json({
    ok: true,
    dryRun: DRY_RUN,
    l1: { rpc: RPC_L1 },
    policy: snap,
    contracts: {
      vault: VAULT_ADDRESS,
      oracle: ORACLE_ADDRESS,
      adapterRegistry: ADAPTER_REGISTRY_ADDRESS,
      breaker: BREAKER_ADDRESS
    },
    adapters: adapterIds
  });
});

const sendSettlement = async (adapterId: number, adapter: any) => {
  if (!l1Signer) {
    policyViolationCounter.inc({ type: "no_signer" });
    policyViolationsTotal.inc({ type: "no_signer" });
    throw new Error("no_l1_signer_configured");
  }

  const externalChainId = BigInt(adapter.externalChainId);
  const commitmentRes = await computeCommitment(adapterId, externalChainId);
  const commitment = commitmentRes.commitment;
  const sequence: bigint = (await oracle.lastSequence(adapterId)) + 1n;

  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const validUntil = issuedAt + 60n;

  const sigDigest: string = await oracle.digestSettlement(
    adapterId,
    settlementAsset.kind === "native" ? ghost.ZeroAddress : settlementAsset.address,
    YIELD_AMOUNT,
    FEE_AMOUNT,
    commitment,
    sequence,
    Number(issuedAt),
    Number(validUntil)
  );

  const calldataAsset = settlementAsset.kind === "native" ? ghost.ZeroAddress : settlementAsset.address;
  const proofType = Number(adapter.proofType);

  if (DRY_RUN) {
    return {
      ok: true as const,
      dryRun: true as const,
      adapterId,
      proofType,
      commitment,
      sequence: sequence.toString(),
      sigDigest,
      external: commitmentRes.external
        ? {
            chainId: commitmentRes.external.chainId.toString(),
            blockNumber: commitmentRes.external.blockNumber,
            blockHash: commitmentRes.external.blockHash,
            blockAgeSec: commitmentRes.blockAgeSec
          }
        : null
    };
  }

  let tx;
  if (proofType === 1) {
    const signatures = await Promise.all(
      relayerWallets.map(async (w) => {
        const sig = w.signingKey.sign(sigDigest);
        return sig.serialized;
      })
    );
    const txArgs = [
      adapterId,
      calldataAsset,
      YIELD_AMOUNT,
      FEE_AMOUNT,
      commitment,
      sequence,
      Number(issuedAt),
      Number(validUntil),
      signatures
    ] as const;
    tx =
      settlementAsset.kind === "native"
        ? await oracle.submitSettlement(...txArgs, { value: YIELD_AMOUNT + FEE_AMOUNT })
        : await oracle.submitSettlement(...txArgs);
  } else if (proofType === 2) {
    const proverConfigured = Boolean(ZK_PROVER_URL.trim());
    let proof = "";
    if (proverConfigured) {
      try {
        proof = await requestZkProof({
          adapterId,
          digest: sigDigest,
          asset: calldataAsset,
          yieldWei: YIELD_AMOUNT.toString(),
          feeWei: FEE_AMOUNT.toString(),
          commitment,
          sequence: sequence.toString(),
          issuedAt: Number(issuedAt),
          validUntil: Number(validUntil)
        });
      } catch (e) {
        policyViolationCounter.inc({ type: "zk_prover_error" });
        policyViolationsTotal.inc({ type: "zk_prover_error" });
        throw new Error(`zk_prover_error:${(e as any)?.message || String(e)}`);
      }
    } else {
      const proofRaw = env.LGE_ZK_PROOF_HEX || env.LGE_ZK_PROOF || "";
      if (!proofRaw.trim()) {
        policyViolationCounter.inc({ type: "zk_proof_missing" });
        policyViolationsTotal.inc({ type: "zk_proof_missing" });
        throw new Error("zk_proof_missing");
      }
      proof = normalizeHex(proofRaw);
    }
    if (!ghost.isHexString(proof) || proof === "0x") {
      policyViolationCounter.inc({ type: "zk_proof_invalid" });
      policyViolationsTotal.inc({ type: "zk_proof_invalid" });
      throw new Error("zk_proof_invalid");
    }
    const txArgs = [
      adapterId,
      calldataAsset,
      YIELD_AMOUNT,
      FEE_AMOUNT,
      commitment,
      sequence,
      Number(issuedAt),
      Number(validUntil),
      proof
    ] as const;
    tx =
      settlementAsset.kind === "native"
        ? await oracle.submitSettlementZk(...txArgs, { value: YIELD_AMOUNT + FEE_AMOUNT })
        : await oracle.submitSettlementZk(...txArgs);
  } else {
    policyViolationCounter.inc({ type: "unsupported_proof_type" });
    policyViolationsTotal.inc({ type: "unsupported_proof_type" });
    throw new Error(`unsupported_proof_type:${proofType}`);
  }

  const receipt = await tx.wait();
  return {
    ok: true as const,
    dryRun: false as const,
    txHash: receipt?.hash || tx.hash,
    adapterId,
    proofType,
    commitment,
    sequence: sequence.toString(),
    sigDigest,
    external: commitmentRes.external
      ? {
          chainId: commitmentRes.external.chainId.toString(),
          blockNumber: commitmentRes.external.blockNumber,
          blockHash: commitmentRes.external.blockHash,
          blockAgeSec: commitmentRes.blockAgeSec
        }
      : null
  };
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const assessRisk = async (adapterId: number, adapter: any) => {
  const externalChainId = BigInt(adapter.externalChainId);
  const pool = getExternalPool(externalChainId);
  if (!pool) {
    riskScoreGauge.set({ adapter: String(adapterId), externalChainId: externalChainId.toString() }, 0);
    return { risk: 0, ok: true as const, signals: { rpcConfigured: false as const } };
  }
  try {
    const latest = await pool.fetchLatestBlock(externalChainId, RPC_TIMEOUT_MS);
    const nowSec = Math.floor(Date.now() / 1000);
    const blockAgeSec = Math.max(0, nowSec - latest.blockTimestamp);

    externalRpcUpGauge.set({ externalChainId: externalChainId.toString() }, 1);
    externalRpcLatencyGauge.set({ externalChainId: externalChainId.toString() }, latest.latencyMs);
    externalRpcBlockAgeGauge.set({ externalChainId: externalChainId.toString() }, blockAgeSec);

    // Simple risk heuristic (0..1): chain freshness + latency + adapter risk tier.
    const tier = clamp01(Number(adapter.riskTier || 0) / 5);
    const ageRisk = clamp01(blockAgeSec / 60);
    const latencyRisk = clamp01(latest.latencyMs / 2000);
    const risk = clamp01(0.15 * tier + 0.55 * ageRisk + 0.30 * latencyRisk);

    riskScoreGauge.set({ adapter: String(adapterId), externalChainId: externalChainId.toString() }, risk);
    return {
      risk,
      ok: true as const,
      signals: {
        rpcConfigured: true as const,
        url: latest.url,
        blockNumber: latest.blockNumber,
        blockAgeSec,
        latencyMs: latest.latencyMs
      }
    };
  } catch (e) {
    externalRpcUpGauge.set({ externalChainId: externalChainId.toString() }, 0);
    riskScoreGauge.set({ adapter: String(adapterId), externalChainId: externalChainId.toString() }, 1);
    return { risk: 1, ok: false as const, signals: { rpcConfigured: true as const, error: (e as any)?.message || String(e) } };
  }
};

const maybeDeploy = async (adapterId: number, adapter: any, canContinue: boolean) => {
  if (!l1Signer) return null;
  if (DEPLOY_TARGET === 0n || DEPLOY_STEP === 0n) return null;
  if (!canContinue) return null;
  if (DRY_RUN) return { ok: true as const, dryRun: true as const, action: "deploy" as const };

  const risk = await assessRisk(adapterId, adapter);
  if (risk.risk > MAX_RISK) {
    policyViolationCounter.inc({ type: "risk_gate" });
    policyViolationsTotal.inc({ type: "risk_gate" });
    return { ok: false as const, error: "risk_gate", risk: risk.risk, signals: (risk as any).signals || null };
  }

  const asset = deployAsset.kind === "native" ? ghost.ZeroAddress : deployAsset.address;
  const deployed: bigint = await vault.deployedByAdapterAsset(adapterId, asset);
  const remaining = DEPLOY_TARGET > deployed ? DEPLOY_TARGET - deployed : 0n;
  if (remaining === 0n) return null;

  const step = remaining < DEPLOY_STEP ? remaining : DEPLOY_STEP;
  const totals = await vault.assetTotals(asset);
  const idle: bigint = totals.idle;
  if (idle < step) {
    policyViolationCounter.inc({ type: "insufficient_idle" });
    policyViolationsTotal.inc({ type: "insufficient_idle" });
    return { ok: false as const, error: "insufficient_idle", idle: idle.toString(), needed: step.toString() };
  }

  const tx = await vault.deployToAdapter(adapterId, asset, step, STRATEGY_ID);
  const receipt = await tx.wait();
  return {
    ok: true as const,
    dryRun: false as const,
    action: "deploy" as const,
    txHash: receipt?.hash || tx.hash,
    amount: step.toString(),
    risk: risk.risk,
    riskSignals: (risk as any).signals || null
  };
};

const pollOnce = async () => {
  const snap = await policySnapshot();
  const policyHash = hashJson(snap);
  const breakerPaused: boolean = await breaker.paused();

  for (const adapterId of adapterIds) {
    try {
      const adapter = await adapterRegistry.getAdapter(adapterId);
      const asset = settlementAsset.kind === "native" ? ghost.ZeroAddress : settlementAsset.address;

      const deployed: bigint = await vault.deployedByAdapterAsset(adapterId, asset);
      deployedPrincipalGauge.set({ adapter: String(adapterId), asset: asset.toLowerCase() }, Number(deployed));
      deployedPrincipal.set({ chain: "l1", adapter: String(adapterId), asset: asset.toLowerCase() }, Number(deployed));
      gravityIndexGauge.set(
        { adapter: String(adapterId), asset: asset.toLowerCase() },
        deployed > 0n ? Number(YIELD_AMOUNT) / Number(deployed) : 0
      );
      yieldAccrued.set({ chain: "l1", adapter: String(adapterId), asset: asset.toLowerCase() }, 0);

      const lastSettledAt: bigint = await oracle.lastSettledAt(adapterId);
      const lastDeploymentAt: bigint = await oracle.lastDeploymentAt(adapterId);
      const anchor = lastSettledAt !== 0n ? lastSettledAt : lastDeploymentAt;
      const lag = anchor !== 0n ? Math.max(0, Math.floor(Date.now() / 1000) - Number(anchor)) : 0;
      settlementLagGauge.set({ adapter: String(adapterId) }, lag);
      settlementLagSeconds.set({ chain: "l1", adapter: String(adapterId) }, lag);

      const [canContinue, dueAt]: [boolean, bigint] = await oracle.canContinue(adapterId);
      const adapterPaused: boolean = await breaker.adapterPaused(adapterId);
      breakerStateGauge.set({ adapter: String(adapterId) }, breakerPaused || adapterPaused ? 1 : 0);
      breakerState.set({ chain: "l1", adapter: String(adapterId) }, breakerPaused || adapterPaused ? 1 : 0);

      const deployResult = await maybeDeploy(adapterId, adapter, canContinue);
      if (deployResult?.ok) {
        const baseRecord = {
          ts: new Date().toISOString(),
          adapterId,
          externalChainId: String(adapter.externalChainId),
          action: "deploy",
          dryRun: (deployResult as any).dryRun ?? true,
          policySnapshotHash: policyHash,
          txHash: (deployResult as any).txHash || null,
          amount: (deployResult as any).amount || null,
          strategyId: STRATEGY_ID,
          risk: (deployResult as any).risk ?? null,
          riskSignals: (deployResult as any).riskSignals ?? null,
          justification: {
            trigger: "target_rebalance"
          }
        };
        const record = operatorWallet
          ? { ...baseRecord, ...(await signAuditRecord(operatorWallet, baseRecord)) }
          : baseRecord;
        await appendAuditLog(AUDIT_DIR, record);
      }

      const shouldSettle = !canContinue || (dueAt !== 0n && BigInt(Math.floor(Date.now() / 1000) + SETTLEMENT_LEAD_SECONDS) >= dueAt);
      if (shouldSettle) {
        try {
          const result = await sendSettlement(adapterId, adapter);
          if (result.ok && !result.dryRun) {
            yieldSettledCounter.inc({ adapter: String(adapterId), asset: asset.toLowerCase() }, Number(YIELD_AMOUNT));
            yieldSettled.inc({ chain: "l1", adapter: String(adapterId), asset: asset.toLowerCase() }, Number(YIELD_AMOUNT));
          }

          const baseRecord = {
            ts: new Date().toISOString(),
            adapterId,
            externalChainId: String(adapter.externalChainId),
            action: "settlement",
            dryRun: result.ok ? result.dryRun : true,
            policySnapshotHash: policyHash,
            proofType: (result as any).proofType ?? null,
            settlement: {
              asset: asset,
              yieldWei: YIELD_AMOUNT.toString(),
              feeWei: FEE_AMOUNT.toString(),
              commitment: (result as any).commitment || null,
              sequence: (result as any).sequence || null,
              txHash: (result as any).txHash || null,
              sigDigest: (result as any).sigDigest || null,
              external: (result as any).external || null
            },
            justification: {
              trigger: !canContinue ? "overdue" : "due_soon",
              lagSeconds: lag
            }
          };

          const record = operatorWallet
            ? { ...baseRecord, ...(await signAuditRecord(operatorWallet, baseRecord)) }
            : baseRecord;
          await appendAuditLog(AUDIT_DIR, record);

          if (!canContinue && !DRY_RUN) {
            await oracle.enforceSettlementWindow(adapterId);
          }
        } catch (e) {
          logEvent("warn", "settlement_error", { adapterId, error: (e as any)?.message || String(e) });
          if (!canContinue && !DRY_RUN) {
            try {
              await oracle.enforceSettlementWindow(adapterId);
            } catch (pauseErr) {
              logEvent("warn", "pause_on_overdue_failed", { adapterId, error: (pauseErr as any)?.message || String(pauseErr) });
            }
          }
        }
      }
    } catch (e) {
      logEvent("warn", "poll_error", { adapterId, error: (e as any)?.message || String(e) });
    }
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mainLoop = async () => {
  logEvent("info", "router_start", {
    dryRun: DRY_RUN,
    rpcL1: RPC_L1,
    externalRpc: {
      defaultUrls: EXTERNAL_RPC_DEFAULT_URLS.length,
      mappedChains: Object.keys(EXTERNAL_RPC_MAP).length
    },
    adapters: adapterIds,
    auditDir: AUDIT_DIR,
    relayers: relayerWallets.map((w) => w.address)
  });

  while (true) {
    const start = Date.now();
    await pollOnce();
    const elapsed = Date.now() - start;
    const wait = Math.max(250, LOOP_MS - elapsed);
    await sleep(wait);
  }
};

app.listen(PORT, () => {
  logEvent("info", "listening", { port: PORT });
});

// Fire and forget.
mainLoop().catch((e) => {
  logEvent("error", "fatal", { error: (e as any)?.message || String(e) });
  process.exit(1);
});
