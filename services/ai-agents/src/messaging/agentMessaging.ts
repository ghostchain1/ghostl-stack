/**
 * Agent Messaging — simplified facade over agentBus for inter-agent communication.
 * Provides typed, purpose-specific messaging helpers so agents don't need to
 * construct raw message objects manually.
 */

import { sendMessage, MessageType } from "../communication/agentBus";

/**
 * Send a proposal from one agent to another (or "all").
 */
export function sendProposal(from: string, to: string, subject: string, content: string): void {
  sendMessage(from, to, "command", subject, content);
}

/**
 * Send a security/operational alert.
 */
export function sendAlert(from: string, to: string, subject: string, content: string): void {
  sendMessage(from, to, "alert", subject, content);
}

/**
 * Send a coordination request (e.g., Operator → Auditor before deploy).
 */
export function sendCoordination(from: string, to: string, subject: string, content: string): void {
  sendMessage(from, to, "command", subject, content);
}

/**
 * Broadcast a message to all agents.
 */
export function broadcast(from: string, type: MessageType, subject: string, content: string): void {
  sendMessage(from, "all", type, subject, content);
}

/**
 * General-purpose send with explicit type.
 */
export function sendAgentMessage(
  from:    string,
  to:      string,
  type:    MessageType,
  subject: string,
  content: string,
): void {
  sendMessage(from, to, type, subject, content);
}
