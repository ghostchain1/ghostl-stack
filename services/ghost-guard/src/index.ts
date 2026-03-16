import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  getAddress,
  isAddress,
  keccak256,
  solidityPacked,
  toUtf8Bytes,
  formatEther
} from "@ghostchain/sdk";
import { readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const env = process.env;

const PORT = Number(env.PORT || 7070);
const STATE_DIR = env.STATE_DIR || "/state";
const readSecret = (key: string): string => {
  const filePath = env[`${key}_FILE`] || "";
  if (filePath) {
    try {
      const value = readFileSync(filePath, "utf8").trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return env[key] || "";
};
const ADMIN_TOKEN = readSecret("ADMIN_TOKEN");
const ALLOW_INSECURE_ADMIN = env.ALLOW_INSECURE_ADMIN === "1";

const RPC_L1 = env.RPC_L1 || "";
const RPC_L2 = env.RPC_L2 || "";
const RPC_L3 = env.RPC_L3 || "";

const GUARD_POLICY_ADDRESS = env.GUARD_POLICY_ADDRESS || "";
const POLICY_PRIVATE_KEY = readSecret("PRIVATE_KEY");
const AI_PRIVATE_KEY = readSecret("AI_SIGNER_PRIVATE_KEY") || POLICY_PRIVATE_KEY;

const AI_GUARDIAN_L1 = env.AI_GUARDIAN_L1_ADDRESS || "";
const AI_GUARDIAN_L2 = env.AI_GUARDIAN_L2_ADDRESS || "";
const AI_GUARDIAN_L3 = env.AI_GUARDIAN_L3_ADDRESS || "";

const AI_CONSENSUS_MODE = String(env.AI_CONSENSUS_MODE || "audit").toLowerCase();
const AI_FAIL_OPEN = env.AI_CONSENSUS_FAIL_OPEN === "1";
const AI_AUTO_ATTEST = env.AI_AUTO_ATTEST !== "0";
const AI_MODEL_ID = env.AI_MODEL_ID || "GHOST_AI_CONSENSUS_V1";
const AI_CONFIDENCE_BPS = Number(env.AI_CONFIDENCE_BPS || 9000);
const AI_ATTEST_TTL_SECONDS = Number(env.AI_ATTEST_TTL_SECONDS || 300);
const AI_RISK_REVIEW_BPS = Number(env.AI_RISK_REVIEW_BPS || 5000);
const AI_RISK_BLOCK_BPS = Number(env.AI_RISK_BLOCK_BPS || 8000);
const AI_REVIEW_DELAY_SECONDS = Number(env.AI_REVIEW_DELAY_SECONDS || 60);
const AI_WAIT_CONFIRMATIONS = Number(env.AI_WAIT_CONFIRMATIONS || 0);

const DEFAULT_LAYER = String(env.AI_DEFAULT_LAYER || "l2").toLowerCase();
const ROLE_LAYER_MAP = String(env.AI_ROLE_LAYER_MAP || "");

const RATE_LIMIT_WINDOW_MS = Number(env.RATE_LIMIT_WINDOW_MS || 1000);
const RATE_LIMIT_MAX = Number(env.RATE_LIMIT_MAX || 20);

const LISTS_PATH = path.join(STATE_DIR, "guard-lists.json");
const POLICY_PATH = path.join(STATE_DIR, "guard-policy.json");
const NONCE_PATH = path.join(STATE_DIR, "ai-nonces.json");
const DECISIONS_LOG = path.join(STATE_DIR, "guard-decisions.jsonl");

const GUARD_POLICY_ABI = [
  "function mode() view returns (uint8)",
  "function delaySeconds() view returns (uint256)",
  "function riskThreshold() view returns (uint256)",
  "function setMode(uint8)",
  "function setDelaySeconds(uint256)",
  "function setRiskThreshold(uint256)"
] as const;

const GUARDIAN_ABI = [
  "function checkTransaction(bytes32) view returns (bool allowed, uint64 waitSeconds, bytes32 reason)",
  "function requireOffchainDigest() view returns (bool)",
  "function requireLayerDigest(uint8) view returns (bool)",
  "function layerFeeds(uint8) view returns (bytes32 digest, uint64 blockNumber, uint64 updatedAt)",
  "function offchainFeed() view returns (bytes32 digest, uint64 updatedAt)",
  "function allowedModels(bytes32) view returns (bool)",
  "function aiSigners(address) view returns (bool)",
  "function minSigners() view returns (uint256)",
  "function submitFraudAssessment((uint256 nonce,uint8 layerId,bytes32 operationId,uint8 verdict,uint32 riskScoreBps,bytes32 detailsHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest) att, bytes[] signatures)",
  "function submitComplianceDecision((uint256 nonce,uint8 layerId,bytes32 operationId,uint8 decision,uint64 delaySeconds,bytes32 ruleId,bytes32 jurisdiction,bytes32 detailsHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest) att, bytes[] signatures)"
] as const;

const REASONS = {
  PAUSED: keccak256(toUtf8Bytes("PAUSED")),
  FRAUD_MISSING: keccak256(toUtf8Bytes("FRAUD_MISSING")),
  COMPLIANCE_MISSING: keccak256(toUtf8Bytes("COMPLIANCE_MISSING")),
  FRAUD_BLOCK: keccak256(toUtf8Bytes("FRAUD_BLOCK")),
  COMPLIANCE_BLOCK: keccak256(toUtf8Bytes("COMPLIANCE_BLOCK")),
  FRAUD_REVIEW: keccak256(toUtf8Bytes("FRAUD_REVIEW")),
  COMPLIANCE_DELAY: keccak256(toUtf8Bytes("COMPLIANCE_DELAY"))
} as const;

const FRAUD_VERDICT = {
  CLEAR: 1,
  FLAG: 2,
  BLOCK: 3
} as const;

const COMPLIANCE_DECISION = {
  ALLOW: 1,
  DELAY: 2,
  BLOCK: 3
} as const;

type GuardLists = {
  allowlist: string[];
  denylist: string[];
  updatedAt: number;
};

type GuardPolicy = {
  mode: "allow" | "delay" | "pause";
  delaySeconds: number;
  riskThreshold: number;
  updatedAt: number;
};

type TxSummary = {
  hash?: string;
  from?: string | null;
  to?: string | null;
  nonce?: number;
  type?: number;
  value?: string;
  gasLimit?: string | null;
  dataLength?: number;
  dataHash?: string;
  selector?: string;
};

type GuardEvalContext = {
  role?: string;
  tx?: TxSummary;
  block?: unknown;
  proposal?: unknown;
  layer?: number | string;
};

type GuardianContext = {
  layerId: number;
  address: string;
  provider: JsonRpcProvider;
  wallet: Wallet | null;
  contract: Contract;
  chainId: bigint | null;
  digestCache: {
    fetchedAt: number;
    requireOffchain: boolean;
    requireL1: boolean;
    requireL2: boolean;
    requireL3: boolean;
    l1Digest: string;
    l2Digest: string;
    l3Digest: string;
    offchainDigest: string;
  } | null;
  signerCache: {
    checkedAt: number;
    signerAllowed: boolean;
    minSigners: number;
  } | null;
};

const inFlightAttestations = new Map<string, Promise<void>>();

const normalizeAddress = (value: string | undefined | null): string | null => {
  if (!value) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
};

const parseLayerValue = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && (raw === 1 || raw === 2 || raw === 3)) return raw;
  const text = String(raw).toLowerCase();
  if (text === "1" || text === "l1") return 1;
  if (text === "2" || text === "l2") return 2;
  if (text === "3" || text === "l3") return 3;
  return null;
};

const parseDefaultLayer = (): number => {
  const parsed = parseLayerValue(DEFAULT_LAYER);
  return parsed ?? 2;
};

const parseRoleLayerMap = (): Map<string, number> => {
  const map = new Map<string, number>();
  if (!ROLE_LAYER_MAP) return map;
  const entries = ROLE_LAYER_MAP.split(",").map((entry) => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    const [role, layerRaw] = entry.split(":").map((v) => v.trim());
    const layer = parseLayerValue(layerRaw);
    if (role && layer) map.set(role.toLowerCase(), layer);
  }
  return map;
};

const ROLE_LAYER = parseRoleLayerMap();

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const loadJson = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const saveJson = async (filePath: string, value: unknown) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
};

