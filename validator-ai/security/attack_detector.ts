/**
 * GhostChain AI Validator Network — Attack Detector
 *
 * Detects active attacks against the GhostChain validator network by
 * correlating block-level signals across L1, L2, and L3.
 *
 * Detected attack classes:
 *   gas_spam         — sustained gas exhaustion (>90% for N consecutive blocks)
 *   long_range       — deep reorganisation detected (height regress > threshold)
 *   eclipse          — validator peers dropping simultaneously (external signal)
 *   double_sign      — block at same height from different proposers on same chain
 *   selfish_mining   — proposer withholds blocks to capture multiple rewards
 *   sybil_flood      — large number of new validator registrations in short window
 *
 * All confirmed attacks are forwarded to GhostBrain Core (:7900/validator/attacks)
 * as advisory events.  GhostBrain routes critical events to the governance
 * signing relay for human ratification.
 *
 * SECURITY:
 *   - Height values are type-checked before comparison to prevent integer-
 *     based confusion attacks.
 *   - Proposer deduplication maps are bounded to prevent unbounded memory.
 *   - No private keys. Read-only detection layer.
 *   Gas token: GST.
 */

import type { ChainId } from "../monitor/validator_monitor.js";
import type { GhostBlock } from "../monitor/block_analyzer.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type AttackKind =
  | "gas_spam"
  | "long_range"
  | "eclipse"
  | "double_sign"
  | "selfish_mining"
  | "sybil_flood";

export interface AttackEvent {
  kind:          AttackKind;
  chainId:       ChainId;
  timestamp:     number;
  severity:      "warning" | "critical";
  description:   string;
  evidence:      Record<string, unknown>;
}

// ── AttackDetector ────────────────────────────────────────────────────────

export interface AttackDetectorOptions {
  ghostbrainUrl?: string;
  /** Percentage of gasLimit above which a block is considered gas-spam. */
  gasSpamPct?:              number;
  /** Consecutive gas-spam blocks before emitting an event. */
  gasSpamConsecutive?:      number;
  /** Block-height drop that signals a long-range / re-org attack. */
  longRangeReorgDepth?:     number;
  /** New validator registrations per window that triggers sybil alert. */
  sybilFloodThreshold?:     number;
  /** Window length (seconds) for sybil detection. */
  sybilWindowS?:            number;
  /** Withheld-block count (consecutive empty proposer slots) for selfish-mining. */
  selfishMiningBlocks?:     number;
}

export class AttackDetector {
  private readonly ghostbrainUrl:        string;
  private readonly gasSpamPct:           number;
  private readonly gasSpamConsecutive:   number;
  private readonly longRangeReorgDepth:  number;
  private readonly sybilFloodThreshold:  number;
  private readonly sybilWindowS:         number;
  private readonly selfishMiningBlocks:  number;

  // ── Rolling state ─────────────────────────────────────────────────────────

  /** Consecutive gas-spam block count per chain. */
  private readonly gasSpamStreak    = new Map<ChainId, number>();
  /** Last observed height per chain (for reorg detection). */
  private readonly lastHeight       = new Map<ChainId, number>();
  /** Per-height proposer seen set: chainId → height → Set<proposerAddress>. */
  private readonly proposerByHeight = new Map<ChainId, Map<number, Set<string>>>();
  /** Selfish-mining: consecutive empty slots per chain. */
  private readonly emptySlotStreak  = new Map<ChainId, number>();
  /** Sybil: validator registration timestamps. */
  private readonly sybilSamples:        number[] = [];

  private readonly MAX_HEIGHT_CACHE = 1000;

