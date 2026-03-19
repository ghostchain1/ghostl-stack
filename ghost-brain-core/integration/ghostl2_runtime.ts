/**
 * GhostBrain — GhostL2 Runtime Monitor (TypeScript)
 *
 * Monitors the GhostL2 sequencer (chain_id = 901, RPC :7260) and
 * triggers GhostBrain AI evaluations on new blocks and sequencer events.
 *
 * Responsibilities:
 *   1. Subscribe to new L2 blocks via ghost_getLogs / polling.
 *   2. Forward transaction classification requests to GhostBrain API.
 *   3. Detect unsafe L2 head divergence (L2 vs L1 finality oracle).
 *   4. Report sequencer health metrics to GhostBrain telemetry.
 *
 * Chain routing law:
 *   - Only connects to L2 (chain_id 901). Never an external chain.
 *   - Cross-chain signals come from L1 → L2 via L1GhostPortal bridge;
 *     this service observes L2 but does NOT bridge directly.
 *
 * Bridge contracts:
 *   - L1 Finality Oracle L2: 0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A
 *   - L2 Rollup / L1 Rollup (from L2 view): 0xad32D5C2Da9f4159C4cc98686C005852b3905355
 */

// ── Environment ────────────────────────────────────────────────────────────

export {}; // ensure module scope — prevents redeclare conflicts with other runtime files

const L2_RPC_URL       = process.env["GHOSTL2_RPC"]          ?? "http://localhost:7260";
const L1_RPC_URL       = process.env["GHOSTCHAIN_L1_RPC"]    ?? "http://localhost:18545";
const GHOSTBRAIN_URL   = process.env["GHOSTBRAIN_URL"]        ?? "http://localhost:7900";
const L2_CHAIN_ID      = 901;

// Contract addresses
const FINALITY_ORACLE_L2 = "0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A";
const L1_ROLLUP_ADDR     = "0xad32D5C2Da9f4159C4cc98686C005852b3905355";

// ── JSON-RPC ───────────────────────────────────────────────────────────────

let rpcId = 1;

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = await res.json() as { result: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface L2Block {
  number:       string;   // hex
  hash:         string;
  parentHash:   string;
  timestamp:    string;   // hex
  transactions: string[];
}

interface L2HealthReport {
  l2BlockNumber:   bigint;
  l2Timestamp:     bigint;
  l1FinalityBlock: bigint;
  safeHead:        bigint;
  isSafe:          boolean;
  txCount:         number;
}

// ── L2 block reader ────────────────────────────────────────────────────────

async function getLatestL2Block(): Promise<L2Block> {
  return rpc<L2Block>(L2_RPC_URL, "ghost_getBlockByNumber", ["latest", false]);
}

async function getL2BlockByNumber(n: bigint): Promise<L2Block> {
  return rpc<L2Block>(L2_RPC_URL, "ghost_getBlockByNumber", [
    "0x" + n.toString(16), false,
  ]);
}

// ── Finality check ─────────────────────────────────────────────────────────

/** Read the L1 finality oracle on L2 to get the latest safe L2 block. */
async function getSafeL2Head(): Promise<bigint> {
  // Selector: safeHead() → uint256  (pre-computed 0x3c69b7bf)
  const result = await rpc<string>(L2_RPC_URL, "ghost_call", [{
    to:   FINALITY_ORACLE_L2,
    data: "0x3c69b7bf",
  }, "latest"]);
  return result && result !== "0x" ? BigInt(result) : 0n;
}

/** Read the latest submitted L2 block from the L1 rollup contract. */
async function getL1SubmittedL2Block(): Promise<bigint> {
  // Selector: latestBlockNumber() → uint256  (pre-computed 0x5fc6e1ed)
  const result = await rpc<string>(L1_RPC_URL, "ghost_call", [{
    to:   L1_ROLLUP_ADDR,
    data: "0x5fc6e1ed",
  }, "latest"]);
  return result && result !== "0x" ? BigInt(result) : 0n;
}

// ── GhostBrain request ─────────────────────────────────────────────────────

interface TxClassificationRequest {
  source:      "l2";
  blockNumber: bigint;
  txHashes:    string[];
  timestamp:   bigint;
}

interface TxClassificationResult {
  highRisk:   string[];   // tx hashes flagged as high-risk
  normal:     string[];
}

async function requestTxClassification(
  req: TxClassificationRequest,
): Promise<TxClassificationResult> {
  const res = await fetch(`${GHOSTBRAIN_URL}/v1/classify`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      source:       req.source,
      block_number: req.blockNumber.toString(),
      tx_hashes:    req.txHashes,
      timestamp:    req.timestamp.toString(),
    }),
  });

  if (!res.ok) {
    console.error(`[L2Runtime] GhostBrain classify failed (${res.status})`);
    return { highRisk: [], normal: req.txHashes };
  }
  return res.json() as Promise<TxClassificationResult>;
}