const nowSec = () => Math.floor(Date.now() / 1000);

const reasonLabel = (reason: string): string => {
  const lower = String(reason || "").toLowerCase();
  if (!reason || lower === "0x" || lower === "0x0") return "ok";
  if (reason === REASONS.PAUSED) return "paused";
  if (reason === REASONS.FRAUD_MISSING) return "fraud_missing";
  if (reason === REASONS.COMPLIANCE_MISSING) return "compliance_missing";
  if (reason === REASONS.FRAUD_BLOCK) return "fraud_block";
  if (reason === REASONS.COMPLIANCE_BLOCK) return "compliance_block";
  if (reason === REASONS.FRAUD_REVIEW) return "fraud_review";
  if (reason === REASONS.COMPLIANCE_DELAY) return "compliance_delay";
  return "unknown";
};

const buildModelId = (value: string): string => {
  if (value.startsWith("0x") && value.length === 66) return value;
  return keccak256(toUtf8Bytes(value));
};

const buildDetailsHash = (payload: Record<string, unknown>): string => {
  return keccak256(toUtf8Bytes(JSON.stringify(payload)));
};

const zeroAddress = "0x0000000000000000000000000000000000000000";

const computeOperationId = (layerId: number, chainId: bigint, tx: TxSummary): string => {
  const actor = tx.from && isAddress(tx.from) ? getAddress(tx.from) : zeroAddress;
  const target = tx.to && isAddress(tx.to) ? getAddress(tx.to) : zeroAddress;
  const selector = tx.selector && tx.selector.startsWith("0x") ? tx.selector : "0x00000000";
  const dataHash = tx.dataHash && tx.dataHash.startsWith("0x") ? tx.dataHash : keccak256("0x");
  const value = tx.value ? BigInt(tx.value) : 0n;
  return keccak256(
    solidityPacked(
      ["uint8", "uint256", "address", "address", "bytes4", "bytes32", "uint256"],
      [layerId, chainId, actor, target, selector, dataHash, value]
    )
  );
};

