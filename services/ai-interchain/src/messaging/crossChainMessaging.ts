/**
 * crossChainMessaging.ts — Interchain messaging relay engine
 *
 * Tracks cross-chain messages dispatched from GhostChain to external
 * networks for governance votes, liquidity signals, and DeFi triggers.
 * Compatible with IBC, LayerZero, Wormhole, and CCIP message formats.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageProtocol = "ibc" | "layerzero" | "wormhole" | "ccip" | "axelar" | "ghost-native";
export type MessageStatus   = "queued" | "relaying" | "delivered" | "failed" | "timeout";
export type MessageType     = "governance" | "liquidity" | "asset-mint" | "asset-burn" | "oracle" | "custom";

export interface CrossChainMessage {
  id:            string;
  source:        string;        // "GhostChain"
  destination:   string;        // Target chain name
  protocol:      MessageProtocol;
  type:          MessageType;
  status:        MessageStatus;
  timestamp:     number;
  deliveredAt:   number | null;
  timeoutAt:     number;

  // Payload (JSON-serialisable)
  payload:       Record<string, unknown>;

  // Routing
  sourceChannel: string;
  destChannel:   string;
  nonce:         number;

  // Gas / cost
  gasPaid_USD:   number;
  relayerFee_USD: number;

  // Metadata
  retries:       number;
  maxRetries:    number;
  errorMsg:      string | null;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const messages: CrossChainMessage[] = [];
let nonceCounter = 1000;

const PROTOCOL_FOR_CHAIN: Record<string, MessageProtocol> = {
  "Ethereum":    "layerzero",
  "Polygon":     "layerzero",
  "BNB Chain":   "layerzero",
  "Avalanche":   "layerzero",
  "Arbitrum":    "ccip",
  "Optimism":    "ccip",
  "Base":        "ccip",
  "Cosmos (Hub)":"ibc",
  "Solana":      "wormhole",
  "Near Protocol":"axelar",
};

// ── Seed recent messages ──────────────────────────────────────────────────────

export function seedMessages(): void {
  if (messages.length > 0) { logger.info("[CrossChainMsg] Already seeded — skipping"); return; }

  const now = Date.now();
  const chains = ["Ethereum", "Polygon", "Cosmos (Hub)", "Ethereum", "Polygon", "Cosmos (Hub)", "Ethereum", "Solana"];
  const types: MessageType[] = ["governance", "liquidity", "asset-mint", "oracle", "governance", "liquidity", "asset-burn", "oracle"];

  for (let i = 0; i < chains.length; i++) {
    const chain  = chains[i]!;
    const mtype  = types[i]!;
    const proto  = PROTOCOL_FOR_CHAIN[chain] ?? "ghost-native";
    const ago    = (i + 1) * 3600 * 1000; // spread over last 8h
    const delivered = now - ago + 30_000;

    messages.push({
      id:            uuidv4(),
      source:        "GhostChain",
      destination:   chain,
      protocol:      proto,
      type:          mtype,
      status:        "delivered",
      timestamp:     now - ago,
      deliveredAt:   delivered,
      timeoutAt:     now - ago + 3600_000,
      payload:       buildPayload(mtype, chain),
      sourceChannel: `ghost-${proto}-out-1`,
      destChannel:   `${chain.toLowerCase().replace(/\s/g, "-")}-in-1`,
      nonce:         nonceCounter++,
      gasPaid_USD:   parseFloat((0.5 + Math.random() * 4).toFixed(3)),
      relayerFee_USD: parseFloat((0.1 + Math.random() * 0.8).toFixed(3)),
      retries:       0,
      maxRetries:    3,
      errorMsg:      null,
    });
  }

  logger.info(`[CrossChainMsg] Seeded ${messages.length} historical messages`);
}

function buildPayload(type: MessageType, chain: string): Record<string, unknown> {
  switch (type) {
    case "governance": return { action: "vote-signal", proposalId: uuidv4(), support: true, weight: 1_000_000 };
    case "liquidity":  return { action: "rebalance", pool: `GST/USDC@${chain}`, targetTVL: 500_000 };
    case "asset-mint": return { action: "mint-wGST", amount: Math.floor(Math.random() * 500_000 + 10_000), recipient: `0x${uuidv4().replace(/-/g,"").slice(0,40)}` };
    case "asset-burn": return { action: "burn-wGST", amount: Math.floor(Math.random() * 100_000 + 1_000) };
    case "oracle":     return { action: "price-update", pair: "GST/USD", price: 0.0245, timestamp: Date.now() };
    default:           return { raw: `custom-${uuidv4().slice(0,8)}` };
  }
}

// ── Send a message ────────────────────────────────────────────────────────────

export function sendMessage(destination: string, type: MessageType, payload?: Record<string, unknown>): CrossChainMessage {
  const protocol   = PROTOCOL_FOR_CHAIN[destination] ?? "ghost-native";
  const now        = Date.now();
  const message: CrossChainMessage = {
    id:            uuidv4(),
    source:        "GhostChain",
    destination,
    protocol,
    type,
    status:        "queued",
    timestamp:     now,
    deliveredAt:   null,
    timeoutAt:     now + 3_600_000, // 1 hour timeout
    payload:       payload ?? buildPayload(type, destination),
    sourceChannel: `ghost-${protocol}-out-1`,
    destChannel:   `${destination.toLowerCase().replace(/\s/g, "-")}-in-1`,
    nonce:         nonceCounter++,
    gasPaid_USD:   parseFloat((0.5 + Math.random() * 4).toFixed(3)),
    relayerFee_USD: parseFloat((0.1 + Math.random() * 0.8).toFixed(3)),
    retries:       0,
    maxRetries:    3,
    errorMsg:      null,
  };

  messages.push(message);
  logger.info(`[CrossChainMsg] Queued ${type} → ${destination} (${protocol}, nonce=${message.nonce})`);

  // Simulate async delivery
  setTimeout(() => {
    message.status      = "relaying";
    setTimeout(() => {
      if (Math.random() < 0.97) {
        message.status      = "delivered";
        message.deliveredAt = Date.now();
        logger.info(`[CrossChainMsg] Delivered ${type} → ${destination} (id=${message.id.slice(0,8)})`);
      } else {
        message.status   = "failed";
        message.errorMsg = "Relayer timeout";
        logger.warn(`[CrossChainMsg] Failed ${type} → ${destination}`);
      }
    }, 5_000 + Math.random() * 10_000);
  }, 500);

  return message;
}

// ── Tick: process queued messages & expire timeouts ───────────────────────────

export function tickMessaging(): void {
  const now = Date.now();
  for (const m of messages) {
    if (m.status === "queued" && now > m.timeoutAt) {
      m.status   = "timeout";
      m.errorMsg = "Message timed out before relay confirmation";
    }
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getMessages(opts?: { destination?: string; status?: MessageStatus; type?: MessageType; limit?: number }): CrossChainMessage[] {
  let results = [...messages];
  if (opts?.destination) results = results.filter((m) => m.destination === opts.destination);
  if (opts?.status)      results = results.filter((m) => m.status      === opts.status);
  if (opts?.type)        results = results.filter((m) => m.type        === opts.type);
  results.sort((a, b) => b.timestamp - a.timestamp);
  return opts?.limit ? results.slice(0, opts.limit) : results;
}

export function getMessageById(id: string): CrossChainMessage | undefined {
  return messages.find((m) => m.id === id);
}

export function getMessagingStats() {
  return {
    total:      messages.length,
    delivered:  messages.filter((m) => m.status === "delivered").length,
    queued:     messages.filter((m) => m.status === "queued").length,
    relaying:   messages.filter((m) => m.status === "relaying").length,
    failed:     messages.filter((m) => m.status === "failed" || m.status === "timeout").length,
    totalGasPaid_USD:    parseFloat(messages.reduce((s, m) => s + m.gasPaid_USD, 0).toFixed(2)),
    totalRelayerFee_USD: parseFloat(messages.reduce((s, m) => s + m.relayerFee_USD, 0).toFixed(2)),
    successRate: messages.length > 0
      ? parseFloat((messages.filter((m) => m.status === "delivered").length / messages.length).toFixed(3))
      : 1,
    byProtocol: messages.reduce<Record<string, number>>((acc, m) => {
      acc[m.protocol] = (acc[m.protocol] ?? 0) + 1; return acc;
    }, {}),
    byType: messages.reduce<Record<string, number>>((acc, m) => {
      acc[m.type] = (acc[m.type] ?? 0) + 1; return acc;
    }, {}),
  };
}
