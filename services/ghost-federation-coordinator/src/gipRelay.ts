/**
 * Ghost Interchain Protocol (GIP) Relay
 * Routes GipMessages between region coordinators.
 */
import { fetch } from "undici";
import {
  type FederationRegion,
  type GipMessage,
  FEDERATION_REGIONS,
} from "ghost-federation-sdk";

const RELAY_TIMEOUT_MS = 8_000;
const GIP_HISTORY_MAX = 500;

// Peer coordinator URLs — override per region via env vars
function peerUrl(region: FederationRegion): string | undefined {
  const envKey = `GIP_PEER_${region.toUpperCase()}`;
  return process.env[envKey]; // e.g. GIP_PEER_EU=http://fed-eu:7980
}

interface RelayRecord {
  message: GipMessage<unknown>;
  relayedAt: number;
  success: boolean;
  error?: string;
}

class GipRelay {
  private history: RelayRecord[] = [];

  async relay(msg: GipMessage<unknown>): Promise<{ ok: boolean; sent: FederationRegion[] }> {
    // TTL check
    if (Date.now() - msg.timestamp > msg.ttlMs) {
      return { ok: false, sent: [] };
    }

    const targets: FederationRegion[] =
      msg.targetRegion ? [msg.targetRegion] : [...FEDERATION_REGIONS].filter((r) => r !== msg.sourceRegion);

    const sent: FederationRegion[] = [];

    await Promise.allSettled(
      targets.map(async (region) => {
        const url = peerUrl(region);
        if (!url) return; // no peer configured for this region (same-process or no peer)

        try {
          const res = await fetch(`${url}/gip/ingest`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(msg),
            signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
          });
          const ok = res.ok;
          this.recordHistory(msg, ok, region, ok ? undefined : `HTTP ${res.status}`);
          if (ok) sent.push(region);
        } catch (err) {
          this.recordHistory(msg, false, region, String(err));
        }
      })
    );

    return { ok: sent.length > 0 || targets.length === 0, sent };
  }

  ingest(msg: GipMessage<unknown>): void {
    // Messages ingested from peer coordinators — record receipt
    this.recordHistory(msg, true, msg.sourceRegion, undefined);
  }

  getHistory(limit = 100): RelayRecord[] {
    return this.history.slice(-limit);
  }

  private recordHistory(
    message: GipMessage<unknown>,
    success: boolean,
    _region: FederationRegion,
    error?: string
  ): void {
    this.history.push({ message, relayedAt: Date.now(), success, error });
    if (this.history.length > GIP_HISTORY_MAX) {
      this.history.splice(0, this.history.length - GIP_HISTORY_MAX);
    }
  }
}

export const gipRelay = new GipRelay();
