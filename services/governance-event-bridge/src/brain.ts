/**
 * governance-event-bridge — ghostbrain-core Signal Poster
 *
 * Posts governance events to ghostbrain-core's /api/v1/signals endpoint
 * using the same HMAC-SHA256 authentication scheme as ghostbrain-gsa.
 *
 * Auth algorithm (mirrors ghostbrain-core/src/middleware/hmac.ts):
 *   HMAC-SHA256 of "${timestamp}:${rawBody}" keyed by CONTROL_PLANE_HMAC_SECRET
 *   Header: X-HMAC-Timestamp  (Unix ms string)
 *   Header: X-HMAC-Signature  (hex string)
 */

import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { GovernanceEvent } from "./events.js";

// ── BrainMessage envelope ────────────────────────────────────────────────────

interface BrainMessage {
  messageId:     string;
  subject:       string;
  correlationId: string;
  senderAgentId: "governance-event-bridge";
  payload:       unknown;
  sentAt:        string;
}

// ── Subject mapping ───────────────────────────────────────────────────────────

function subjectFor(event: GovernanceEvent): string {
  switch (event.kind) {
    case "ProposalCreated": return "governance.proposal.created";
    case "VoteCast":        return "governance.vote.cast";
    case "Queued":          return "governance.proposal.queued";
    case "Executed":        return "governance.proposal.executed";
  }
}

// ── Serialization (bigint → string to keep JSON clean) ────────────────────────

function eventToPayload(event: GovernanceEvent, layer: string, chainId: number): unknown {
  // JSON.stringify can't handle bigint natively, so convert
  const base = { layer, chainId };
  switch (event.kind) {
    case "ProposalCreated":
      return {
        ...base,
        proposalId:     event.proposalId.toString(),
        proposer:       event.proposer,
        target:         event.target,
        constitutional: event.constitutional,
        amendment:      event.amendment,
        blockNumber:    event.blockNumber.toString(),
        txHash:         event.txHash,
      };
    case "VoteCast":
      return {
        ...base,
        proposalId:  event.proposalId.toString(),
        voter:       event.voter,
        support:     event.support,
        weight:      event.weight.toString(),
        blockNumber: event.blockNumber.toString(),
        txHash:      event.txHash,
      };
    case "Queued":
      return {
        ...base,
        proposalId:   event.proposalId.toString(),
        queueId:      event.queueId.toString(),
        eta:          event.eta.toString(),
        delaySeconds: event.delaySeconds.toString(),
        blockNumber:  event.blockNumber.toString(),
        txHash:       event.txHash,
      };
    case "Executed":
      return {
        ...base,
        proposalId:  event.proposalId.toString(),
        queueId:     event.queueId.toString(),
        blockNumber: event.blockNumber.toString(),
        txHash:      event.txHash,
      };
  }
}

// ── HMAC signing ──────────────────────────────────────────────────────────────

function signBody(body: string, secret: string, ts: number): string {
  if (!secret) return "";
  return createHmac("sha256", secret)
    .update(`${ts}:${body}`)
    .digest("hex");
}

// ── Signal poster ─────────────────────────────────────────────────────────────

export interface BrainPosterOptions {
  ghostbrainUrl:   string;
  hmacSecret:      string;
  timeoutMs?:      number;
}

export class BrainPoster {
  private readonly url: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(opts: BrainPosterOptions) {
    this.url       = opts.ghostbrainUrl.replace(/\/$/, "") + "/api/v1/signals";
    this.secret    = opts.hmacSecret;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async post(event: GovernanceEvent, layer: string, chainId: number): Promise<void> {
    const message: BrainMessage = {
      messageId:     randomUUID(),
      subject:       subjectFor(event),
      correlationId: `proposal-${event.proposalId.toString()}-${chainId}`,
      senderAgentId: "governance-event-bridge",
      payload:       eventToPayload(event, layer, chainId),
      sentAt:        new Date().toISOString(),
    };

    const body = JSON.stringify(message);
    const ts   = Date.now();
    const sig  = signBody(body, this.secret, ts);

    const headers: Record<string, string> = {
      "content-type":     "application/json",
      "x-agent-id":       "governance-event-bridge",
      "x-hmac-timestamp": String(ts),
      "x-hmac-signature": sig,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.url, {
        method:  "POST",
        headers,
        body,
        signal:  controller.signal,
      });

      if (!res.ok) {
        throw new Error(`ghostbrain-core returned HTTP ${res.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Convenience: post an array of events in series.
   * Continues on individual failures.
   */
  async postAll(
    events:  GovernanceEvent[],
    layer:   string,
    chainId: number,
    log:     (msg: string) => void,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await this.post(event, layer, chainId);
        sent++;
      } catch (err) {
        failed++;
        log(`[brain] failed to post ${event.kind} proposal=${event.proposalId}: ${String(err)}`);
      }
    }

    return { sent, failed };
  }
}