const riskScoreFromTx = (tx: TxSummary, role: string): { riskScoreBps: number; reason: string } => {
  let risk = 0;
  let reason = "low_risk";
  const valueWei = tx.value ? BigInt(tx.value) : 0n;
  const valueEth = Number(formatEther(valueWei));
  if (valueEth >= 0.1) {
    risk += 500;
    reason = "value";
  }
  if (valueEth >= 1) {
    risk += 2000;
    reason = "value";
  }
  if (valueEth >= 5) {
    risk += 2000;
    reason = "value";
  }
  if (valueEth >= 10) {
    risk += 2000;
    reason = "value";
  }
  const dataLen = tx.dataLength ?? 0;
  if (dataLen >= 10000) {
    risk += 1000;
    reason = "calldata";
  }
  if (dataLen >= 50000) {
    risk += 1000;
    reason = "calldata";
  }
  if (role === "batcher" || role === "proposer") {
    risk = Math.max(0, risk - 1500);
  }
  if (risk > 10000) risk = 10000;
  return { riskScoreBps: risk, reason };
};

const parseDecisionMode = (raw: unknown): GuardPolicy["mode"] | null => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (raw === 0) return "allow";
    if (raw === 1) return "delay";
    if (raw === 2) return "pause";
  }
  const text = String(raw).toLowerCase();
  if (["allow", "delay", "pause"].includes(text)) return text as GuardPolicy["mode"];
  return null;
};

const modeToEnum = (mode: GuardPolicy["mode"]): number => {
  if (mode === "delay") return 1;
  if (mode === "pause") return 2;
  return 0;
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!ADMIN_TOKEN && !ALLOW_INSECURE_ADMIN) {
    res.status(403).json({ ok: false, error: "ADMIN_TOKEN not configured" });
    return;
  }
  if (!ADMIN_TOKEN && ALLOW_INSECURE_ADMIN) {
    next();
    return;
  }
  const token = req.header("x-admin-token");
  if (!token || token !== ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
};

const rateLimiter = {
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  hits: new Map<string, { count: number; resetAt: number }>()
};

const allowRequest = (ip: string): boolean => {
  if (rateLimiter.max <= 0 || rateLimiter.windowMs <= 0) return true;
  const now = Date.now();
  const entry = rateLimiter.hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimiter.hits.set(ip, { count: 1, resetAt: now + rateLimiter.windowMs });
    return true;
  }
  entry.count += 1;
  if (entry.count > rateLimiter.max) return false;
  return true;
};