// ── L2 Runtime Monitor ─────────────────────────────────────────────────────

class GhostL2Runtime {
  #lastSeenBlock: bigint = 0n;
  #pollMs:        number;

  constructor(pollMs = 2_000) {
    this.#pollMs = pollMs;
  }

  async #processBlock(block: L2Block): Promise<void> {
    const blockNum  = BigInt(block.number);
    const timestamp = BigInt(block.timestamp);

    const safeHead     = await getSafeL2Head().catch(() => 0n);
    const l1Submitted  = await getL1SubmittedL2Block().catch(() => 0n);

    const report: L2HealthReport = {
      l2BlockNumber:   blockNum,
      l2Timestamp:     timestamp,
      l1FinalityBlock: l1Submitted,
      safeHead,
      isSafe:          blockNum <= safeHead,
      txCount:         block.transactions.length,
    };

    // Log health report.
    console.log(JSON.stringify({
      event:       "l2_block",
      block:       blockNum.toString(),
      safe:        report.isSafe,
      safe_head:   safeHead.toString(),
      l1_submit:   l1Submitted.toString(),
      tx_count:    report.txCount,
    }));

    // Classify transactions via GhostBrain (only if there are any).
    if (block.transactions.length > 0) {
      const result = await requestTxClassification({
        source:      "l2",
        blockNumber: blockNum,
        txHashes:    block.transactions.slice(0, 50),   // cap at 50 per block
        timestamp,
      });

      if (result.highRisk.length > 0) {
        console.warn(`[L2Runtime] HIGH RISK tx in block ${blockNum}:`, result.highRisk);
      }
    }

    // Alert if L2 head is far ahead of L1-submitted (potential sequencer issue).
    if (l1Submitted > 0n && blockNum - l1Submitted > 1000n) {
      console.error(
        `[L2Runtime] ALERT: L2 head (${blockNum}) is >1000 blocks ahead of L1 submission (${l1Submitted})`
      );
    }
  }

  async start(): Promise<void> {
    console.log(`[L2Runtime] GhostL2 monitor starting (chain_id=${L2_CHAIN_ID}, poll=${this.#pollMs}ms)`);

    const poll = async () => {
      try {
        const latest  = await getLatestL2Block();
        const current = BigInt(latest.number);

        if (current > this.#lastSeenBlock) {
          // Process all new blocks since last seen (up to 10 at a time).
          const start = this.#lastSeenBlock > 0n ? this.#lastSeenBlock + 1n : current;
          const end   = current;
          const limit = 10n;
          const from  = end - start > limit ? end - limit : start;

          for (let n = from; n <= end; n++) {
            const block = n === end
              ? latest
              : await getL2BlockByNumber(n);
            await this.#processBlock(block);
          }
          this.#lastSeenBlock = current;
        }
      } catch (err) {
        console.error("[L2Runtime] Poll error:", err);
      }
    };

    // Run immediately then on interval.
    await poll();
    setInterval(poll, this.#pollMs);
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

const runtime = new GhostL2Runtime(
  parseInt(process.env["L2_POLL_MS"] ?? "2000", 10)
);

runtime.start().catch(err => {
  console.error("[L2Runtime] Fatal:", err);
  process.exit(1);
});
