import express from "express";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

type Layer = 1 | 2 | 3;

type RootRecord = {
  layer: Layer;
  root: string;
  parentL2Root?: string;
  timestamp: number;
};

type OutboundMessage = {
  messageId: string;
  sourceLayer: Layer;
  destinationChainId: number;
  payloadHash: string;
  amount: string;
  status: "queued" | "executed";
  executedTxHash?: string;
  queuedAt: number;
};

const app = express();
app.use(express.json({ limit: "2mb" }));

const port = Number(process.env.PORT || 7720);
const adminToken = process.env.ADMIN_TOKEN || "";
const dataDir = process.env.BRIDGE_HUB_DATA_DIR || path.join(process.cwd(), "data");
const statePath = path.join(dataDir, "bridge-hub-state.json");

const allowedExternalChains = new Set(
  String(process.env.EXTERNAL_CHAIN_ALLOWLIST || "").split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v > 0)
);

const state: {
  rootsL2: Record<string, RootRecord>;
  rootsL3: Record<string, RootRecord>;
  outbound: Record<string, OutboundMessage>;
} = {
  rootsL2: {},
  rootsL3: {},
  outbound: {}
};

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!adminToken) {
    next();
    return;
  }
  const bearer = String(req.headers.authorization || "");
  if (bearer !== `Bearer ${adminToken}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};

const save = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
};

const load = async () => {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as typeof state;
    state.rootsL2 = parsed.rootsL2 || {};
    state.rootsL3 = parsed.rootsL3 || {};
    state.outbound = parsed.outbound || {};
  } catch {
    // no-op
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ghostchain-bridge-hub", externalChains: [...allowedExternalChains] });
});

app.get("/state", (_req, res) => {
  res.json(state);
});

app.post("/roots/l2", auth, async (req, res) => {
  const root = String(req.body?.root || "").toLowerCase();
  if (!root) {
    res.status(400).json({ error: "missing_root" });
    return;
  }
  state.rootsL2[root] = { layer: 2, root, timestamp: Date.now() };
  await save();
  res.json({ ok: true, root });
});

app.post("/roots/l3", auth, async (req, res) => {
  const root = String(req.body?.root || "").toLowerCase();
  const parentL2Root = String(req.body?.parentL2Root || "").toLowerCase();
  if (!root || !parentL2Root) {
    res.status(400).json({ error: "missing_root_or_parent" });
    return;
  }
  if (!state.rootsL2[parentL2Root]) {
    res.status(400).json({ error: "L2_PARENT_NOT_FINALIZED_ON_L1" });
    return;
  }
  state.rootsL3[root] = { layer: 3, root, parentL2Root, timestamp: Date.now() };
  await save();
  res.json({ ok: true, root, parentL2Root });
});

app.post("/egress", auth, async (req, res) => {
  const sourceLayer = Number(req.body?.sourceLayer) as Layer;
  const destinationChainId = Number(req.body?.destinationChainId);
  const payloadHash = String(req.body?.payloadHash || "");
  const amount = String(req.body?.amount || "0");

  if (sourceLayer !== 1) {
    res.status(400).json({ error: "ONLY_L1_CAN_EGRESS_EXTERNALLY" });
    return;
  }
  if (allowedExternalChains.size > 0 && !allowedExternalChains.has(destinationChainId)) {
    res.status(400).json({ error: "EXTERNAL_CHAIN_NOT_ALLOWED" });
    return;
  }
  if (!payloadHash) {
    res.status(400).json({ error: "missing_payload_hash" });
    return;
  }

  const messageId = hash(`${Date.now()}:${destinationChainId}:${payloadHash}:${amount}`);
  state.outbound[messageId] = {
    messageId,
    sourceLayer,
    destinationChainId,
    payloadHash,
    amount,
    status: "queued",
    queuedAt: Date.now()
  };

  await save();
  res.json({ ok: true, messageId });
});

app.post("/validate-withdrawal", (_req, res) => {
  const l3Root = String(_req.body?.l3Root || "").toLowerCase();
  const parentL2Root = String(_req.body?.parentL2Root || "").toLowerCase();

  if (!state.rootsL3[l3Root]) {
    res.status(400).json({ ok: false, error: "L3_NOT_FINALIZED_ON_L2" });
    return;
  }
  if (!state.rootsL2[parentL2Root]) {
    res.status(400).json({ ok: false, error: "L2_PARENT_NOT_FINALIZED_ON_L1" });
    return;
  }
  if (state.rootsL3[l3Root].parentL2Root !== parentL2Root) {
    res.status(400).json({ ok: false, error: "L3_PARENT_L2_MISMATCH" });
    return;
  }

  res.json({ ok: true });
});

app.post("/egress/:messageId/execute", auth, async (req, res) => {
  const messageId = String(req.params.messageId || "");
  const txHash = String(req.body?.txHash || "");
  const message = state.outbound[messageId];
  if (!message) {
    res.status(404).json({ error: "message_not_found" });
    return;
  }
  message.status = "executed";
  message.executedTxHash = txHash;
  await save();
  res.json({ ok: true, messageId, txHash });
});

load().finally(() => {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[ghostchain-bridge-hub] listening on ${port}`);
  });
});
