import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/orchestrator/run_event_cycle.sh",
);

test("run_event_cycle supports configurable rpc auto-remediation controls", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /RPC_AUTO_REMEDIATION_ENABLED=.*true/);
  assert.match(script, /RPC_AUTO_REMEDIATION_MAX_ATTEMPTS=.*1/);
  assert.match(script, /RPC_AUTO_REMEDIATION_DELAY_SECONDS=.*5/);
  assert.match(
    script,
    /RPC_AUTO_REMEDIATION_L1_CONTAINERS="\$\{RPC_AUTO_REMEDIATION_L1_CONTAINERS-/,
  );
  assert.match(
    script,
    /RPC_AUTO_REMEDIATION_L2_CONTAINERS="\$\{RPC_AUTO_REMEDIATION_L2_CONTAINERS-/,
  );
  assert.match(
    script,
    /RPC_AUTO_REMEDIATION_L3_CONTAINERS="\$\{RPC_AUTO_REMEDIATION_L3_CONTAINERS-/,
  );
  assert.match(script, /RPC_AUTO_REMEDIATION_ENABLED must be true\|false/);
  assert.match(script, /RPC_AUTO_REMEDIATION_MAX_ATTEMPTS must be numeric/);
  assert.match(script, /RPC_AUTO_REMEDIATION_DELAY_SECONDS must be numeric/);
});

test("run_event_cycle attempts bounded rpc auto-remediation before fail/warn handling", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /parse_rpc_preflight_failures/);
  assert.match(script, /run_rpc_auto_remediation_attempt/);
  assert.match(script, /run_rpc_preflight_mitigation_after_recovery/);
  assert.match(script, /event-cycle-rpc-remediation-/);
  assert.match(script, /docker restart/);
  assert.match(script, /rpc_preflight_mitigator\.ts/);
  assert.match(script, /rpc_preflight_mitigation_log=/);
  assert.match(script, /event_cycle_rpc_auto_remediation_no_effect attempt=/);
  assert.match(script, /event_cycle_rpc_auto_remediation_recovered attempts=/);
});

test("run_event_cycle writes rpc auto-remediation evidence context", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /"rpc_auto_remediation_enabled": \$\{RPC_AUTO_REMEDIATION_ENABLED\}/);
  assert.match(
    script,
    /"rpc_auto_remediation_max_attempts": \$\{RPC_AUTO_REMEDIATION_MAX_ATTEMPTS\}/,
  );
  assert.match(
    script,
    /"rpc_auto_remediation_delay_seconds": \$\{RPC_AUTO_REMEDIATION_DELAY_SECONDS\}/,
  );
  assert.match(
    script,
    /"rpc_auto_remediation_attempts": \$\{RPC_AUTO_REMEDIATION_ATTEMPTS\}/,
  );
  assert.match(
    script,
    /"rpc_auto_remediation_recovered": \$\{RPC_AUTO_REMEDIATION_RECOVERED\}/,
  );
  assert.match(
    script,
    /"rpc_auto_remediation_last_log_path": "\$\{RPC_AUTO_REMEDIATION_LAST_LOG_PATH\}"/,
  );
  assert.match(
    script,
    /"rpc_preflight_mitigation_status": "\$\{RPC_PREFLIGHT_MITIGATION_STATUS\}"/,
  );
  assert.match(
    script,
    /"rpc_preflight_mitigation_log_path": "\$\{RPC_PREFLIGHT_MITIGATION_LOG_PATH\}"/,
  );
  assert.match(
    script,
    /"rpc_preflight_mitigation_run_log_path": "\$\{RPC_PREFLIGHT_MITIGATION_RUN_LOG_PATH\}"/,
  );
});
