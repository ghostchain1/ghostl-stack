import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/orchestrator/run_event_cycle.sh",
);

test("run_event_cycle enforces a flock-based single-run lock", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /LOCK_FILE=.*run_event_cycle\.lock/);
  assert.match(script, /LOCK_WAIT_SECONDS=.*900/);
  assert.match(script, /command -v flock/);
  assert.match(script, /exec 200>\"\$\{LOCK_FILE\}\"/);
  assert.match(script, /flock -w \"\$\{LOCK_WAIT_SECONDS\}\" 200/);
  assert.match(script, /event_cycle_lock_timeout/);
});

test("run_event_cycle writes lock metadata into event context evidence", () => {
  const script = readFileSync(scriptPath, "utf8");
  assert.match(script, /"lock_file": "\$\{LOCK_FILE\}"/);
  assert.match(script, /"lock_wait_seconds": \$\{LOCK_WAIT_SECONDS\}/);
});

test("run_event_cycle records a lock-timeout incident for governance evidence", () => {
  const script = readFileSync(scriptPath, "utf8");
  assert.match(script, /record_lock_timeout_incident/);
  assert.match(script, /event-cycle-lock-timeout-/);
  assert.match(script, /collectIncidents/);
  assert.match(script, /run_event_cycle lock contention timeout/);
  assert.match(script, /lock_contention_incident_log=/);
});

test("run_event_cycle auto-mitigates lock-timeout incidents after successful run", () => {
  const script = readFileSync(scriptPath, "utf8");
  assert.match(script, /lock_contention_mitigator\.ts/);
  assert.match(script, /iteration-\$\{NEXT_ITERATION\}-lock-contention-mitigation\.json/);
  assert.match(script, /iteration-\$\{NEXT_ITERATION\}-lock-contention-mitigation-run\.log/);
  assert.match(script, /incident_mitigation/);
});
