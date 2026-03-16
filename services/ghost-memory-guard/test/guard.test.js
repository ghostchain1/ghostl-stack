import test from "node:test";
import assert from "node:assert/strict";
import {
  canRestart,
  evaluateContainer,
  normalizeContainerName,
  parseContainerStats
} from "../src/guard.js";

test("normalizeContainerName strips docker slash prefix", () => {
  assert.equal(normalizeContainerName(["/ghost-rpc-aggregator"]), "ghost-rpc-aggregator");
  assert.equal(normalizeContainerName([], "abc123"), "abc123");
});

test("parseContainerStats computes memory and cpu percent", () => {
  const sample = parseContainerStats(
    {
      Id: "abc",
      Names: ["/ghost"],
      Image: "ghost:test",
      State: "running",
      Status: "Up 1 minute"
    },
    {
      memory_stats: { usage: 50, limit: 100 },
      cpu_stats: {
        cpu_usage: { total_usage: 200, percpu_usage: [1, 1] },
        system_cpu_usage: 400,
        online_cpus: 2
      },
      precpu_stats: {
        cpu_usage: { total_usage: 100 },
        system_cpu_usage: 200
      }
    }
  );
  assert.equal(sample.name, "ghost");
  assert.equal(sample.memoryPercent, 50);
  assert.equal(sample.cpuPercent, 100);
});

test("evaluateContainer escalates to restart at critical threshold", () => {
  const evaluation = evaluateContainer(
    {
      memoryUsedBytes: 90,
      memoryLimitBytes: 100,
      memoryPercent: 90,
      cpuPercent: 10
    },
    {
      warnPercent: 70,
      restartPercent: 85,
      warnBytes: 0,
      restartBytes: 0
    }
  );
  assert.equal(evaluation.state, "critical");
  assert.equal(evaluation.action, "restart");
});

test("canRestart respects cooldown and hourly cap", () => {
  const now = Date.now();
  const record = {
    restartHistory: [now - 1_000, now - 2_000],
    lastRestartAt: now - 1_000
  };
  assert.equal(
    canRestart(record, now, { maxRestartsPerHour: 3, restartCooldownMs: 5_000 }),
    false
  );
  assert.equal(
    canRestart(
      {
        restartHistory: [now - 4_000_000],
        lastRestartAt: now - 10_000
      },
      now,
      { maxRestartsPerHour: 3, restartCooldownMs: 5_000 }
    ),
    true
  );
});
