/**
 * memoryStore.ts — Long-term AI memory across all GhostStack engines
 *
 * Stores ecosystem events in a capped in-memory ring buffer (10,000 records).
 * Every engine feeds events here: campaigns, scaling, threats, validator changes,
 * treasury transactions, and more.  The data aggregator and learning engine
 * consume this store to surface trends and improve AI decisions.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";

export type MemoryCategory =
  | "marketing"
  | "growth"
  | "adoption"
  | "expansion"
  | "economy"
  | "infrastructure"
  | "security"
  | "validator"
  | "governance"
  | "general";

export type MemoryImportance = "low" | "medium" | "high" | "critical";

export interface MemoryEvent {
  id:          string;
  timestamp:   number;
  category:    MemoryCategory;
  importance:  MemoryImportance;
  source:      string;           // which engine/module generated this
  event:       string;           // human-readable summary
  data:        Record<string, unknown>;
  outcome?:    "positive" | "negative" | "neutral" | "unknown";
  tags:        string[];
}

export interface MemoryStats {
  total:     number;
  byCategory: Record<MemoryCategory, number>;
  byImportance: Record<MemoryImportance, number>;
  oldestTs:  number | null;
  newestTs:  number | null;
}

// ── Ring buffer ───────────────────────────────────────────────────────────────

const MAX_MEMORIES = Number(process.env.GIE_MAX_MEMORIES ?? 10_000);
const memories: MemoryEvent[] = [];

// ── Store ─────────────────────────────────────────────────────────────────────

export function storeMemory(
  category:   MemoryCategory,
  event:      string,
  data:       Record<string, unknown> = {},
  opts: {
    source?:     string;
    importance?: MemoryImportance;
    outcome?:    MemoryEvent["outcome"];
    tags?:       string[];
  } = {}
): MemoryEvent {
  const record: MemoryEvent = {
    id:         uuidv4(),
    timestamp:  Date.now(),
    category,
    importance: opts.importance ?? "medium",
    source:     opts.source    ?? "gie",
    event,
    data,
    outcome:    opts.outcome,
    tags:       opts.tags ?? [],
  };

  memories.unshift(record);
  if (memories.length > MAX_MEMORIES) memories.splice(MAX_MEMORIES);

  if (record.importance === "critical" || record.importance === "high") {
    logger.info(`[Memory] [${record.category}] ${record.event}`, { importance: record.importance, source: record.source });
  }

  return record;
}

// ── Retrieve ──────────────────────────────────────────────────────────────────

export function getMemories(opts: {
  category?:   MemoryCategory;
  importance?: MemoryImportance;
  source?:     string;
  since?:      number;
  limit?:      number;
  tag?:        string;
} = {}): MemoryEvent[] {
  let result = memories;

  if (opts.category)   result = result.filter((m) => m.category   === opts.category);
  if (opts.importance) result = result.filter((m) => m.importance  === opts.importance);
  if (opts.source)     result = result.filter((m) => m.source      === opts.source);
  if (opts.since)      result = result.filter((m) => m.timestamp   >= opts.since!);
  if (opts.tag)        result = result.filter((m) => m.tags.includes(opts.tag!));

  return result.slice(0, opts.limit ?? 100);
}

export function getMemoryById(id: string): MemoryEvent | undefined {
  return memories.find((m) => m.id === id);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getMemoryStats(): MemoryStats {
  const byCategory = {} as Record<MemoryCategory, number>;
  const byImportance = {} as Record<MemoryImportance, number>;

  for (const m of memories) {
    byCategory[m.category]   = (byCategory[m.category]   ?? 0) + 1;
    byImportance[m.importance] = (byImportance[m.importance] ?? 0) + 1;
  }

  return {
    total:        memories.length,
    byCategory,
    byImportance,
    oldestTs:     memories.length > 0 ? memories[memories.length - 1].timestamp : null,
    newestTs:     memories.length > 0 ? memories[0].timestamp : null,
  };
}

// ── Seed synthetic memories on startup ────────────────────────────────────────

export function seedInitialMemories(): void {
  const seeds: Array<[MemoryCategory, string, Record<string, unknown>, MemoryImportance]> = [
    ["marketing",      "Initial campaign cycle completed",               { impressions: 12500, clicks: 840, conversions: 62 }, "medium"],
    ["growth",         "Viral airdrop round executed",                   { recipients: 3200, tokensDistributed: 160000 },         "high"],
    ["adoption",       "Developer outreach wave completed",              { contacted: 95, responded: 18, onboarded: 4 },          "medium"],
    ["expansion",      "Exchange listing application submitted",         { exchange: "KuCoin", estimatedListing: "60d" },          "high"],
    ["economy",        "Liquidity pool rebalanced",                      { poolId: "GST-USDC", tvlBefore: 1200000, tvlAfter: 1450000 }, "medium"],
    ["infrastructure", "Auto-repair cycle resolved service restart",     { service: "uo", downtime: "8s" },                       "high"],
    ["security",       "DDoS mitigation applied to 3 IPs",              { blocked: 3, source: "ase" },                            "critical"],
    ["validator",      "Validator slashing event detected",             { validator: "v-042", missedBlocks: 18 },                 "critical"],
    ["economy",        "Token burn event: 50,000 GST burned",           { amount: 50000, trigger: "fee-accumulation" },           "high"],
    ["governance",     "Snapshot proposal created for fee structure",   { proposalId: "GIP-012", votes: 0 },                      "medium"],
  ];

  const now = Date.now();
  seeds.forEach(([cat, evt, data, imp], i) => {
    memories.push({
      id:         uuidv4(),
      timestamp:  now - (i + 1) * 3_600_000,  // stagger by 1h each
      category:   cat,
      importance: imp,
      source:     "seed",
      event:      evt,
      data,
      outcome:    "positive",
      tags:       [cat, "seed"],
    });
  });

  logger.info(`[Memory] Seeded ${seeds.length} initial memory records`);
}