let guardLists: GuardLists = { allowlist: [], denylist: [], updatedAt: Date.now() };
let guardPolicy: GuardPolicy = { mode: "allow", delaySeconds: 0, riskThreshold: 80, updatedAt: Date.now() };
let nonceState = { value: 1 };

const policyProvider = RPC_L2 ? new JsonRpcProvider(RPC_L2, undefined, { polling: true }) : null;
const policyWallet = POLICY_PRIVATE_KEY && policyProvider ? new Wallet(POLICY_PRIVATE_KEY, policyProvider) : null;
const guardPolicyContract =
  GUARD_POLICY_ADDRESS && policyProvider
    ? new Contract(GUARD_POLICY_ADDRESS, GUARD_POLICY_ABI, policyWallet ?? policyProvider)
    : null;

const guardians = new Map<number, GuardianContext>();
const makeGuardian = (layerId: number, addressRaw: string, rpcUrl: string) => {
  if (!addressRaw || !rpcUrl) return;
  const address = normalizeAddress(addressRaw);
  if (!address) return;
  const provider = new JsonRpcProvider(rpcUrl, undefined, { polling: true });
  provider.pollingInterval = 1000;
  const wallet = AI_PRIVATE_KEY ? new Wallet(AI_PRIVATE_KEY, provider) : null;
  const contract = new Contract(address, GUARDIAN_ABI, wallet ?? provider);
  guardians.set(layerId, {
    layerId,
    address,
    provider,
    wallet,
    contract,
    chainId: null,
    digestCache: null,
    signerCache: null
  });
};

makeGuardian(1, AI_GUARDIAN_L1, RPC_L1);
makeGuardian(2, AI_GUARDIAN_L2, RPC_L2);
makeGuardian(3, AI_GUARDIAN_L3, RPC_L3);

const loadState = async () => {
  guardLists = await loadJson(LISTS_PATH, guardLists);
  guardPolicy = await loadJson(POLICY_PATH, guardPolicy);
  nonceState = await loadJson(NONCE_PATH, nonceState);
};

const persistLists = async () => {
  guardLists.updatedAt = Date.now();
  await saveJson(LISTS_PATH, guardLists);
};

const persistPolicy = async () => {
  guardPolicy.updatedAt = Date.now();
  await saveJson(POLICY_PATH, guardPolicy);
};

const nextNonce = async (): Promise<number> => {
  nonceState.value = (nonceState.value || 0) + 1;
  await saveJson(NONCE_PATH, nonceState);
  return nonceState.value;
};

const syncPolicyFromChain = async () => {
  if (!guardPolicyContract) return;
  try {
    const [mode, delaySeconds, riskThreshold] = await Promise.all([
      guardPolicyContract.mode(),
      guardPolicyContract.delaySeconds(),
      guardPolicyContract.riskThreshold()
    ]);
    const modeNum = Number(mode ?? 0);
    guardPolicy = {
      mode: modeNum === 1 ? "delay" : modeNum === 2 ? "pause" : "allow",
      delaySeconds: Number(delaySeconds ?? 0),
      riskThreshold: Number(riskThreshold ?? 0),
      updatedAt: Date.now()
    };
    await persistPolicy();
  } catch (err) {
    console.warn("[ghost-guard] failed to sync policy from chain", err);
  }
};

