import { createServer } from "node:http";
import path from "node:path";
import { TxEngine } from "./engine.js";

const PORT = Number(process.env.PORT ?? 7616);
const HOST = process.env.HOST ?? "0.0.0.0";
const MAX_BODY_BYTES = Math.max(1_024, Number(process.env.TX_ENGINE_MAX_BODY_BYTES ?? 262_144));

function parseNumber(name, fallback, minimum = 0) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

const config = {
  journalPath: process.env.TX_ENGINE_JOURNAL_PATH ?? path.join(process.cwd(), "data", "tx-journal.ndjson"),
  requestTimeoutMs: parseNumber("TX_ENGINE_REQUEST_TIMEOUT_MS", 12_000, 500),
  pollIntervalMs: parseNumber("TX_ENGINE_POLL_INTERVAL_MS", 250, 25),
  retryBaseMs: parseNumber("TX_ENGINE_RETRY_BASE_MS", 2_000, 100),
  retryMaxMs: parseNumber("TX_ENGINE_RETRY_MAX_MS", 120_000, 1_000),
  maxAttempts: parseNumber("TX_ENGINE_MAX_ATTEMPTS", 5, 1),
  maxTrackedJobs: parseNumber("TX_ENGINE_MAX_TRACKED_JOBS", 5_000, 100),
  compactEvery: parseNumber("TX_ENGINE_COMPACT_EVERY", 250, 0),
  rpcUrls: {
    L1: process.env.TX_ENGINE_L1_RPC_URL ?? "http://127.0.0.1:18545",
    L2: process.env.TX_ENGINE_L2_RPC_URL ?? "http://127.0.0.1:29547",
    L3: process.env.TX_ENGINE_L3_RPC_URL ?? "http://127.0.0.1:39545"
  },
  concurrencyByLayer: {
    L1: parseNumber("TX_ENGINE_L1_CONCURRENCY", 1, 1),
    L2: parseNumber("TX_ENGINE_L2_CONCURRENCY", 2, 1),
    L3: parseNumber("TX_ENGINE_L3_CONCURRENCY", 2, 1)
  }
};

const engine = new TxEngine(config);
await engine.init();
engine.start();

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("payload_too_large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new Error("empty_body");
  }
  return JSON.parse(raw);
}

function metricsResponse() {
  const summary = engine.summary();
  const lines = [
    "# HELP ghost_tx_engine_enqueued_total Total queued transactions",
    "# TYPE ghost_tx_engine_enqueued_total counter",
    `ghost_tx_engine_enqueued_total ${summary.metrics.enqueuedTotal}`,
    "# HELP ghost_tx_engine_sent_total Total sent transactions",
    "# TYPE ghost_tx_engine_sent_total counter",
    `ghost_tx_engine_sent_total ${summary.metrics.sentTotal}`,
    "# HELP ghost_tx_engine_failed_total Total permanently failed transactions",
    "# TYPE ghost_tx_engine_failed_total counter",
    `ghost_tx_engine_failed_total ${summary.metrics.failedTotal}`,
    "# HELP ghost_tx_engine_retried_total Total retry schedules",
    "# TYPE ghost_tx_engine_retried_total counter",
    `ghost_tx_engine_retried_total ${summary.metrics.retriedTotal}`,
    "# HELP ghost_tx_engine_recovered_total Total recovered jobs on restart",
    "# TYPE ghost_tx_engine_recovered_total counter",
    `ghost_tx_engine_recovered_total ${summary.metrics.recoveredTotal}`,
    "# HELP ghost_tx_engine_tracked_jobs Current in-memory tracked jobs",
    "# TYPE ghost_tx_engine_tracked_jobs gauge",
    `ghost_tx_engine_tracked_jobs ${summary.totalTrackedJobs}`
  ];
  for (const [layer, count] of Object.entries(summary.inFlightByLayer)) {
    lines.push(
      `ghost_tx_engine_inflight{layer="${layer}"} ${count}`
    );
  }
  for (const [status, count] of Object.entries(summary.byStatus)) {
    lines.push(
      `ghost_tx_engine_jobs{status="${status}"} ${count}`
    );
  }
  return `${lines.join("\n")}\n`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "ghost-tx-engine",
        initialized: engine.initialized,
        status: "ok",
        summary: engine.summary(),
        uptimeSeconds: Math.round(process.uptime()),
        memory: process.memoryUsage()
      });
    }

    if (req.method === "GET" && url.pathname === "/readyz") {
      return json(res, engine.initialized ? 200 : 503, { ok: engine.initialized });
    }

    if (req.method === "GET" && url.pathname === "/status") {
      return json(res, 200, {
        ok: true,
        summary: engine.summary(),
        recentJobs: engine.list({ limit: 25 })
      });
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      return res.end(metricsResponse());
    }

    if (req.method === "GET" && url.pathname === "/transactions") {
      return json(res, 200, {
        ok: true,
        jobs: engine.list({
          status: url.searchParams.get("status") ?? "",
          limit: url.searchParams.get("limit") ?? 100,
          includeRaw: url.searchParams.get("includeRaw") === "true"
        })
      });
    }

    if (req.method === "POST" && url.pathname === "/transactions") {
      const body = await readJsonBody(req);
      const result = await engine.enqueue(body);
      return json(res, result.created ? 201 : 200, {
        ok: true,
        created: result.created,
        job: result.job
      });
    }

    if (pathParts[0] === "transactions" && pathParts[1]) {
      const id = pathParts[1];
      if (req.method === "GET" && pathParts.length === 2) {
        const job = engine.get(id, {
          includeRaw: url.searchParams.get("includeRaw") === "true"
        });
        if (!job) {
          return json(res, 404, { ok: false, error: "job_not_found" });
        }
        return json(res, 200, { ok: true, job });
      }
      if (req.method === "POST" && pathParts[2] === "retry") {
        const job = await engine.retry(id);
        return json(res, 200, { ok: true, job });
      }
    }

    return json(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json(res, 400, { ok: false, error: "invalid_json" });
    }
    if (error instanceof Error && error.message === "payload_too_large") {
      return json(res, 413, { ok: false, error: "payload_too_large" });
    }
    return json(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

server.listen(PORT, HOST, () => {
  console.log(`[ghost-tx-engine] listening on ${HOST}:${PORT}`);
});

process.on("SIGTERM", async () => {
  engine.stop();
  server.close();
});
