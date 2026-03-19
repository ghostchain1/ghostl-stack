/**
 * GhostBrain — GhostL3 Inference Gateway (TypeScript)
 *
 * Routes AI inference requests that arrive as L3 transactions or events
 * on GhostL3 (chain_id = 903, RPC :7270) to the GhostBrain compute
 * engine, and returns inference results as L3 settlement transactions.
 *
 * Architecture:
 *   L3 dApp → submitInferenceRequest() on L3 contract
 *     → GhostBrain L3 gateway picks up event
 *       → forward to GhostBrain API (port 7900)
 *         → result returned as signed attestation
 *           → relay to L3 fulfillInference() via signing relay
 *
 * Chain routing law:
 *   - Only connects to L3 (chain_id 903). Cross-chain traffic goes
 *     through L2 → L1 (never directly to an external chain).
 *   - L3 is app-specific; this gateway is the single bridge between
 *     L3 smart contracts and GhostBrain AI compute.
 *
 * Contract addresses (L3):
 *   - L2→L3 Rollup (from L3 view): 0x130A46b6E41DB6E1e18fb9c759F223c459190e90
 *   - Finality Oracle L3:           0x87F850cbC2cFfac086F20d0d7307E12d06fA2127
 *   - InferenceGateway L3:          INFERENCE_GATEWAY_L3 (env)
 */

// ── Environment ────────────────────────────────────────────────────────────

export {}; // ensure module scope — prevents redeclare conflicts with other runtime files

const L3_RPC_URL        = process.env["GHOSTL3_RPC"]           ?? "http://localhost:7270";
const GHOSTBRAIN_URL    = process.env["GHOSTBRAIN_URL"]         ?? "http://localhost:7900";
const SIGNING_RELAY     = process.env["SIGNING_RELAY_URL"]      ?? "http://localhost:7910";
const INFERENCE_GW_L3   = process.env["INFERENCE_GATEWAY_L3"]  ?? "0x0000000000000000000000000000000000007700";
const L3_CHAIN_ID       = 903;

// Finality oracle on L3
const FINALITY_ORACLE_L3 = "0x87F850cbC2cFfac086F20d0d7307E12d06fA2127";

// ── JSON-RPC ───────────────────────────────────────────────────────────────

let rpcId = 1;

async function l3rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(L3_RPC_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  if (!res.ok) throw new Error(`L3 RPC ${method} HTTP ${res.status}`);
  const json = await res.json() as { result: T; error?: { message: string } };
  if (json.error) throw new Error(`L3 RPC error: ${json.error.message}`);
  return json.result;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface L3InferenceRequest {
  requestId:  string;   // bytes32 hex
  requester:  string;   // L3 address
  modelId:    string;   // e.g. "llama-7b", "embedding-v2"
  inputCid:   string;   // IPFS/GhostStore content ID for input tensor
  maxTokens:  number;
  blockNumber: bigint;
  timestamp:  bigint;
}

interface InferenceResponse {
  requestId: string;
  modelId:   string;
  outputCid: string;     // CID of output tensor stored in GhostStore
  tokens:    number;
  latencyMs: number;
  attestation: string;   // hex Ed25519 signature from GhostBrain chiplet
}

interface L3Log {
  topics:      string[];
  data:        string;
  blockNumber: string;
  transactionHash: string;
}

// ── Event decoding ─────────────────────────────────────────────────────────

// Event signature: InferenceRequested(bytes32 requestId, address requester, string modelId, string inputCid, uint256 maxTokens)
// Topic 0 = keccak256(above) = 0xaaaa... (placeholder; replace with real hash)
const INFERENCE_REQUESTED_TOPIC = "0xaaaa000000000000000000000000000000000000000000000000000000000001";

function decodeInferenceEvent(log: L3Log): L3InferenceRequest | null {
  if (log.topics[0] !== INFERENCE_REQUESTED_TOPIC) return null;
  if (!log.topics[1] || !log.topics[2]) return null;

  try {
    const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;

    // requestId = topics[1] (bytes32)
    const requestId = "0x" + log.topics[1]!.slice(2);

    // requester = topics[2] (address, last 20 bytes)
    const requester = "0x" + log.topics[2]!.slice(26);

    // ABI-decode data: (string modelId, string inputCid, uint256 maxTokens)
    // Offsets: 0x00=model offset, 0x20=inputCid offset, 0x40=maxTokens
    const maxTokens = Number(BigInt("0x" + data.slice(128, 192)));

    // Sequential string decode (simplified: use offset at 0x00).
    const modelOffset  = Number(BigInt("0x" + data.slice(0, 64))) * 2;
    const modelLen     = Number(BigInt("0x" + data.slice(modelOffset, modelOffset + 64)));
    const modelId      = Buffer.from(data.slice(modelOffset + 64, modelOffset + 64 + modelLen * 2), "hex").toString("utf8");

    const cidOffset = Number(BigInt("0x" + data.slice(64, 128))) * 2;
    const cidLen    = Number(BigInt("0x" + data.slice(cidOffset, cidOffset + 64)));
    const inputCid  = Buffer.from(data.slice(cidOffset + 64, cidOffset + 64 + cidLen * 2), "hex").toString("utf8");

    return {
      requestId,
      requester,
      modelId,
      inputCid,
      maxTokens,
      blockNumber: BigInt(log.blockNumber),
      timestamp:   BigInt(Math.floor(Date.now() / 1000)),
    };
  } catch {
    return null;
  }
}

// ── GhostBrain inference request ───────────────────────────────────────────

async function runInference(req: L3InferenceRequest): Promise<InferenceResponse> {
  const start = Date.now();

  const res = await fetch(`${GHOSTBRAIN_URL}/v1/infer`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      request_id: req.requestId,
      model_id:   req.modelId,
      input_cid:  req.inputCid,
      max_tokens: req.maxTokens,
      source:     "l3",
      priority:   100,   // L3 inference requests get governance-level priority
    }),
  });

  if (!res.ok) {
    throw new Error(`[L3Gateway] GhostBrain infer failed (${res.status})`);
  }

  const body = await res.json() as {
    output_cid:  string;
    tokens:      number;
    attestation: string;
  };

  return {
    requestId:   req.requestId,
    modelId:     req.modelId,
    outputCid:   body.output_cid,
    tokens:      body.tokens,
    latencyMs:   Date.now() - start,
    attestation: body.attestation,
  };
}