const appendDecision = async (entry: Record<string, unknown>) => {
  try {
    await ensureDir(STATE_DIR);
    await fs.appendFile(DECISIONS_LOG, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.warn("[ghost-guard] failed to write decision", err);
  }
};

const getGuardian = (layerId: number | null): GuardianContext | null => {
  if (!layerId) return null;
  return guardians.get(layerId) ?? null;
};

const resolveLayerForContext = (ctx: GuardEvalContext): number => {
  const explicit = parseLayerValue(ctx.layer);
  if (explicit) return explicit;
  const role = String(ctx.role || "").toLowerCase();
  if (ROLE_LAYER.has(role)) return ROLE_LAYER.get(role) ?? parseDefaultLayer();
  return parseDefaultLayer();
};

const getChainId = async (guardian: GuardianContext): Promise<bigint> => {
  if (guardian.chainId) return guardian.chainId;
  const network = await guardian.provider.getNetwork();
  guardian.chainId = BigInt(network.chainId);
  return guardian.chainId;
};

const getSignerStatus = async (guardian: GuardianContext) => {
  if (guardian.signerCache && Date.now() - guardian.signerCache.checkedAt < 30_000) {
    return guardian.signerCache;
  }
  let signerAllowed = false;
  let minSigners = 0;
  try {
    minSigners = Number(await guardian.contract.minSigners());
    if (guardian.wallet) {
      const signer = await guardian.wallet.getAddress();
      signerAllowed = Boolean(await guardian.contract.aiSigners(signer));
    }
  } catch (err) {
    console.warn("[ghost-guard] signer status check failed", err);
  }
  guardian.signerCache = { checkedAt: Date.now(), signerAllowed, minSigners };
  return guardian.signerCache;
};

const getDigestSet = async (guardian: GuardianContext) => {
  if (guardian.digestCache && Date.now() - guardian.digestCache.fetchedAt < 30_000) {
    return guardian.digestCache;
  }
  const [requireOffchain, requireL1, requireL2, requireL3] = await Promise.all([
    guardian.contract.requireOffchainDigest(),
    guardian.contract.requireLayerDigest(1),
    guardian.contract.requireLayerDigest(2),
    guardian.contract.requireLayerDigest(3)
  ]);
  const [l1Feed, l2Feed, l3Feed, offchainFeed] = await Promise.all([
    guardian.contract.layerFeeds(1),
    guardian.contract.layerFeeds(2),
    guardian.contract.layerFeeds(3),
    guardian.contract.offchainFeed()
  ]);
  const digestCache = {
    fetchedAt: Date.now(),
    requireOffchain: Boolean(requireOffchain),
    requireL1: Boolean(requireL1),
    requireL2: Boolean(requireL2),
    requireL3: Boolean(requireL3),
    l1Digest: String(l1Feed?.digest ?? l1Feed?.[0] ?? "0x0"),
    l2Digest: String(l2Feed?.digest ?? l2Feed?.[0] ?? "0x0"),
    l3Digest: String(l3Feed?.digest ?? l3Feed?.[0] ?? "0x0"),
    offchainDigest: String(offchainFeed?.digest ?? offchainFeed?.[0] ?? "0x0")
  };
  guardian.digestCache = digestCache;
  return digestCache;
};

const shouldAttemptAttestation = (reason: string): boolean => {
  return reason === REASONS.FRAUD_MISSING || reason === REASONS.COMPLIANCE_MISSING;
};

const submitAttestations = async (
  guardian: GuardianContext,
  operationId: string,
  tx: TxSummary,
  role: string
): Promise<void> => {
  if (!guardian.wallet) throw new Error("ai signer missing");
  const signerStatus = await getSignerStatus(guardian);
  if (!signerStatus.signerAllowed) throw new Error("ai signer not allowed");
  if (signerStatus.minSigners > 1) throw new Error("ai signer quorum > 1");

  const digestSet = await getDigestSet(guardian);
  if (digestSet.requireOffchain && (!digestSet.offchainDigest || digestSet.offchainDigest === "0x0")) {
    throw new Error("offchain digest missing");
  }
  if (digestSet.requireL1 && (!digestSet.l1Digest || digestSet.l1Digest === "0x0")) {
    throw new Error("l1 digest missing");
  }
  if (digestSet.requireL2 && (!digestSet.l2Digest || digestSet.l2Digest === "0x0")) {
    throw new Error("l2 digest missing");
  }
  if (digestSet.requireL3 && (!digestSet.l3Digest || digestSet.l3Digest === "0x0")) {
    throw new Error("l3 digest missing");
  }

  const modelId = buildModelId(AI_MODEL_ID);
  const modelAllowed = Boolean(await guardian.contract.allowedModels(modelId));
  if (!modelAllowed) throw new Error("model not allowed");

  const { riskScoreBps, reason } = riskScoreFromTx(tx, role);
  const now = nowSec();
  const validUntil = now + Math.max(1, AI_ATTEST_TTL_SECONDS);
  const fraudVerdict =
    riskScoreBps >= AI_RISK_BLOCK_BPS
      ? FRAUD_VERDICT.BLOCK
      : riskScoreBps >= AI_RISK_REVIEW_BPS
        ? FRAUD_VERDICT.FLAG
        : FRAUD_VERDICT.CLEAR;
  const complianceDecision =
    riskScoreBps >= AI_RISK_BLOCK_BPS
      ? COMPLIANCE_DECISION.BLOCK
      : riskScoreBps >= AI_RISK_REVIEW_BPS
        ? COMPLIANCE_DECISION.DELAY
        : COMPLIANCE_DECISION.ALLOW;

  const detailsHash = buildDetailsHash({
    source: "ghost-guard",
    role,
    reason,
    riskScoreBps,
    txHash: tx.hash || "",
    dataHash: tx.dataHash || ""
  });

  const ruleId = buildDetailsHash({ rule: "ai-consensus", decision: complianceDecision });
  const jurisdiction = buildDetailsHash({ scope: "global" });

  const nonce = await nextNonce();

  const fraudAtt = {
    nonce,
    layerId: guardian.layerId,
    operationId,
    verdict: fraudVerdict,
    riskScoreBps,
    detailsHash,
    issuedAt: now,
    validUntil,
    confidenceBps: AI_CONFIDENCE_BPS,
    modelId,
    l1Digest: digestSet.l1Digest,
    l2Digest: digestSet.l2Digest,
    l3Digest: digestSet.l3Digest,
    offchainDigest: digestSet.offchainDigest
  };

  const complianceAtt = {
    nonce,
    layerId: guardian.layerId,
    operationId,
    decision: complianceDecision,
    delaySeconds: complianceDecision === COMPLIANCE_DECISION.DELAY ? AI_REVIEW_DELAY_SECONDS : 0,
    ruleId,
    jurisdiction,
    detailsHash,
    issuedAt: now,
    validUntil,
    confidenceBps: AI_CONFIDENCE_BPS,
    modelId,
    l1Digest: digestSet.l1Digest,
    l2Digest: digestSet.l2Digest,
    l3Digest: digestSet.l3Digest,
    offchainDigest: digestSet.offchainDigest
  };

  const chainId = await getChainId(guardian);
  const domain = {
    name: "GhostAIGuardian",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: guardian.address
  };

  const fraudSig = await guardian.wallet.signTypedData(
    domain,
    {
      FraudAttestation: [
        { name: "nonce", type: "uint256" },
        { name: "layerId", type: "uint8" },
        { name: "operationId", type: "bytes32" },
        { name: "verdict", type: "uint8" },
        { name: "riskScoreBps", type: "uint32" },
        { name: "detailsHash", type: "bytes32" },
        { name: "issuedAt", type: "uint64" },
        { name: "validUntil", type: "uint64" },
        { name: "confidenceBps", type: "uint32" },
        { name: "modelId", type: "bytes32" },
        { name: "l1Digest", type: "bytes32" },
        { name: "l2Digest", type: "bytes32" },
        { name: "l3Digest", type: "bytes32" },
        { name: "offchainDigest", type: "bytes32" }
      ]
    },
    fraudAtt
  );

  const complianceSig = await guardian.wallet.signTypedData(
    domain,
    {
      ComplianceAttestation: [
        { name: "nonce", type: "uint256" },
        { name: "layerId", type: "uint8" },
        { name: "operationId", type: "bytes32" },
        { name: "decision", type: "uint8" },
        { name: "delaySeconds", type: "uint64" },
        { name: "ruleId", type: "bytes32" },
        { name: "jurisdiction", type: "bytes32" },
        { name: "detailsHash", type: "bytes32" },
        { name: "issuedAt", type: "uint64" },
        { name: "validUntil", type: "uint64" },
        { name: "confidenceBps", type: "uint32" },
        { name: "modelId", type: "bytes32" },
        { name: "l1Digest", type: "bytes32" },
        { name: "l2Digest", type: "bytes32" },
        { name: "l3Digest", type: "bytes32" },
        { name: "offchainDigest", type: "bytes32" }
      ]
    },
    complianceAtt
  );

  const fraudTx = await guardian.contract.submitFraudAssessment(fraudAtt, [fraudSig]);
  const complianceTx = await guardian.contract.submitComplianceDecision(complianceAtt, [complianceSig]);
  if (AI_WAIT_CONFIRMATIONS > 0) {
    await Promise.all([fraudTx.wait(AI_WAIT_CONFIRMATIONS), complianceTx.wait(AI_WAIT_CONFIRMATIONS)]);
  }
};

const evaluateTxWithGuardian = async (ctx: GuardEvalContext, tx: TxSummary) => {
  const role = String(ctx.role || "").toLowerCase();
  const layerId = resolveLayerForContext(ctx);
  const guardian = getGuardian(layerId);
  if (!guardian) {
    return { action: AI_FAIL_OPEN || AI_CONSENSUS_MODE === "audit" ? "allow" : "block", reason: "guardian_unconfigured" };
  }

  const chainId = await getChainId(guardian);
  const operationId = computeOperationId(layerId, chainId, tx);
  const [allowed, waitSeconds, reason] = (await guardian.contract.checkTransaction(operationId)) as [
    boolean,
    bigint,
    string
  ];

  if (allowed) {
    return { action: "allow", reason: "guardian_allow", operationId };
  }

  const reasonLabelValue = reasonLabel(reason);
  if (AI_AUTO_ATTEST && shouldAttemptAttestation(reason) && !inFlightAttestations.has(operationId)) {
    const promise = submitAttestations(guardian, operationId, tx, role)
      .catch((err) => {
        console.warn("[ghost-guard] attestation failed", err);
      })
      .finally(() => {
        inFlightAttestations.delete(operationId);
      });
    inFlightAttestations.set(operationId, promise);
    return {
      action: AI_CONSENSUS_MODE === "audit" ? "allow" : "delay",
      reason: "attesting",
      operationId,
      delaySeconds: AI_REVIEW_DELAY_SECONDS
    };
  }

  const delaySeconds = Number(waitSeconds ?? 0n);
  if (delaySeconds > 0) {
    return {
      action: AI_CONSENSUS_MODE === "audit" ? "allow" : "delay",
      reason: reasonLabelValue,
      operationId,
      delaySeconds
    };
  }

  return {
    action: AI_CONSENSUS_MODE === "audit" || AI_FAIL_OPEN ? "allow" : "block",
    reason: reasonLabelValue,
    operationId
  };
};

const evaluateContext = async (ctx: GuardEvalContext) => {
  const role = String(ctx.role || "").toLowerCase();
  const tx = ctx.tx;

  if (guardPolicy.mode === "pause") {
    return { action: "block", reason: "manual_pause" };
  }
  if (guardPolicy.mode === "delay" && guardPolicy.delaySeconds > 0) {
    return { action: "delay", reason: "manual_delay", delaySeconds: guardPolicy.delaySeconds };
  }

  if (tx) {
    const from = tx.from && isAddress(tx.from) ? getAddress(tx.from) : null;
    if (from && guardLists.allowlist.includes(from)) {
      return { action: "allow", reason: "allowlist" };
    }
    if (from && guardLists.denylist.includes(from)) {
      return { action: "block", reason: "denylist" };
    }

    const { riskScoreBps } = riskScoreFromTx(tx, role);
    if (riskScoreBps >= guardPolicy.riskThreshold * 100) {
      return { action: "block", reason: "risk_threshold" };
    }

    return evaluateTxWithGuardian(ctx, tx);
  }

  return { action: "allow", reason: "no_tx" };
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mode: guardPolicy.mode,
    delaySeconds: guardPolicy.delaySeconds,
    riskThreshold: guardPolicy.riskThreshold,
    allowlist: guardLists.allowlist.length,
    denylist: guardLists.denylist.length,
    aiConsensus: {
      mode: AI_CONSENSUS_MODE,
      failOpen: AI_FAIL_OPEN,
      autoAttest: AI_AUTO_ATTEST,
      guardians: Array.from(guardians.values()).map((g) => ({ layerId: g.layerId, address: g.address }))
    }
  });
});

