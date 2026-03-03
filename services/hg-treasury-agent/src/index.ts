import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";
import { ghostbrainRegister, ghostbrainStartHeartbeat } from "./ghostbrain-client";

type ExecutionIntent = {
  proposalId: string;
  approved: boolean;
  actionType: "allocate" | "distribute" | "pause" | "other";
  target: string;
  strategy?: string;
  amountWei?: string;
  riskScoreBps?: number;
  policyMaxRiskBps?: number;
  chainId?: number;
  metadata?: Record<string, unknown>;
};

type Receipt = {
  receiptId: string;
  service: "hg-treasury-agent";
  timestamp: string;
  proposalId: string;
  approved: boolean;
  decision: "executed" | "rejected";
  reason?: string;
  intent: ExecutionIntent;
  gate: {
    mainnetMode: boolean;
    activationVerified: boolean;
    gateAddress?: string;
    blockTag?: string;
  };
  digest: string;
  signature: string;
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || "7601");
const HOST = process.env.HOST || "0.0.0.0";
const MAINNET_MODE = String(process.env.MAINNET_EXECUTION_MODE || "false") === "true";
const MAINNET_GATE_RPC = process.env.MAINNET_GATE_RPC || "";
const MAINNET_GATE_ADDRESS = process.env.MAINNET_GATE_ADDRESS || "";
const MAINNET_GATE_BLOCK = process.env.MAINNET_GATE_BLOCK || "latest";

function resolveSigningSecret(raw: string | undefined): string {
  const candidate = String(raw || "").trim();
  const isPlaceholder =
    candidate.length === 0 ||
    candidate === "dev-placeholder-secret" ||
    candidate === "__SET_IN_VAULT__";
  const strictMode = MAINNET_MODE || process.env.NODE_ENV === "production";

  if (strictMode && isPlaceholder) {
    throw new Error("RECEIPT_SIGNING_SECRET must be set from Vault/KMS in production/mainnet mode");
  }

  if (isPlaceholder) {
    return "dev-placeholder-secret";
  }

  return candidate;
}

const SIGNING_SECRET = resolveSigningSecret(process.env.RECEIPT_SIGNING_SECRET);

const resolveWritableDir = (preferred: string, fallbackName: string): string => {
  const candidates = [preferred, path.join("/tmp", fallbackName)];
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      const probe = path.join(candidate, ".write-probe");
      fs.writeFileSync(probe, "ok", { encoding: "utf-8" });
      fs.unlinkSync(probe);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return "/tmp";
};

const EVIDENCE_DIR = resolveWritableDir(process.env.EVIDENCE_DIR || "/tmp/ghost-evidence", "ghost-evidence");

const promRegistry = new Registry();
collectDefaultMetrics({ register: promRegistry, prefix: "hg_treasury_agent_" });
const intentsTotal = new Counter({
  name: "hg_treasury_agent_intents_total",
  help: "Total execution intents received",
  registers: [promRegistry],
  labelNames: ["decision"]
});
const receiptsGauge = new Gauge({
  name: "hg_treasury_agent_receipts_written_total",
  help: "Cumulative receipts persisted",
  registers: [promRegistry]
});
let receiptsWritten = 0;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(objectValue[k])}`).join(",")}}`;
};

const hmac = (payload: string): string => crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex");

const mainnetGateCallSelector = "0x4668a8f3"; // isMainnetExecutionEnabled()
const canonicalCallMethod = process.env.GHOST_RPC_CALL_METHOD || "gst_call";
const normalizeAddress = (value: string): string => value.toLowerCase();

async function verifyMainnetActivation(): Promise<boolean> {
  if (!MAINNET_MODE) return true;
  if (!MAINNET_GATE_RPC || !MAINNET_GATE_ADDRESS) return false;

  const to = normalizeAddress(MAINNET_GATE_ADDRESS);
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: canonicalCallMethod,
    params: [
      {
        to,
        data: mainnetGateCallSelector
      },
      MAINNET_GATE_BLOCK
    ]
  };

  const response = await fetch(MAINNET_GATE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) return false;
  const parsed = (await response.json()) as { result?: string };
  if (!parsed.result) return false;
  const normalized = parsed.result.toLowerCase();
  return normalized.endsWith("1") || normalized === "0x1";
}

function enforceOffchainRisk(intent: ExecutionIntent): { ok: boolean; reason?: string } {
  if (!intent.approved) return { ok: false, reason: "proposal_not_approved" };
  if ((intent.actionType === "allocate" || intent.actionType === "distribute") && !intent.amountWei) {
    return { ok: false, reason: "missing_amount" };
  }
  if (intent.actionType === "allocate") {
    const score = Number(intent.riskScoreBps ?? 0);
    const cap = Number(intent.policyMaxRiskBps ?? 0);
    if (cap > 0 && score > cap) return { ok: false, reason: "offchain_risk_cap_exceeded" };
  }
  return { ok: true };
}

function writeReceipt(receipt: Receipt): string {
  const fileName = `${receipt.timestamp.replace(/[:.]/g, "-")}-${receipt.receiptId}.json`;
  const filePath = path.join(EVIDENCE_DIR, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  receiptsWritten += 1;
  receiptsGauge.set(receiptsWritten);
  return filePath;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hg-treasury-agent", mainnetMode: MAINNET_MODE });
});

app.get("/metrics", async (_req, res) => {
  res.set("content-type", promRegistry.contentType);
  res.send(await promRegistry.metrics());
});

app.post("/v1/governance/execution-intent", async (req, res) => {
  const intent = req.body as ExecutionIntent;
  const risk = enforceOffchainRisk(intent);
  const gateOk = await verifyMainnetActivation();

  const decision: "executed" | "rejected" = risk.ok && gateOk ? "executed" : "rejected";
  const reason = !risk.ok ? risk.reason : !gateOk ? "mainnet_gate_not_active" : undefined;

  const base = {
    receiptId: crypto.randomUUID(),
    service: "hg-treasury-agent" as const,
    timestamp: new Date().toISOString(),
    proposalId: String(intent.proposalId || "unknown"),
    approved: Boolean(intent.approved),
    decision,
    reason,
    intent,
    gate: {
      mainnetMode: MAINNET_MODE,
      activationVerified: gateOk,
      gateAddress: MAINNET_GATE_ADDRESS || undefined,
      blockTag: MAINNET_GATE_BLOCK
    }
  };

  const digest = crypto.createHash("sha256").update(stableStringify(base)).digest("hex");
  const receipt: Receipt = {
    ...base,
    digest,
    signature: hmac(digest)
  };

  const filePath = writeReceipt(receipt);
  intentsTotal.inc({ decision });

  const status = decision === "executed" ? 202 : 409;
  res.status(status).json({ ok: decision === "executed", receiptPath: filePath, receipt });
});

app.listen(PORT, HOST, () => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      service: "hg-treasury-agent",
      msg: "started",
      host: HOST,
      port: PORT,
      evidenceDir: EVIDENCE_DIR,
      mainnetMode: MAINNET_MODE
    })
  );
  // ── GhostBrain Core registration ───────────────────────────────────────
  void ghostbrainRegister().then(() => ghostbrainStartHeartbeat());
});
