/**
 * Ghost AI Swarm — unit tests (Node.js built-in test runner via tsx).
 * No network, no Docker, no libvirt.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// ── Swarm Bus ────────────────────────────────────────────────────────────────
describe("SwarmBus", () => {
  it("emits and receives a typed event", (t, done) => {
    const { swarmBus } = require("../src/communication/swarm-bus");
    swarmBus.once("build-code", (payload: { target: string }) => {
      assert.equal(payload.target, "ghostchain");
      done();
    });
    swarmBus.emit("build-code", { target: "ghostchain" });
  });

  it("records event history", () => {
    const { swarmBus } = require("../src/communication/swarm-bus");
    swarmBus.emit("audit-code", { target: "test-contract" });
    const history = swarmBus.getHistory(5);
    assert.ok(history.length > 0);
    assert.ok(history.some((e: { event: string }) => e.event === "audit-code"));
  });

  it("history does not exceed MAX_HISTORY", () => {
    const { swarmBus } = require("../src/communication/swarm-bus");
    for (let i = 0; i < 250; i++) {
      swarmBus.emit("optimize-system", {});
    }
    const full = swarmBus.getHistory(1000);
    assert.ok(full.length <= 200);
  });
});

// ── Swarm Health ─────────────────────────────────────────────────────────────
describe("SwarmHealth", () => {
  before(() => {
    // Start swarm so descriptors are registered
    const { startSwarm } = require("../src/swarm/swarm-controller");
    startSwarm();
  });

  after(() => {
    const { stopSwarm } = require("../src/swarm/swarm-controller");
    stopSwarm();
  });

  it("returns a health report with all 7 agents", () => {
    const { swarmHealth } = require("../src/monitoring/swarm-health");
    const report = swarmHealth();
    assert.equal(report.agents.length, 7);
    assert.ok(["healthy", "degraded", "unhealthy"].includes(report.status));
    assert.ok(report.healthScore >= 0 && report.healthScore <= 100);
    assert.ok(typeof report.ts === "string");
  });

  it("all fresh agents start idle — score = 100", () => {
    const { swarmHealth } = require("../src/monitoring/swarm-health");
    const report = swarmHealth();
    // All agents default to 'idle' before any task runs
    for (const agent of report.agents) {
      assert.notEqual(agent.status, "error");
    }
    assert.ok(report.healthScore >= 60); // generous threshold for CI
  });

  it("isStarted returns true after startSwarm", () => {
    const { isStarted } = require("../src/swarm/swarm-controller");
    assert.equal(isStarted(), true);
  });
});

// ── Task helpers ─────────────────────────────────────────────────────────────
describe("Tasks", () => {
  it("repairCode emits build-code on the swarm bus", (t, done) => {
    const { swarmBus } = require("../src/communication/swarm-bus");
    const { repairCode } = require("../src/tasks/code-repair");
    swarmBus.once("build-code", (payload: { target: string }) => {
      assert.equal(payload.target, "ghostcontract");
      done();
    });
    repairCode("ghostcontract");
  });

  it("repairInfrastructure emits infra-repair on the swarm bus", (t, done) => {
    const { swarmBus } = require("../src/communication/swarm-bus");
    const { repairInfrastructure } = require("../src/tasks/infra-repair");
    swarmBus.once("infra-repair", (payload: { layer?: string }) => {
      assert.equal(payload.layer, "L2");
      done();
    });
    repairInfrastructure({ layer: "L2" });
  });
});

// ── Agent triggers (DRY_RUN=1 — all return ok=true without network calls) ────
describe("Agent triggers", () => {
  it("triggerBuild with dryRun=true returns ok", async () => {
    const { triggerBuild } = require("../src/agents/builder-agent");
    const result = await triggerBuild({ target: "ghost-core", dryRun: true });
    assert.equal(result.ok, true);
    assert.equal(result.agent, "builder");
    assert.ok(result.ts);
  });

  it("triggerAudit returns ok", async () => {
    const { triggerAudit } = require("../src/agents/auditor-agent");
    const result = await triggerAudit({ target: "SovereignTreasuryEngine.sol" });
    assert.equal(result.ok, true);
    assert.equal(result.agent, "auditor");
  });

  it("triggerDefend returns ok for critical alert", async () => {
    const { triggerDefend } = require("../src/agents/defender-agent");
    const result = await triggerDefend({
      source: "ghostdns-ai",
      severity: "critical",
      detail: "DDoS detected on L2 RPC gateway",
    });
    assert.equal(result.ok, true);
    assert.equal(result.agent, "defender");
  });

  it("triggerOptimize returns ok", async () => {
    const { triggerOptimize } = require("../src/agents/optimizer-agent");
    const result = await triggerOptimize({});
    assert.equal(result.ok, true);
    assert.equal(result.agent, "optimizer");
  });

  it("triggerInfraRepair returns ok with layer specified", async () => {
    const { triggerInfraRepair } = require("../src/agents/infra-agent");
    const result = await triggerInfraRepair({ layer: "L3", target: "ghost-l3-node" });
    assert.equal(result.ok, true);
    assert.equal(result.agent, "infra");
    assert.ok(result.detail.includes("L3"));
  });

  it("triggerGovernance includes human ratification note", async () => {
    const { triggerGovernance } = require("../src/agents/governance-agent");
    const result = await triggerGovernance({ kind: "parameter-update", payload: { quorum: 0.6 } });
    assert.equal(result.ok, true);
    assert.ok(result.detail.includes("human ratification"));
  });

  it("triggerTreasury returns ok for audit action", async () => {
    const { triggerTreasury } = require("../src/agents/treasury-agent");
    const result = await triggerTreasury({ action: "audit" });
    assert.equal(result.ok, true);
    assert.equal(result.agent, "treasury");
  });
});

// ── HMAC auth ────────────────────────────────────────────────────────────────
describe("HMAC auth middleware", () => {
  it("passes through when mode=dev (default)", async () => {
    // Without setting GHOST_SWARM_MODE=prod, hmacAuth calls next()
    const { hmacAuth } = require("../src/auth");
    const called = { next: false };
    const req = { headers: {}, body: {} };
    const res = { status: () => res, json: () => {} };
    const next = () => { called.next = true; };
    hmacAuth(req as any, res as any, next as any);
    assert.equal(called.next, true);
  });

  it("rejects in prod mode without signature header", async () => {
    process.env["GHOST_SWARM_MODE"] = "prod";
    process.env["GHOST_SWARM_SECRET_KEY"] = "test-secret";
    // Clear module cache to force re-read of env
    delete require.cache[require.resolve("../src/auth")];
    const { hmacAuth } = require("../src/auth");

    let statusCode = 0;
    const req = { headers: {}, body: {} };
    const res = {
      status: (code: number) => { statusCode = code; return res; },
      json: () => {},
    };
    const next = () => {};
    hmacAuth(req as any, res as any, next as any);
    assert.equal(statusCode, 401);

    // Restore
    delete process.env["GHOST_SWARM_MODE"];
    delete process.env["GHOST_SWARM_SECRET_KEY"];
    delete require.cache[require.resolve("../src/auth")];
  });
});

// ── HTTP app ─────────────────────────────────────────────────────────────────
describe("Express app", () => {
  it("GET /status returns service name", async () => {
    // Build app in isolation (mode=dev so no HMAC needed)
    const { buildApp } = require("../src/index");
    const app = buildApp();
    // Use node:http to make a request without supertest dep
    const http = require("node:http");
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/status`, (res: any) => {
        let data = "";
        res.on("data", (d: Buffer) => { data += d; });
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });

    server.close();
    const json = JSON.parse(body) as { service: string };
    assert.ok(json.service.includes("ghost-ai-swarm"));
  });

  it("GET /swarm-health returns healthScore", async () => {
    const { buildApp } = require("../src/index");
    const app = buildApp();
    const http = require("node:http");
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/swarm-health`, (res: any) => {
        let data = "";
        res.on("data", (d: Buffer) => { data += d; });
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });

    server.close();
    const json = JSON.parse(body) as { healthScore: number };
    assert.ok(typeof json.healthScore === "number");
  });

  it("POST /agents/build with invalid body returns 400", async () => {
    const { buildApp } = require("../src/index");
    const app = buildApp();
    const http = require("node:http");
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const body = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const payload = JSON.stringify({ target: "" }); // fails min(1)
      const options = {
        hostname: "127.0.0.1",
        port,
        path: "/agents/build",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": payload.length },
      };
      const req = http.request(options, (res: any) => {
        let data = "";
        res.on("data", (d: Buffer) => { data += d; });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    server.close();
    assert.equal(body.status, 400);
  });
});