app.get("/lists", (_req, res) => {
  res.json({ ok: true, allowlist: guardLists.allowlist, denylist: guardLists.denylist });
});

app.post("/lists/allow", requireAdmin, async (req, res) => {
  const addr = normalizeAddress(req.body?.address);
  if (!addr) {
    res.status(400).json({ ok: false, error: "invalid address" });
    return;
  }
  if (!guardLists.allowlist.includes(addr)) guardLists.allowlist.push(addr);
  guardLists.denylist = guardLists.denylist.filter((a) => a !== addr);
  await persistLists();
  res.json({ ok: true, allowlist: guardLists.allowlist, denylist: guardLists.denylist });
});

app.post("/lists/block", requireAdmin, async (req, res) => {
  const addr = normalizeAddress(req.body?.address);
  if (!addr) {
    res.status(400).json({ ok: false, error: "invalid address" });
    return;
  }
  if (!guardLists.denylist.includes(addr)) guardLists.denylist.push(addr);
  guardLists.allowlist = guardLists.allowlist.filter((a) => a !== addr);
  await persistLists();
  res.json({ ok: true, allowlist: guardLists.allowlist, denylist: guardLists.denylist });
});

app.post("/lists/remove", requireAdmin, async (req, res) => {
  const addr = normalizeAddress(req.body?.address);
  if (!addr) {
    res.status(400).json({ ok: false, error: "invalid address" });
    return;
  }
  guardLists.allowlist = guardLists.allowlist.filter((a) => a !== addr);
  guardLists.denylist = guardLists.denylist.filter((a) => a !== addr);
  await persistLists();
  res.json({ ok: true, allowlist: guardLists.allowlist, denylist: guardLists.denylist });
});

