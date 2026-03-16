import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  canRestart,
  evaluateContainer,
  parseContainerStats,
  pushBounded
} from "./guard.js";

const PORT = Number(process.env.PORT ?? 7617);
const HOST = process.env.HOST ?? "0.0.0.0";
const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock";
const DOCKER_API_VERSION = process.env.DOCKER_API_VERSION ?? "v1.43";
const POLL_INTERVAL_MS = Math.max(1_000, Number(process.env.MEMORY_GUARD_POLL_INTERVAL_MS ?? 30_000));
const WARN_PERCENT = Math.max(1, Number(process.env.MEMORY_GUARD_WARN_PERCENT ?? 70));
const RESTART_PERCENT = Math.max(WARN_PERCENT, Number(process.env.MEMORY_GUARD_RESTART_PERCENT ?? 85));
const WARN_BYTES = Math.max(0, Number(process.env.MEMORY_GUARD_WARN_BYTES ?? 0));
const RESTART_BYTES = Math.max(0, Number(process.env.MEMORY_GUARD_RESTART_BYTES ?? 0));
const SAMPLE_LIMIT = Math.max(3, Number(process.env.MEMORY_GUARD_SAMPLE_LIMIT ?? 20));
const AUTO_RESTART = String(process.env.MEMORY_GUARD_AUTO_RESTART ?? "false").toLowerCase() === "true";
const RESTART_COOLDOWN_MS = Math.max(10_000, Number(process.env.MEMORY_GUARD_RESTART_COOLDOWN_MS ?? 180_000));
const MAX_RESTARTS_PER_HOUR = Math.max(1, Number(process.env.MEMORY_GUARD_MAX_RESTARTS_PER_HOUR ?? 3));
const INCIDENT_REPEAT_MS = Math.max(30_000, Number(process.env.MEMORY_GUARD_INCIDENT_REPEAT_MS ?? 120_000));
const INCIDENT_PATH = process.env.MEMORY_GUARD_INCIDENT_PATH ?? path.join(process.cwd(), "data", "incidents.ndjson");
const MONITOR_SET = new Set(
  String(process.env.MEMORY_GUARD_MONITOR ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const CONTAINER_ALLOWLIST = new Set(
  String(process.env.CONTAINER_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const HEALTH_TARGETS = new Map(
  String(process.env.MEMORY_GUARD_HEALTH_TARGETS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, url] = entry.split("|");
      return [name?.trim(), url?.trim()];
    })
    .filter(([name, url]) => name && url)
);

const config = {
  warnPercent: WARN_PERCENT,
  restartPercent: RESTART_PERCENT,
  warnBytes: WARN_BYTES,
  restartBytes: RESTART_BYTES,
  sampleLimit: SAMPLE_LIMIT,
  restartCooldownMs: RESTART_COOLDOWN_MS,
  maxRestartsPerHour: MAX_RESTARTS_PER_HOUR
};

const containers = new Map();
const incidents = [];
const metrics = {
  pollsTotal: 0,
  pollErrorsTotal: 0,
  incidentsTotal: 0,
  restartsTotal: 0,
  restartSkippedTotal: 0
};

let lastSuccessfulPollAt = "";
let lastPollError = "";
let polling = false;

async function appendIncident(incident) {
  await fs.mkdir(path.dirname(INCIDENT_PATH), { recursive: true });
  await fs.appendFile(INCIDENT_PATH, `${JSON.stringify(incident)}\n`, "utf8");
}

function getOrCreateRecord(name, containerId, image) {
  if (!containers.has(name)) {
    containers.set(name, {
      name,
      containerId,
      image,
      state: "unknown",
      reason: "",
      samples: [],
      restartHistory: [],
      lastRestartAt: 0,
      lastIncidentAt: 0,
      lastHealth: null,
      lastSeenAt: ""
    });
  }
  return containers.get(name);
}

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function text(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}

function dockerRequest(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        socketPath: DOCKER_SOCKET_PATH,
        path: `/${DOCKER_API_VERSION}${requestPath}`,
        method,
        headers: payload
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload)
            }
          : {}
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            return reject(new Error(`docker_http_${res.statusCode}_${raw || "error"}`));
          }
          if (!raw) return resolve(null);
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(raw);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(8_000, () => {
      req.destroy(new Error("docker_request_timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function listContainers() {
  return (await dockerRequest("GET", "/containers/json?all=0")) ?? [];
}

async function inspectStats(containerId) {
  return dockerRequest("GET", `/containers/${containerId}/stats?stream=false`);
}

async function restartContainer(containerId) {
  await dockerRequest("POST", `/containers/${containerId}/restart?t=10`);
}

async function pollHealth(name) {
  const url = HEALTH_TARGETS.get(name);
  if (!url) return null;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(4_000),
      headers: {
        accept: "application/json"
      }
    });
    return {
      url,
      ok: response.ok,
      statusCode: response.status,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      url,
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function recordIncident(record, sample, evaluation, action, health) {
  const incident = {
    id: `${record.name}-${Date.now()}`,
    at: new Date().toISOString(),
    container: record.name,
    containerId: record.containerId,
    image: record.image,
    state: evaluation.state,
    reason: evaluation.reason,
    action,
    memoryUsedBytes: sample.memoryUsedBytes,
    memoryLimitBytes: sample.memoryLimitBytes,
    memoryPercent: sample.memoryPercent,
    cpuPercent: sample.cpuPercent,
    health
  };
  pushBounded(incidents, incident, 200);
  metrics.incidentsTotal += 1;
  await appendIncident(incident);
}

async function processContainer(container) {
  const stats = await inspectStats(container.Id);
  const sample = parseContainerStats(container, stats);
  const record = getOrCreateRecord(sample.name, sample.id, sample.image);
  const health = await pollHealth(sample.name);
  const evaluation = evaluateContainer(sample, config);
  const now = Date.now();

  record.containerId = sample.id;
  record.image = sample.image;
  record.state = evaluation.state;
  record.reason = evaluation.reason;
  record.lastHealth = health;
  record.lastSeenAt = sample.collectedAt;
  pushBounded(record.samples, sample, SAMPLE_LIMIT);

  const shouldRepeatIncident =
    evaluation.state !== "ok" &&
    (record.lastIncidentAt === 0 || now - record.lastIncidentAt >= INCIDENT_REPEAT_MS);

  if (shouldRepeatIncident) {
    let action = evaluation.action;
    if (evaluation.action === "restart") {
      const allowlisted = CONTAINER_ALLOWLIST.has(record.name);
      const restartAllowed = AUTO_RESTART && allowlisted && canRestart(record, now, config);
      if (restartAllowed) {
        await restartContainer(record.containerId);
        pushBounded(record.restartHistory, now, MAX_RESTARTS_PER_HOUR);
        record.lastRestartAt = now;
        metrics.restartsTotal += 1;
        action = "restarted";
      } else {
        metrics.restartSkippedTotal += 1;
        action = allowlisted ? "restart_deferred" : "restart_not_allowlisted";
      }
    }
    record.lastIncidentAt = now;
    await recordIncident(record, sample, evaluation, action, health);
  }
}

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    metrics.pollsTotal += 1;
    const activeContainers = await listContainers();
    for (const container of activeContainers) {
      const name = String(container?.Names?.[0] ?? "").replace(/^\//, "");
      if (MONITOR_SET.size > 0 && !MONITOR_SET.has(name)) {
        continue;
      }
      await processContainer(container);
    }
    lastSuccessfulPollAt = new Date().toISOString();
    lastPollError = "";
  } catch (error) {
    metrics.pollErrorsTotal += 1;
    lastPollError = error instanceof Error ? error.message : String(error);
  } finally {
    polling = false;
  }
}

function metricsResponse() {
  const lines = [
    "# HELP ghost_memory_guard_polls_total Total Docker polling cycles",
    "# TYPE ghost_memory_guard_polls_total counter",
    `ghost_memory_guard_polls_total ${metrics.pollsTotal}`,
    "# HELP ghost_memory_guard_poll_errors_total Total Docker polling failures",
    "# TYPE ghost_memory_guard_poll_errors_total counter",
    `ghost_memory_guard_poll_errors_total ${metrics.pollErrorsTotal}`,
    "# HELP ghost_memory_guard_incidents_total Total incidents emitted",
    "# TYPE ghost_memory_guard_incidents_total counter",
    `ghost_memory_guard_incidents_total ${metrics.incidentsTotal}`,
    "# HELP ghost_memory_guard_restarts_total Total automatic restarts",
    "# TYPE ghost_memory_guard_restarts_total counter",
    `ghost_memory_guard_restarts_total ${metrics.restartsTotal}`,
    "# HELP ghost_memory_guard_restart_skipped_total Total restart skips",
    "# TYPE ghost_memory_guard_restart_skipped_total counter",
    `ghost_memory_guard_restart_skipped_total ${metrics.restartSkippedTotal}`
  ];
  for (const record of containers.values()) {
    const latest = record.samples.at(-1);
    if (!latest) continue;
    lines.push(
      `ghost_memory_guard_memory_percent{container="${record.name}"} ${latest.memoryPercent ?? 0}`,
      `ghost_memory_guard_memory_bytes{container="${record.name}"} ${latest.memoryUsedBytes}`,
      `ghost_memory_guard_cpu_percent{container="${record.name}"} ${latest.cpuPercent}`
    );
  }
  return `${lines.join("\n")}\n`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const healthy = lastSuccessfulPollAt && Date.now() - Date.parse(lastSuccessfulPollAt) < POLL_INTERVAL_MS * 2;

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, healthy ? 200 : 503, {
        ok: healthy,
        service: "ghost-memory-guard",
        autoRestart: AUTO_RESTART,
        allowlistedContainers: [...CONTAINER_ALLOWLIST],
        monitoredContainers: MONITOR_SET.size > 0 ? [...MONITOR_SET] : "all",
        lastSuccessfulPollAt,
        lastPollError,
        memory: process.memoryUsage()
      });
    }

    if (req.method === "GET" && url.pathname === "/status") {
      return json(res, 200, {
        ok: true,
        lastSuccessfulPollAt,
        lastPollError,
        containers: [...containers.values()].map((record) => ({
          name: record.name,
          containerId: record.containerId,
          image: record.image,
          state: record.state,
          reason: record.reason,
          lastSeenAt: record.lastSeenAt,
          lastRestartAt: record.lastRestartAt ? new Date(record.lastRestartAt).toISOString() : null,
          lastHealth: record.lastHealth,
          latestSample: record.samples.at(-1) ?? null
        })),
        metrics
      });
    }

    if (req.method === "GET" && pathParts[0] === "status" && pathParts[1]) {
      const record = containers.get(pathParts[1]);
      if (!record) {
        return json(res, 404, { ok: false, error: "container_not_found" });
      }
      return json(res, 200, {
        ok: true,
        container: {
          ...record,
          lastRestartAt: record.lastRestartAt ? new Date(record.lastRestartAt).toISOString() : null
        }
      });
    }

    if (req.method === "GET" && url.pathname === "/incidents") {
      return json(res, 200, {
        ok: true,
        incidents
      });
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
      return text(res, 200, metricsResponse());
    }

    return json(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

await fs.mkdir(path.dirname(INCIDENT_PATH), { recursive: true });
await pollOnce();
setInterval(() => {
  void pollOnce();
}, POLL_INTERVAL_MS).unref();

server.listen(PORT, HOST, () => {
  console.log(`[ghost-memory-guard] listening on ${HOST}:${PORT}`);
});
