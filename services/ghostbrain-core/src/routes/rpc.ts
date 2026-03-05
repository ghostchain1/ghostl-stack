/**
 * GhostBrain Core — RPC Decision & Metrics routes
 *
 * POST /api/v1/rpc/decide
 *   Body: { intent: RouteIntent, candidates: RpcHealth[] }
 *   Returns: AiDecision  — selected endpoint + strategy + reason
 *
 * GET  /api/v1/rpc/metrics
 *   Returns Prometheus-compatible text (Content-Type: text/plain;version=0.0.4)
 *   Gauges: ghostbrain_rpc_latency_ms, ghostbrain_rpc_error_rate,
 *           ghostbrain_rpc_head_lag, ghostbrain_rpc_circuit_open
 *
 * Auth: HMAC (via the hmacAuthPlugin registered in app.ts) or open in dev
 *       when CONTROL_PLANE_HMAC_SECRET is not set.
 */

import type { FastifyInstance } from "fastify";
import { z }                    from "zod";

// ── Shared AI scoring (same algorithm as packages/ghost-sdk HeuristicAiEngine)
// Kept local so the service is self-contained and the SDK stays a consumer.

const CIRCUIT_PENALTY = 1e9;

function score(h: {
  latencyMs:  number;
  errorRate:  number;
  headLag:    number;
  lastOkAt:   number;
  circuitOpen: boolean;
}): number {
  if (h.circuitOpen) return CIRCUIT_PENALTY;
  const recency  = Math.min(30_000, Date.now() - h.lastOkAt) / 30_000; // 0=fresh 1=stale
  return (
    h.latencyMs * 0.4 +
    h.errorRate  * 5_000 +
    h.headLag    * 2_000 +
    recency      * 3_000
  );
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const RpcHealthSchema = z.object({
  url:         z.string(),
  layer:       z.enum(["L1", "L2", "L3", "EXTERNAL"]),
  latencyMs:   z.number(),
  errorRate:   z.number().min(0).max(1),
  headLag:     z.number(),
  lastOkAt:    z.number(),
  circuitOpen: z.boolean(),
});

const RouteIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("READ"),     layer: z.enum(["L1", "L2", "L3"]) }),
  z.object({ kind: z.literal("WRITE"),    layer: z.enum(["L1", "L2", "L3"]) }),
  z.object({ kind: z.literal("UPSTREAM"), from:  z.enum(["L3", "L2"]) }),
  z.object({ kind: z.literal("EXTERNAL"), from:  z.literal("L1"), name: z.string().optional() }),
]);

const DecideBodySchema = z.object({
  intent:     RouteIntentSchema,
  candidates: z.array(RpcHealthSchema).min(1),
});

type RpcHealth  = z.infer<typeof RpcHealthSchema>;
type RouteIntent = z.infer<typeof RouteIntentSchema>;

// ── Prometheus label escaping ─────────────────────────────────────────────────

function promEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function _gauge(name: string, help: string, labels: Record<string, string>, value: number): string {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${promEscape(v)}"`)
    .join(",");
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name}{${labelStr}} ${value}`;
}

// ── In-memory snapshot store (updated on each /decide call) ──────────────────

interface RpcSnapshot {
  url:         string;
  layer:       string;
  latencyMs:   number;
  errorRate:   number;
  headLag:     number;
  circuitOpen: boolean;
}

const snapshots = new Map<string, RpcSnapshot>();

function updateSnapshots(candidates: RpcHealth[]): void {
  for (const c of candidates) {
    snapshots.set(c.url, {
      url:         c.url,
      layer:       c.layer,
      latencyMs:   c.latencyMs,
      errorRate:   c.errorRate,
      headLag:     c.headLag,
      circuitOpen: c.circuitOpen,
    });
  }
}

// ── Route handler helpers ─────────────────────────────────────────────────────

function decide(intent: RouteIntent, candidates: RpcHealth[]) {
  const open   = candidates.filter(c => !c.circuitOpen);
  const pool   = open.length > 0 ? open : candidates; // fall through if all open

  const sorted = [...pool].sort((a, b) => score(a) - score(b));
  const best   = sorted[0];

  // WRITE → safest (lowest error-rate)
  if (intent.kind === "WRITE") {
    const safest = [...pool].sort((a, b) => a.errorRate - b.errorRate)[0];
    return {
      chosenUrl: safest.url,
      reason:    "write: safest endpoint by error-rate",
      strategy:  "SAFEST" as const,
    };
  }

  // EXTERNAL or UPSTREAM → fastest
  if (intent.kind === "EXTERNAL" || intent.kind === "UPSTREAM") {
    return {
      chosenUrl: best.url,
      reason:    `${intent.kind.toLowerCase()}: fastest available`,
      strategy:  "FASTEST" as const,
    };
  }

  // READ: quorum if all risky (errorRate > 0.3 or headLag > 3) and ≥ 2 available
  const risky = pool.every(c => c.errorRate > 0.3 || c.headLag > 3);
  if (risky && pool.length >= 2) {
    return {
      chosenUrl:   best.url,
      reason:      "read: quorum (all endpoints degraded)",
      strategy:    "QUORUM" as const,
      quorumUrls:  sorted.slice(0, Math.min(3, sorted.length)).map(c => c.url),
    };
  }

  return {
    chosenUrl: best.url,
    reason:    "read: fastest healthy endpoint",
    strategy:  "FASTEST" as const,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function rpcRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/rpc/decide
   * AI endpoint selection (GhostBrain-hosted scoring).
   */
  app.post("/api/v1/rpc/decide", async (req, reply) => {
    const parsed = DecideBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", detail: parsed.error.flatten() });
    }

    const { intent, candidates } = parsed.data;
    updateSnapshots(candidates);

    const decision = decide(intent, candidates);
    return reply.status(200).send(decision);
  });

  /**
   * GET /api/v1/rpc/metrics
   * Prometheus text exposition.
   */
  app.get("/api/v1/rpc/metrics", async (_req, reply) => {
    const lines: string[] = [];
    const snap = [...snapshots.values()];

    if (snap.length === 0) {
      reply.header("content-type", "text/plain;version=0.0.4");
      return reply.send("# no rpc snapshots yet\n");
    }

    const latencyLines: string[] = [];
    const errLines: string[] = [];
    const lagLines: string[] = [];
    const circuitLines: string[] = [];

    for (const s of snap) {
      // const _lbl = { url: s.url, layer: s.layer }; // reserved for gauge helper
      latencyLines.push(`ghostbrain_rpc_latency_ms{url="${promEscape(s.url)}",layer="${s.layer}"} ${s.latencyMs}`);
      errLines.push(`ghostbrain_rpc_error_rate{url="${promEscape(s.url)}",layer="${s.layer}"} ${s.errorRate}`);
      lagLines.push(`ghostbrain_rpc_head_lag{url="${promEscape(s.url)}",layer="${s.layer}"} ${s.headLag}`);
      circuitLines.push(`ghostbrain_rpc_circuit_open{url="${promEscape(s.url)}",layer="${s.layer}"} ${s.circuitOpen ? 1 : 0}`);
    }

    lines.push("# HELP ghostbrain_rpc_latency_ms RPC probe round-trip latency in ms");
    lines.push("# TYPE ghostbrain_rpc_latency_ms gauge");
    lines.push(...latencyLines);

    lines.push("# HELP ghostbrain_rpc_error_rate Exponential moving average of error rate (0..1)");
    lines.push("# TYPE ghostbrain_rpc_error_rate gauge");
    lines.push(...errLines);

    lines.push("# HELP ghostbrain_rpc_head_lag Blocks behind the best-known head");
    lines.push("# TYPE ghostbrain_rpc_head_lag gauge");
    lines.push(...lagLines);

    lines.push("# HELP ghostbrain_rpc_circuit_open 1 if circuit is open (endpoint excluded from routing)");
    lines.push("# TYPE ghostbrain_rpc_circuit_open gauge");
    lines.push(...circuitLines);

    reply.header("content-type", "text/plain;version=0.0.4;charset=utf-8");
    return reply.send(lines.join("\n") + "\n");
  });
}
