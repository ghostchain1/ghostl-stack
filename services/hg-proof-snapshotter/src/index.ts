import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { Counter, Registry, collectDefaultMetrics } from "prom-client";
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  zeroPadValue,
  toUtf8Bytes,
  type ContractTransactionResponse,
} from "@ghostchain/sdk";

/** Minimal ABI for ZkBatchVerifier.verifyBatch */
const ZK_BATCH_VERIFIER_ABI = [
  "function verifyBatch(bytes calldata proof, bytes32 batchRoot, uint256 batchId) external returns (bool)",
] as const;

type OnchainPostResult = {
  succeeded: boolean;
  txHash?: string;
  reason?: string;
};

async function postSnapshotOnchain(params: {
  epoch: number;
  merkleRoot: string;  // hex string (sha256 digest)
  proof: string;       // hex HMAC signature
}): Promise<OnchainPostResult> {
  const rpcUrl    = process.env.SNAPSHOT_RPC_URL?.trim();
  const signerKey = process.env.SNAPSHOT_SIGNER_KEY?.trim();
  const contractAddr = process.env.ZK_BATCH_VERIFIER_ADDRESS?.trim();

  if (!rpcUrl || !signerKey || !contractAddr) {
    return {
      succeeded: false,
      reason: "missing_env: SNAPSHOT_RPC_URL, SNAPSHOT_SIGNER_KEY, and ZK_BATCH_VERIFIER_ADDRESS are required for on-chain posting",
    };
  }

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const wallet   = new Wallet(signerKey, provider);
    const contract = new Contract(contractAddr, ZK_BATCH_VERIFIER_ABI, wallet);

    // ZkBatchVerifier.verifyBatch(bytes proof, bytes32 batchRoot, uint256 batchId)
    // Map: epoch → batchId, merkleRoot → batchRoot, HMAC → proof bytes
    const batchRoot = zeroPadValue(`0x${params.merkleRoot}`, 32);
    const proofBytes = toUtf8Bytes(params.proof);

    const tx = await (contract["verifyBatch"] as (
      proof: Uint8Array,
      batchRoot: string,
      batchId: bigint
    ) => Promise<ContractTransactionResponse>)(proofBytes, batchRoot, BigInt(params.epoch));

    const receipt = await tx.wait(1);
    return {
      succeeded: receipt !== null && receipt.status === 1,
      txHash: tx.hash,
      reason: receipt?.status !== 1 ? "tx_reverted" : undefined,
    };
  } catch (err: unknown) {
    return {
      succeeded: false,
      reason: err instanceof Error ? err.message : "unknown_onchain_error",
    };
  }
}

type SnapshotReceipt = {
  snapshotId: string;
  epoch: number;
  timestamp: string;
  source: string;
  leaves: string[];
  merkleRoot: string;
  proposalRef: string;
  onchainPost: {
    enabled: boolean;
    attempted: boolean;
    succeeded: boolean;
    txHash?: string;
    reason?: string;
  };
  signature: string;
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || "7662");
const HOST = process.env.HOST || "0.0.0.0";
const INDEXER_BASE = (process.env.INDEXER_BASE || "http://hg-reporting-indexer:7603").replace(/\/$/, "");
const POST_ONCHAIN = String(process.env.POST_ONCHAIN || "false") === "true";

function resolveSigningSecret(raw: string | undefined): string {
  const candidate = String(raw || "").trim();
  const isPlaceholder =
    candidate.length === 0 ||
    candidate === "dev-placeholder-secret" ||
    candidate === "__SET_IN_VAULT__";
  const strictMode = process.env.NODE_ENV === "production";

  if (strictMode && isPlaceholder) {
    throw new Error("SNAPSHOT_SIGNING_SECRET must be set from Vault/KMS in production mode");
  }

  if (isPlaceholder) {
    return "dev-placeholder-secret";
  }

  return candidate;
}

const SIGNING_SECRET = resolveSigningSecret(process.env.SNAPSHOT_SIGNING_SECRET);

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

const OUTPUT_DIR = resolveWritableDir(process.env.SNAPSHOT_EVIDENCE_DIR || "/tmp/ghost-proofs", "ghost-proofs");

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "hg_proof_snapshotter_" });
const snapshotsTotal = new Counter({
  name: "hg_proof_snapshotter_snapshots_total",
  help: "Total snapshots produced",
  registers: [registry]
});

const sha = (input: string): string => crypto.createHash("sha256").update(input).digest("hex");

function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha("empty");
  let level = leaves.map((v) => sha(v));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(sha(`${left}${right}`));
    }
    level = next;
  }
  return level[0];
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch_failed:${response.status}`);
  return (await response.json()) as T;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hg-proof-snapshotter", indexer: INDEXER_BASE });
});

app.get("/metrics", async (_req, res) => {
  res.set("content-type", registry.contentType);
  res.send(await registry.metrics());
});

app.post("/v1/proofs/snapshot", async (req, res) => {
  const epoch = Number(req.body?.epoch || Date.now());
  const proposalRef = String(req.body?.proposalRef || "manual");

  try {
    const holdings = await fetchJson<{ treasuryBalanceWei: string; positions: Array<{ strategy: string; amountWei: string }> }>(
      `${INDEXER_BASE}/v1/treasury/holdings`
    );
    const flows = await fetchJson<{ totals: Record<string, string> }>(`${INDEXER_BASE}/v1/flows/summary`);

    const leaves = [
      `treasuryBalanceWei:${holdings.treasuryBalanceWei || "0"}`,
      ...Object.entries(flows.totals || {}).map(([k, v]) => `${k}:${v}`),
      ...(holdings.positions || []).slice(0, 200).map((p) => `position:${p.strategy}:${p.amountWei}`)
    ];

    const root = merkleRoot(leaves);
    const hmacSig = signPayload(`${root}:${epoch}:${proposalRef}`);

    // ── On-chain post ──────────────────────────────────────────────────────
    let onchainResult: OnchainPostResult = { succeeded: false, reason: "disabled" };
    if (POST_ONCHAIN) {
      onchainResult = await postSnapshotOnchain({ epoch, merkleRoot: root, proof: hmacSig });
    }

    const snapshotBase = {
      snapshotId: crypto.randomUUID(),
      epoch,
      timestamp: new Date().toISOString(),
      source: INDEXER_BASE,
      leaves,
      merkleRoot: root,
      proposalRef,
      onchainPost: {
        enabled: POST_ONCHAIN,
        attempted: POST_ONCHAIN,
        succeeded: onchainResult.succeeded,
        txHash: onchainResult.txHash,
        reason: onchainResult.reason,
      }
    };

    const receipt: SnapshotReceipt = {
      ...snapshotBase,
      signature: signPayload(JSON.stringify(snapshotBase))
    };

    const filePath = path.join(OUTPUT_DIR, `${receipt.timestamp.replace(/[:.]/g, "-")}-${receipt.snapshotId}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });

    await fetch(`${INDEXER_BASE}/v1/ingest/snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ epoch, root, uri: `file://${filePath}` })
    }).catch(() => undefined);

    snapshotsTotal.inc();
    res.json({ ok: true, receipt, filePath });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "snapshot_failed" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", service: "hg-proof-snapshotter", msg: "started", port: PORT }));
});
