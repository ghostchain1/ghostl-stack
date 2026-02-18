import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/orchestrator/run_event_cycle.sh",
);

test("run_event_cycle supports configurable host disk pressure gates", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /MIN_FREE_DISK_MB=.*4096/);
  assert.match(script, /DISK_PRESSURE_MODE=.*warn/);
  assert.match(script, /DISK_PRESSURE_MODE must be warn\|fail/);
});

test("run_event_cycle records disk pressure incidents with governance evidence", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /record_disk_pressure_incident/);
  assert.match(script, /event-cycle-disk-pressure-/);
  assert.match(script, /run_event_cycle host disk pressure/);
  assert.match(script, /collectIncidents/);
  assert.match(script, /event_cycle_disk_pressure free_mb=/);
  assert.match(script, /disk_pressure_incident_log=/);
});

test("run_event_cycle writes disk pressure context into iteration event evidence", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /"min_free_disk_mb": \$\{MIN_FREE_DISK_MB\}/);
  assert.match(script, /"disk_pressure_mode": "\$\{DISK_PRESSURE_MODE\}"/);
  assert.match(script, /"free_disk_mb_at_start": \$\{FREE_DISK_MB_AT_START\}/);
});
