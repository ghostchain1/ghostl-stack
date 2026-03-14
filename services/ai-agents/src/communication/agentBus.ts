/**
 * GAAN — Agent Communication Bus
 * Async message-passing layer between all agents.
 * Messages can be direct (agent→agent) or broadcast (agent→all).
 * Supports types: info | alert | command | response | broadcast
 */

import { v4 as uuid } from "uuid";
import logger from "../utils/logger";

export type MessageType = "info" | "alert" | "command" | "response" | "broadcast";

export interface AgentMessage {
  id:           string;
  from:         string;        // agent-id or "coordinator" or "system"
  to:           string;        // agent-id or "all"
  type:         MessageType;
  subject:      string;
  content:      string;
  timestamp:    number;
  acknowledged: boolean;
  replyTo?:     string;        // id of message being replied to
}

// ── In-memory store ───────────────────────────────────────────────────────────

const messages: AgentMessage[] = [];
const MAX_MESSAGES = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

const minsAgo = (m: number): number => Date.now() - m * 60_000;

// ── Seed ──────────────────────────────────────────────────────────────────────

export function seedMessages(): void {
  const SEED: AgentMessage[] = [
    {
      id: uuid(), from: "marketing-agent",      to: "growth-agent",
      type: "info",
      subject: "Campaign traffic surge",
      content: "GhostL2 awareness campaign driving 3.4× baseline traffic. Recommend increasing developer grant budget to capitalise on intent signal.",
      timestamp: minsAgo(28), acknowledged: true,
    },
    {
      id: uuid(), from: "growth-agent",           to: "infrastructure-agent",
      type: "command",
      subject: "Prepare for user onboarding spike",
      content: "Approx 2,000 new wallet registrations expected in next 6h from marketing push. Please ensure RPC capacity is sufficient.",
      timestamp: minsAgo(26), acknowledged: true,
    },
    {
      id: uuid(), from: "infrastructure-agent",   to: "growth-agent",
      type: "response",
      subject: "RPC capacity confirmed",
      content: "Scaled RPC cluster to handle 5,000 req/s. Load balancer ready. Fire when ready.",
      timestamp: minsAgo(24), acknowledged: true,
    },
    {
      id: uuid(), from: "security-agent",          to: "all",
      type: "broadcast",
      subject: "⚠️ Elevated threat level",
      content: "Detected coordinated bot activity targeting token contract. All agents: verify external calls, apply extra validation. Security team on alert.",
      timestamp: minsAgo(90), acknowledged: true,
    },
    {
      id: uuid(), from: "economy-agent",            to: "governance-agent",
      type: "info",
      subject: "Token burn complete — proposal update needed",
      content: "340K GST burn executed. Treasury balance updated. Recommend updating GIP-047 impact analysis with fresh burn data before vote closes.",
      timestamp: minsAgo(18), acknowledged: true,
    },
    {
      id: uuid(), from: "governance-agent",         to: "economy-agent",
      type: "response",
      subject: "GIP-047 analysis updated",
      content: "GIP-047 impact analysis refreshed with burn data. New projection: +8.3% staker APY. Vote window closes in 54h.",
      timestamp: minsAgo(14), acknowledged: true,
    },
    {
      id: uuid(), from: "interchain-agent",         to: "infrastructure-agent",
      type: "command",
      subject: "Provision bridge relay nodes",
      content: "Arbitrum bridge deployment initiated. Need 2 dedicated relay nodes provisioned. Expected traffic: 50 msg/min at launch.",
      timestamp: minsAgo(88), acknowledged: true,
    },
    {
      id: uuid(), from: "infrastructure-agent",    to: "interchain-agent",
      type: "response",
      subject: "Relay nodes provisioned",
      content: "2 relay nodes (relay-arb-01, relay-arb-02) are live and synced. Endpoints: relay-arb-01:8545, relay-arb-02:8545.",
      timestamp: minsAgo(85), acknowledged: true,
    },
    {
      id: uuid(), from: "coordinator",              to: "all",
      type: "broadcast",
      subject: "🤖 Coordination cycle complete",
      content: "Cycle #92 complete. Tasks assigned: 4. Tasks completed: 3. Network health: 91/100. All agents operating in autonomous mode.",
      timestamp: minsAgo(5), acknowledged: false,
    },
    {
      id: uuid(), from: "security-agent",           to: "interchain-agent",
      type: "alert",
      subject: "Base bridge anomaly — pause recommended",
      content: "Anomalous withdraw pattern detected on Base bridge: 14 large withdraws in 80s. Recommend pause for audit. Bridge funds are safe.",
      timestamp: minsAgo(13 * 60), acknowledged: true,
    },
  ];

  messages.push(...SEED);
  logger.info(`[AgentBus] Seeded ${messages.length} messages`);
}

// ── API ───────────────────────────────────────────────────────────────────────

export function sendMessage(
  from: string,
  to: string,
  type: MessageType,
  subject: string,
  content: string,
  replyTo?: string,
): AgentMessage {
  const msg: AgentMessage = {
    id: uuid(), from, to, type, subject, content,
    timestamp: Date.now(), acknowledged: false,
    ...(replyTo ? { replyTo } : {}),
  };
  messages.unshift(msg);
  if (messages.length > MAX_MESSAGES) messages.splice(MAX_MESSAGES);
  logger.debug(`[AgentBus] ${from} → ${to}: "${subject}"`);
  return msg;
}

export function acknowledgeMessage(id: string): boolean {
  const m = messages.find(x => x.id === id);
  if (!m) return false;
  m.acknowledged = true;
  return true;
}

export interface GetMessagesOpts {
  from?:         string;
  to?:           string;
  type?:         MessageType;
  acknowledged?: boolean;
  limit?:        number;
}

export function getMessages(opts: GetMessagesOpts = {}): AgentMessage[] {
  let result = [...messages];
  if (opts.from          !== undefined) result = result.filter(m => m.from === opts.from);
  if (opts.to            !== undefined) result = result.filter(m => m.to   === opts.to || m.to === "all");
  if (opts.type          !== undefined) result = result.filter(m => m.type  === opts.type);
  if (opts.acknowledged  !== undefined) result = result.filter(m => m.acknowledged === opts.acknowledged);
  return result.slice(0, opts.limit ?? 50);
}

export function getMessageStats(): {
  total: number; unacknowledged: number; alerts: number; broadcasts: number;
  commands: number; last24h: number;
} {
  const now = Date.now();
  return {
    total:          messages.length,
    unacknowledged: messages.filter(m => !m.acknowledged).length,
    alerts:         messages.filter(m => m.type === "alert").length,
    broadcasts:     messages.filter(m => m.type === "broadcast").length,
    commands:       messages.filter(m => m.type === "command").length,
    last24h:        messages.filter(m => m.timestamp > now - 86_400_000).length,
  };
}