// ── L3 fulfillment relay ───────────────────────────────────────────────────

// Selector: fulfillInference(bytes32 requestId, string outputCid, bytes attestation)
const SEL_FULFILL = "0xb1c2d3e4";

async function fulfillOnL3(resp: InferenceResponse): Promise<void> {
  const enc         = new TextEncoder();
  const cidBytes    = enc.encode(resp.outputCid);
  const attestBytes = Buffer.from(resp.attestation.startsWith("0x") ? resp.attestation.slice(2) : resp.attestation, "hex");

  // ABI-encode: bytes32, offset_cid, offset_attestation, len_cid, cid_data, len_attest, attest_data
  const encStr = (b: Buffer | Uint8Array): string => {
    const len = b.length.toString(16).padStart(64, "0");
    const dat = Buffer.from(b).toString("hex").padEnd(Math.ceil(b.length / 32) * 64, "0");
    return len + dat;
  };

  const reqId   = resp.requestId.startsWith("0x") ? resp.requestId.slice(2) : resp.requestId;
  const cidEnc  = encStr(Buffer.from(cidBytes));
  const attEnc  = encStr(attestBytes);
  const off1    = (96).toString(16).padStart(64, "0");
  const off2    = (96 + 32 + cidBytes.length + Math.ceil(cidBytes.length / 32) * 32 - cidBytes.length).toString(16).padStart(64, "0");

  const data = SEL_FULFILL + reqId.padStart(64, "0") + off1 + off2 + cidEnc + attEnc;

  const relayBody = JSON.stringify({
    from:     "ghostbrain",
    to:       INFERENCE_GW_L3,
    chainId:  L3_CHAIN_ID,
    data:     "0x" + data,
    gas:      "0x" + (200_000).toString(16),
    gasToken: "GST",
  });

  const res = await fetch(`${SIGNING_RELAY}/relay/sign_and_submit`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    relayBody,
  });

  if (!res.ok) {
    console.error(`[L3Gateway] L3 fulfill relay failed (${res.status})`);
  } else {
    const receipt = await res.json() as { txId: string };
    console.info(`[L3Gateway] Fulfilled request ${resp.requestId} → L3 tx ${receipt.txId} (${resp.latencyMs}ms)`);
  }
}

// ── Gateway event loop ─────────────────────────────────────────────────────

class L3InferenceGateway {
  #lastBlock: bigint = 0n;
  #pollMs:    number;

  constructor(pollMs = 2_000) {
    this.#pollMs = pollMs;
  }

  async #poll(): Promise<void> {
    const latestHex = await l3rpc<string>("ghost_blockNumber", []);
    const latest    = BigInt(latestHex);

    if (latest <= this.#lastBlock) return;

    const from = this.#lastBlock > 0n ? this.#lastBlock + 1n : latest;
    const to   = latest;

    const logs = await l3rpc<L3Log[]>("ghost_getLogs", [{
      fromBlock: "0x" + from.toString(16),
      toBlock:   "0x" + to.toString(16),
      address:   INFERENCE_GW_L3,
      topics:    [INFERENCE_REQUESTED_TOPIC],
    }]);

    this.#lastBlock = latest;

    for (const log of logs) {
      const req = decodeInferenceEvent(log);
      if (!req) continue;

      console.log(`[L3Gateway] Inference request: id=${req.requestId} model=${req.modelId}`);
      try {
        const resp = await runInference(req);
        await fulfillOnL3(resp);
      } catch (err) {
        console.error(`[L3Gateway] Failed to fulfill ${req.requestId}:`, err);
      }
    }
  }

  async start(): Promise<void> {
    console.log(`[L3Gateway] GhostL3 inference gateway starting (chain_id=${L3_CHAIN_ID})`);
    await this.#poll();
    setInterval(() => this.#poll().catch(console.error), this.#pollMs);
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

const gateway = new L3InferenceGateway(
  parseInt(process.env["L3_POLL_MS"] ?? "2000", 10)
);

gateway.start().catch(err => {
  console.error("[L3Gateway] Fatal:", err);
  process.exit(1);
});
