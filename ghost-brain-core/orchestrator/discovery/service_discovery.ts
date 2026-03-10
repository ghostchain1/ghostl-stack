/**
 * GhostBrain Global Orchestrator — Service Discovery
 *
 * Polls the Supervisor API and registered node admin endpoints to build
 * a live inventory of running services.  Discovered services are written
 * into the NodeRegistry so the rest of the orchestrator can route to them.
 *
 * Service discovery runs on a configurable interval and does NOT alter
 * any configuration file or restart any process — it is read-only.
 *
 * SECURITY: fetch() with AbortController timeout; SAFE_HOST_RE validation
 * on all discovered hostnames before registration.
 */

import type { GhostNode, NodeRole, ChainId } from "../types.js";
import type { NodeRegistry }                  from "./node_registry.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPERVISOR_URL = (
  process.env["SUPERVISOR_API_URL"] ?? "http://localhost:9100"
).replace(/\/$/, "");

const DISCOVERY_TIMEOUT_MS = parseInt(
  process.env["ORCHESTRATOR_DISCOVERY_TIMEOUT_MS"] ?? "5000", 10,
);

const DISCOVERY_INTERVAL_MS = parseInt(
  process.env["ORCHESTRATOR_DISCOVERY_INTERVAL_MS"] ?? "30000", 10,
);

/** Only hosts matching this are accepted during discovery. */
const SAFE_HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,253}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawServiceEntry {
  id?:       string;
  role?:     string;
  host?:     string;
  port?:     number;
  region?:   string;
  chain_id?: number;
  load_pct?: number;
}

// ---------------------------------------------------------------------------
// ServiceDiscovery
// ---------------------------------------------------------------------------

export class ServiceDiscovery {
  private intervalRef?: ReturnType<typeof setInterval>;
  private running       = false;

  constructor(
    private readonly registry: NodeRegistry,
    private readonly regions:  string[],
  ) {}

  /** Start periodic service discovery. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalRef = setInterval(
      () => this.discover().catch(e => console.error("[discovery]", e)),
      DISCOVERY_INTERVAL_MS,
    );
    // Run immediately on start.
    this.discover().catch(e => console.error("[discovery] initial run:", e));
  }

  stop(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
    this.running = false;
  }

  /** Single discovery pass — queries supervisor /services endpoint. */
  async discover(): Promise<void> {
    const raw = await this.fetchServices();
    for (const entry of raw) {
      const node = this.parseEntry(entry);
      if (!node) continue;

      if (this.registry.get(node.id)) {
        this.registry.update(node);
      } else {
        try {
          this.registry.register(node);
        } catch {
          // Invalid entry (bad host, slug, etc.) — skip silently.
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async fetchServices(): Promise<RawServiceEntry[]> {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), DISCOVERY_TIMEOUT_MS);

    try {
      const res = await fetch(`${SUPERVISOR_URL}/services`, {
        signal:  ctl.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(tid);
      if (!res.ok) return [];
      const body = await res.json();
      return Array.isArray(body) ? (body as RawServiceEntry[]) : [];
    } catch {
      clearTimeout(tid);
      return [];
    }
  }

  private parseEntry(raw: RawServiceEntry): GhostNode | null {
    if (
      typeof raw.id     !== "string" ||
      typeof raw.host   !== "string" ||
      typeof raw.port   !== "number" ||
      typeof raw.region !== "string" ||
      typeof raw.role   !== "string"
    ) return null;

    if (!SAFE_HOST_RE.test(raw.host)) return null;

    const role = raw.role as NodeRole;
    const validRoles: NodeRole[] = [
      "l1", "l2", "l3", "sequencer", "batcher",
      "validator", "ai_compute", "rpc_proxy",
    ];
    if (!validRoles.includes(role)) return null;

    // Only accept our canonical chain IDs.
    const validChainIds: ChainId[] = [14000101, 901, 903];
    const chainId = raw.chain_id !== undefined &&
      validChainIds.includes(raw.chain_id as ChainId)
        ? (raw.chain_id as ChainId)
        : undefined;

    return {
      id:          raw.id,
      role,
      region:      raw.region,
      host:        raw.host,
      rpcPort:     raw.port,
      chainId,
      status:      "unknown",
      loadPct:     typeof raw.load_pct === "number" ? raw.load_pct : 0,
      latencyMs:   0,
      lastSeenAt:  Date.now(),
    };
  }
}