app.get("/policy", (_req, res) => {
  res.json({ ok: true, policy: guardPolicy });
});

app.post("/policy/mode", requireAdmin, async (req, res) => {
  const mode = parseDecisionMode(req.body?.mode);
  if (!mode) {
    res.status(400).json({ ok: false, error: "invalid mode" });
    return;
  }
  if (guardPolicyContract && policyWallet) {
    const tx = await guardPolicyContract.setMode(modeToEnum(mode));
    await tx.wait();
  }
  guardPolicy.mode = mode;
  await persistPolicy();
  res.json({ ok: true, policy: guardPolicy });
});

app.post("/policy/threshold", requireAdmin, async (req, res) => {
  const threshold = Number(req.body?.threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    res.status(400).json({ ok: false, error: "invalid threshold" });
    return;
  }
  if (guardPolicyContract && policyWallet) {
    const tx = await guardPolicyContract.setRiskThreshold(threshold);
    await tx.wait();
  }
  guardPolicy.riskThreshold = threshold;
  await persistPolicy();
  res.json({ ok: true, policy: guardPolicy });
});

app.post("/policy/delay", requireAdmin, async (req, res) => {
  const seconds = Number(req.body?.seconds);
  if (!Number.isFinite(seconds) || seconds < 0) {
    res.status(400).json({ ok: false, error: "invalid delay" });
    return;
  }
  if (guardPolicyContract && policyWallet) {
    const tx = await guardPolicyContract.setDelaySeconds(seconds);
    await tx.wait();
  }
  guardPolicy.delaySeconds = Math.floor(seconds);
  if (guardPolicy.delaySeconds > 0 && guardPolicy.mode === "allow") {
    guardPolicy.mode = "delay";
  }
  await persistPolicy();
  res.json({ ok: true, policy: guardPolicy });
});

app.post("/gate/eval", async (req: Request<unknown, unknown, GuardEvalContext>, res) => {
  const ip = req.ip || "unknown";
  if (!allowRequest(ip)) {
    res.status(429).json({ action: "delay", reason: "rate_limited", retryAt: Date.now() + RATE_LIMIT_WINDOW_MS });
    return;
  }

  const ctx = req.body || {};
  try {
    const decision = await evaluateContext(ctx);
    await appendDecision({ ts: Date.now(), role: ctx.role || "", decision, tx: ctx.tx || null });
    res.json(decision);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendDecision({ ts: Date.now(), role: ctx.role || "", error: message, tx: ctx.tx || null });
    res.status(500).json({ action: AI_FAIL_OPEN ? "allow" : "block", reason: "guard_error" });
  }
});

const boot = async () => {
  await loadState();
  await syncPolicyFromChain();
  app.listen(PORT, () => {
    console.log(`[ghost-guard] listening on :${PORT}`);
  });
};

boot().catch((err) => {
  console.error("[ghost-guard] failed to boot", err);
  process.exit(1);
});
