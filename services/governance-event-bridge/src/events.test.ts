/**
 * governance-event-bridge — events.ts unit tests
 *
 * Verifies that parseLog() correctly decodes all four GhostChainGovernor
 * event types from synthetic RawLog fixtures, and returns null for unknown
 * or malformed logs.
 */

import { describe, it, expect } from "vitest";
import { parseLog, TOPICS, type RawLog } from "./events.js";

// ── Encoding helpers ──────────────────────────────────────────────────────────

/** Encode a bigint / number as a 32-byte (64 hex char) ABI word (no 0x prefix). */
function w256(n: bigint | number): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

/** Encode an EVM-style address as a 32-byte ABI topic (0x-prefixed). */
function wAddr(addr: string): string {
  const hex = addr.startsWith("0x") ? addr.slice(2) : addr;
  return "0x" + hex.toLowerCase().padStart(64, "0");
}

/** Encode a boolean as a 32-byte ABI word (no 0x prefix). */
function wBool(v: boolean): string {
  return v ? w256(1) : w256(0);
}

/** Build a minimal RawLog fixture. */
function makeLog(
  topic0: string,
  topics: string[],
  data: string,
  blockHex = "0x100",
  txHash = "0xdeadbeef",
): RawLog {
  return {
    address:         "0x0000000000000000000000000000000000001234",
    topics:          [topic0, ...topics],
    data,
    blockNumber:     blockHex,
    transactionHash: txHash,
    logIndex:        "0x0",
  };
}

// ── ProposalCreated ───────────────────────────────────────────────────────────

describe("parseLog — ProposalCreated", () => {
  const PROPOSER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
  const TARGET   = "0x1234567890123456789012345678901234567890";
  const PROPOSAL_ID = 42n;

  it("decodes a standard (non-constitutional, non-amendment) proposal", () => {
    const log = makeLog(
      TOPICS.ProposalCreated,
      [
        "0x" + w256(PROPOSAL_ID),
        wAddr(PROPOSER),
        wAddr(TARGET),
      ],
      "0x" + wBool(false) + wBool(false),
    );
    const ev = parseLog(log);
    expect(ev).not.toBeNull();
    if (ev === null || ev.kind !== "ProposalCreated") return;
    expect(ev.kind).toBe("ProposalCreated");
    expect(ev.proposalId).toBe(PROPOSAL_ID);
    expect(ev.proposer).toBe(PROPOSER.toLowerCase());
    expect(ev.target).toBe(TARGET.toLowerCase());
    expect(ev.constitutional).toBe(false);
    expect(ev.amendment).toBe(false);
    expect(ev.blockNumber).toBe(0x100n);
  });

  it("decodes a constitutional proposal", () => {
    const log = makeLog(
      TOPICS.ProposalCreated,
      [
        "0x" + w256(PROPOSAL_ID),
        wAddr(PROPOSER),
        wAddr(TARGET),
      ],
      "0x" + wBool(true) + wBool(false),
    );
    const ev = parseLog(log);
    expect(ev?.kind).toBe("ProposalCreated");
    if (ev?.kind !== "ProposalCreated") return;
    expect(ev.constitutional).toBe(true);
    expect(ev.amendment).toBe(false);
  });

  it("decodes an amendment proposal", () => {
    const log = makeLog(
      TOPICS.ProposalCreated,
      [
        "0x" + w256(PROPOSAL_ID),
        wAddr(PROPOSER),
        wAddr(TARGET),
      ],
      "0x" + wBool(false) + wBool(true),
    );
    const ev = parseLog(log);
    expect(ev?.kind).toBe("ProposalCreated");
    if (ev?.kind !== "ProposalCreated") return;
    expect(ev.constitutional).toBe(false);
    expect(ev.amendment).toBe(true);
  });
});

// ── VoteCast ─────────────────────────────────────────────────────────────────

