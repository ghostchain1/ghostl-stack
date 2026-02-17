import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/orchestrator/run_event_cycle.sh",
);

test("run_event_cycle supports configurable rpc preflight gates", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /RPC_PREFLIGHT_MODE=.*fail/);
  assert.match(script, /RPC_PREFLIGHT_RETRIES=.*3/);
  assert.match(script, /RPC_PREFLIGHT_RETRY_DELAY_SECONDS=.*3/);
  assert.match(script, /RPC_PREFLIGHT_MODE must be warn\|fail/);
  assert.match(script, /RPC_PREFLIGHT_RETRIES must be a positive integer/);
  assert.match(script, /RPC_PREFLIGHT_RETRY_DELAY_SECONDS must be numeric/);
});

test("run_event_cycle probes rpc chain identity before lock acquisition", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /run_rpc_preflight_probe/);
  assert.match(script, /event-cycle-rpc-preflight-/);
  assert.match(script, /method: "eth_chainId"/);
  assert.match(script, /event_cycle_rpc_preflight_degraded mode=/);
  assert.match(script, /record_rpc_preflight_incident/);
  assert.match(script, /run_event_cycle rpc preflight degraded/);
  assert.match(script, /rpc_preflight_incident_log=/);
});

test("run_event_cycle writes rpc preflight context into iteration evidence", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /"rpc_preflight_mode": "\$\{RPC_PREFLIGHT_MODE\}"/);
  assert.match(script, /"rpc_preflight_retries": \$\{RPC_PREFLIGHT_RETRIES\}/);
  assert.match(
    script,
    /"rpc_preflight_retry_delay_seconds": \$\{RPC_PREFLIGHT_RETRY_DELAY_SECONDS\}/,
  );
  assert.match(script, /"rpc_preflight_ok": \$\{RPC_PREFLIGHT_OK\}/);
  assert.match(script, /"rpc_preflight_log_path": "\$\{RPC_PREFLIGHT_LOG_PATH\}"/);
});
