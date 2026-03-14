/**
 * GhostChain Sovereign Interchain Bridge — Bridge Relayer
 *
 * The relayer monitors outbound `MessageLocked` events on GhostChain L1
 * (or any source chain), packages them as typed `BridgeMessage` objects,
 * and submits them to registered validators for quorum signing before
 * forwarding to the destination.
 *
 * Settlement authority:
 *   GhostChain L1 (chain_id 14000101) is ALWAYS the settlement authority.
 *   External chains → Bridge → GhostChain.  Never external chain → external chain.
 *
 * Advisory-only:
 *   The relayer forwards events and collects signatures but never calls
 *   on-chain `approveInbound` directly — that is the validators' concern.
 *   The relayer POSTs advisory relay records to GhostBrain and signs with
 *   the signing relay for governance audit.
 *
 * Security:
 *   - Message deduplication by content hash (prevents double-relay).
 *   - Bounded in-flight queue (MAX_QUEUE).
 *   - All amounts as bigint (GST smallest unit).
 *   - Input validation on every ingested event.
 *   - No automatic on-chain writes; advisory proposals only.
 *
 * Gas token: GST.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101;
const L2_CHAIN_ID = 901;
const L3_CHAIN_ID = 903;

const MAX_QUEUE = 2000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface BridgeMessage {
  msgId:       string;   // bytes32 hex
  srcChainId:  number;
  dstChainId:  number;
  sender:      string;   // checksummed address
  recipient:   string;
  amountGst:   bigint;   // GST smallest unit
  nonce:       number;
  extraData:   string;   // bytes32 hex
  observedAt:  number;   // Unix seconds
}

export type RelayStatus = "pending" | "relayed" | "confirmed" | "failed";

export interface RelayRecord {
  message:       BridgeMessage;
  status:        RelayStatus;
  attemptCount:  number;
  lastAttemptAt: number;
  validatorSigs: string[];   // collected validator signatures
  error?:        string;
}

// ── BridgeRelayer ────────────────────────────────────────────────────────────

export interface BridgeRelayerOptions {
  ghostbrainUrl?:  string;
  relayUrl?:       string;
  /** Maximum relay attempts per message before marking failed. */
  maxAttempts?: number;
}

export class BridgeRelayer {
  private readonly ghostbrainUrl: string;
  private readonly relayUrl:      string;
  private readonly maxAttempts:   number;

  /** In-flight messages keyed by msgId. */
  private readonly queue = new Map<string, RelayRecord>();
  /** Deduplication set. */
  private readonly seen  = new Set<string>();

  constructor(opts: BridgeRelayerOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.relayUrl      = opts.relayUrl      ?? (process.env["SIGNING_RELAY_URL"]   ?? "http://localhost:7910");
    this.maxAttempts   = opts.maxAttempts   ?? 5;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Ingest a bridge message observed from a chain event.
   * Returns false if the message was already seen or the queue is full.
   */
  ingest(msg: BridgeMessage): boolean {
    this.validateMessage(msg);
    if (this.seen.has(msg.msgId))     return false;
    if (this.queue.size >= MAX_QUEUE) return false;

    this.seen.add(msg.msgId);
    this.queue.set(msg.msgId, {
      message:       msg,
      status:        "pending",
      attemptCount:  0,
      lastAttemptAt: 0,
      validatorSigs: [],
    });
    return true;
  }

  /**
   * Attach a validator signature to a queued message.
   * When enough signatures are collected, the record advances to "relayed".
   */
  addSignature(msgId: string, validatorAddress: string, signature: string, quorumThreshold: number): void {
    const rec = this.queue.get(msgId);
    if (!rec || rec.status !== "pending") return;
    if (rec.validatorSigs.includes(signature)) return;

    rec.validatorSigs.push(signature);

    if (rec.validatorSigs.length >= quorumThreshold) {
      rec.status = "relayed";
      this.forwardRelay(rec).catch((err: Error) =>
        console.error("[BridgeRelayer] relay forward error:", err.message),
      );
    }
  }

  /**
   * Mark a message as confirmed (on-chain `MessageFinalised` event observed).
   */
  confirm(msgId: string): void {
    const rec = this.queue.get(msgId);
    if (rec) rec.status = "confirmed";
  }

  /**
   * Retry all pending messages that exceed the backoff window.
   * Call from a periodic tick (e.g. every 30s).
   */
  async tick(nowSec: number = Math.floor(Date.now() / 1000)): Promise<void> {
    for (const [msgId, rec] of this.queue) {
      if (rec.status === "pending" && nowSec - rec.lastAttemptAt >= 30) {
        rec.attemptCount++;
        rec.lastAttemptAt = nowSec;
        if (rec.attemptCount > this.maxAttempts) {
          rec.status = "failed";
          this.forwardFailed(rec).catch((err: Error) =>
            console.error("[BridgeRelayer] failed-report error:", err.message),
          );
          this.queue.delete(msgId);
        } else {
          this.forwardPending(rec).catch((err: Error) =>
            console.error("[BridgeRelayer] pending-forward error:", err.message),
          );
        }
      }
    }
    // Evict confirmed messages from queue.
    for (const [msgId, rec] of this.queue) {
      if (rec.status === "confirmed") this.queue.delete(msgId);
    }
  }

  queueSize(): number {
    return this.queue.size;
  }

  pendingMessages(): RelayRecord[] {
    return [...this.queue.values()].filter(r => r.status === "pending");
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private validateMessage(msg: BridgeMessage): void {
    if (!msg.msgId || msg.msgId.length !== 66) // "0x" + 64 hex
      throw new Error("BridgeRelayer: invalid msgId length");
    if (msg.amountGst <= 0n)
      throw new Error("BridgeRelayer: amountGst must be > 0");
    if (msg.srcChainId === msg.dstChainId)
      throw new Error("BridgeRelayer: srcChainId === dstChainId");
    // GhostChain must be settlement party for all messages.
    if (msg.srcChainId !== L1_CHAIN_ID && msg.dstChainId !== L1_CHAIN_ID) {
      // L2→L3 or L3→L2 are allowed internally; external→external is not.
      const ghostIds = new Set([L1_CHAIN_ID, L2_CHAIN_ID, L3_CHAIN_ID]);
      if (!ghostIds.has(msg.srcChainId) && !ghostIds.has(msg.dstChainId))
        throw new Error("BridgeRelayer: neither srcChainId nor dstChainId is a GhostChain layer");
    }
  }

  private serialise(rec: RelayRecord): object {
    return {
      chain_id:      L1_CHAIN_ID,
      gas_token:     "GST",
      from:          "ghostbrain-interchain-bridge",
      msgId:         rec.message.msgId,
      srcChainId:    rec.message.srcChainId,
      dstChainId:    rec.message.dstChainId,
      sender:        rec.message.sender,
      recipient:     rec.message.recipient,
      amountGst:     rec.message.amountGst.toString(),
      nonce:         rec.message.nonce,
      status:        rec.status,
      attemptCount:  rec.attemptCount,
      sigCount:      rec.validatorSigs.length,
      observedAt:    rec.message.observedAt,
    };
  }

  private async forwardPending(rec: RelayRecord): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/bridge/relay-pending`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(this.serialise(rec)),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }

  private async forwardRelay(rec: RelayRecord): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/bridge/relay-ready`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(this.serialise(rec)),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }

  private async forwardFailed(rec: RelayRecord): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/bridge/relay-failed`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...this.serialise(rec), error: rec.error }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