describe("parseLog — VoteCast", () => {
  const VOTER       = "0xabcdef1234567890abcdef1234567890abcdef12";
  const PROPOSAL_ID = 99n;

  it("decodes a FOR vote", () => {
    const weight = 5_000_000n * 10n ** 18n; // 5M tokens
    const log = makeLog(
      TOPICS.VoteCast,
      [
        "0x" + w256(PROPOSAL_ID),
        wAddr(VOTER),
      ],
      "0x" + wBool(true) + w256(weight),
    );
    const ev = parseLog(log);
    expect(ev?.kind).toBe("VoteCast");
    if (ev?.kind !== "VoteCast") return;
    expect(ev.proposalId).toBe(PROPOSAL_ID);
    expect(ev.voter).toBe(VOTER.toLowerCase());
    expect(ev.support).toBe(true);
    expect(ev.weight).toBe(weight);
  });

  it("decodes an AGAINST vote with zero weight", () => {
    const log = makeLog(
      TOPICS.VoteCast,
      [
        "0x" + w256(PROPOSAL_ID),
        wAddr(VOTER),
      ],
      "0x" + wBool(false) + w256(0),
    );
    const ev = parseLog(log);
    expect(ev?.kind).toBe("VoteCast");
    if (ev?.kind !== "VoteCast") return;
    expect(ev.support).toBe(false);
    expect(ev.weight).toBe(0n);
  });
});

// ── Queued ────────────────────────────────────────────────────────────────────

describe("parseLog — Queued", () => {
  it("decodes a queued proposal", () => {
    const PROPOSAL_ID  = 7n;
    const QUEUE_ID     = 1n;
    const ETA          = BigInt(Math.floor(Date.now() / 1000) + 86_400 * 2); // +48h
    const DELAY_SECS   = 172_800n; // 48h

    const log = makeLog(
      TOPICS.Queued,
      [
        "0x" + w256(PROPOSAL_ID),
        "0x" + w256(QUEUE_ID),
      ],
      "0x" + w256(ETA) + w256(DELAY_SECS),
    );
    const ev = parseLog(log);
    expect(ev?.kind).toBe("Queued");
    if (ev?.kind !== "Queued") return;
    expect(ev.proposalId).toBe(PROPOSAL_ID);
    expect(ev.queueId).toBe(QUEUE_ID);
    expect(ev.eta).toBe(ETA);
    expect(ev.delaySeconds).toBe(DELAY_SECS);
  });
});

// ── Executed ──────────────────────────────────────────────────────────────────

describe("parseLog — Executed", () => {
  it("decodes an executed proposal", () => {
    const PROPOSAL_ID = 7n;
    const QUEUE_ID    = 1n;

    const log = makeLog(
      TOPICS.Executed,
      [
        "0x" + w256(PROPOSAL_ID),
        "0x" + w256(QUEUE_ID),
      ],
      "0x",
      "0x200",
      "0xcafebabe",
    );
    const ev = parseLog(log);
    expect(ev?.kind).toBe("Executed");
    if (ev?.kind !== "Executed") return;
    expect(ev.proposalId).toBe(PROPOSAL_ID);
    expect(ev.queueId).toBe(QUEUE_ID);
    expect(ev.blockNumber).toBe(0x200n);
    expect(ev.txHash).toBe("0xcafebabe");
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("parseLog — edge cases", () => {
  it("returns null for an unknown topic0", () => {
    const log = makeLog(
      "0x" + "ab".repeat(32),
      [],
      "0x",
    );
    expect(parseLog(log)).toBeNull();
  });

  it("returns null when topics array is empty", () => {
    const log: RawLog = {
      address:         "0x1234",
      topics:          [],
      data:            "0x",
      blockNumber:     "0x1",
      transactionHash: "0xaabbcc",
      logIndex:        "0x0",
    };
    expect(parseLog(log)).toBeNull();
  });

  it("decodes proposalId = 0 correctly", () => {
    const log = makeLog(
      TOPICS.Executed,
      [
        "0x" + w256(0),
        "0x" + w256(0),
      ],
      "0x",
    );
    const ev = parseLog(log);
    expect(ev?.kind).toBe("Executed");
    if (ev?.kind !== "Executed") return;
    expect(ev.proposalId).toBe(0n);
    expect(ev.queueId).toBe(0n);
  });
});