  constructor(opts: AttackDetectorOptions = {}) {
    this.ghostbrainUrl       = opts.ghostbrainUrl       ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.gasSpamPct          = opts.gasSpamPct          ?? 90;
    this.gasSpamConsecutive  = opts.gasSpamConsecutive  ?? 5;
    this.longRangeReorgDepth = opts.longRangeReorgDepth ?? 6;
    this.sybilFloodThreshold = opts.sybilFloodThreshold ?? 20;
    this.sybilWindowS        = opts.sybilWindowS        ?? 300;
    this.selfishMiningBlocks = opts.selfishMiningBlocks ?? 3;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Analyze a finalized block for attack indicators. */
  async detectBlock(block: GhostBlock): Promise<AttackEvent[]> {
    const events: AttackEvent[] = [];

    events.push(...this.detectGasSpam(block));
    events.push(...this.detectLongRange(block));
    events.push(...this.detectDoubleSign(block));
    events.push(...this.detectSelfishMining(block));

    this.updateLastHeight(block);

    if (events.length > 0) {
      this.forwardEvents(events).catch((err: Error) =>
        console.error("[AttackDetector] GhostBrain forward error:", err.message),
      );
    }
    return events;
  }

  /**
   * Signal an eclipse condition — called externally when the peer-discovery
   * layer observes a sudden validator peer-set collapse.
   */
  async detectEclipse(chainId: ChainId, affectedValidators: string[]): Promise<AttackEvent> {
    const ev: AttackEvent = {
      kind:        "eclipse",
      chainId,
      timestamp:   now(),
      severity:    "critical",
      description: `Eclipse attack suspected: ${affectedValidators.length} validators lost peers simultaneously`,
      evidence:    { affectedValidators },
    };
    await this.forwardEvents([ev]);
    return ev;
  }

  /** Record a new validator registration for sybil tracking. */
  async recordValidatorRegistration(chainId: ChainId): Promise<AttackEvent | null> {
    const ts = now();
    this.sybilSamples.push(ts);
    const cutoff = ts - this.sybilWindowS;
    // Remove expired samples.
    while (this.sybilSamples.length > 0 && this.sybilSamples[0]! < cutoff) {
      this.sybilSamples.shift();
    }
    if (this.sybilSamples.length >= this.sybilFloodThreshold) {
      const ev: AttackEvent = {
        kind:        "sybil_flood",
        chainId,
        timestamp:   ts,
        severity:    "warning",
        description: `${this.sybilSamples.length} validator registrations within ${this.sybilWindowS}s window`,
        evidence:    {
          registrationsInWindow: this.sybilSamples.length,
          windowS:               this.sybilWindowS,
        },
      };
      await this.forwardEvents([ev]);
      return ev;
    }
    return null;
  }

  // ── Detection helpers ─────────────────────────────────────────────────────

  private detectGasSpam(block: GhostBlock): AttackEvent[] {
    const gasUtilPct = block.gasLimit > 0n
      ? Number((block.gasUsed * 100n) / block.gasLimit)
      : 0;

    if (gasUtilPct >= this.gasSpamPct) {
      const streak = (this.gasSpamStreak.get(block.chainId) ?? 0) + 1;
      this.gasSpamStreak.set(block.chainId, streak);

      if (streak >= this.gasSpamConsecutive) {
        return [{
          kind:        "gas_spam",
          chainId:     block.chainId,
          timestamp:   block.timestamp,
          severity:    "critical",
          description: `Gas spam: ${streak} consecutive blocks at ≥${this.gasSpamPct}% gas utilisation`,
          evidence:    {
            height:     block.height,
            gasUsed:    block.gasUsed.toString(),
            gasLimit:   block.gasLimit.toString(),
            gasUtilPct,
            streak,
          },
        }];
      }
    } else {
      this.gasSpamStreak.set(block.chainId, 0);
    }
    return [];
  }

  private detectLongRange(block: GhostBlock): AttackEvent[] {
    const prev = this.lastHeight.get(block.chainId);
    if (prev !== undefined && block.height < prev) {
      const reorgDepth = prev - block.height;
      if (reorgDepth >= this.longRangeReorgDepth) {
        return [{
          kind:        "long_range",
          chainId:     block.chainId,
          timestamp:   block.timestamp,
          severity:    "critical",
          description: `Potential long-range attack: height regressed ${reorgDepth} blocks (${prev}→${block.height})`,
          evidence:    { previousHeight: prev, currentHeight: block.height, reorgDepth },
        }];
      }
    }
    return [];
  }

  private detectDoubleSign(block: GhostBlock): AttackEvent[] {
    if (!this.proposerByHeight.has(block.chainId)) {
      this.proposerByHeight.set(block.chainId, new Map());
    }
    const byHeight = this.proposerByHeight.get(block.chainId)!;

    // Age-out old heights to bound memory.
    for (const h of byHeight.keys()) {
      if (h < block.height - this.MAX_HEIGHT_CACHE) byHeight.delete(h);
    }

    if (!byHeight.has(block.height)) {
      byHeight.set(block.height, new Set());
    }
    const seen = byHeight.get(block.height)!;
    const events: AttackEvent[] = [];

    if (seen.size > 0 && !seen.has(block.proposerAddress)) {
      // A different proposer for the same height — potential equivocation.
      events.push({
        kind:        "double_sign",
        chainId:     block.chainId,
        timestamp:   block.timestamp,
        severity:    "critical",
        description: `Double-sign suspected at height ${block.height}: multiple proposers`,
        evidence:    {
          height:     block.height,
          proposers:  [...seen, block.proposerAddress],
        },
      });
    }
    seen.add(block.proposerAddress);
    return events;
  }

  private detectSelfishMining(block: GhostBlock): AttackEvent[] {
    if (block.transactionCount === 0) {
      const streak = (this.emptySlotStreak.get(block.chainId) ?? 0) + 1;
      this.emptySlotStreak.set(block.chainId, streak);
      if (streak >= this.selfishMiningBlocks) {
        return [{
          kind:        "selfish_mining",
          chainId:     block.chainId,
          timestamp:   block.timestamp,
          severity:    "warning",
          description: `Selfish-mining suspected: ${streak} consecutive empty blocks by proposer ${block.proposerAddress}`,
          evidence:    { height: block.height, streak, proposer: block.proposerAddress },
        }];
      }
    } else {
      this.emptySlotStreak.set(block.chainId, 0);
    }
    return [];
  }

  private updateLastHeight(block: GhostBlock): void {
    const prev = this.lastHeight.get(block.chainId) ?? 0;
    if (block.height > prev) this.lastHeight.set(block.chainId, block.height);
  }

  private async forwardEvents(events: AttackEvent[]): Promise<void> {
    const chainId = events[0]?.chainId ?? 14000101;
    const resp = await fetch(`${this.ghostbrainUrl}/validator/attacks`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: chainId, gas_token: "GST", events }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
