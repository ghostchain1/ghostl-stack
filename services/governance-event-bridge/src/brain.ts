/**
 * brain.ts
 *
 * HTTP client that publishes governance events to ghostbrain-core /signals.
 */

import pino from "pino";
import { config } from "./config.js";

const log = pino({ name: "governance-event-bridge/brain" });

export interface GovernanceEvent {
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  args: Record<string, unknown>;
}

interface SignalPayload {
  source: string;
  type: string;
  payload: Record<string, unknown>;
}

async function postSignal(body: SignalPayload): Promise<void> {
  const url = `${config.ghostbrainCoreUrl}/signals`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ghostbrainTimeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      log.warn({ status: res.status, text }, "ghostbrain-core rejected signal");
    } else {
      const json = (await res.json()) as { id?: string };
      log.debug({ signalId: json.id, type: body.type }, "signal accepted by ghostbrain-core");
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      log.error({ url }, "ghostbrain-core request timed out");
    } else {
      log.error({ err }, "failed to post signal to ghostbrain-core");
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publish a governance contract event to ghostbrain-core.
 */
export async function publishGovernanceEvent(event: GovernanceEvent): Promise<void> {
  log.info(
    { eventName: event.eventName, blockNumber: event.blockNumber, txHash: event.transactionHash },
    "publishing governance event to GhostBrain",
  );

  await postSignal({
    source: "governance-event-bridge",
    type: event.eventName,
    payload: {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      ...event.args,
    },
  });
}
