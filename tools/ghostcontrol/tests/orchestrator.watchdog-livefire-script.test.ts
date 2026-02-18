import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/infra/systemd/livefire_watchdog_recovery_drill.sh",
);

test("live-fire drill script enforces restore trap and both recovery probes", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /trap cleanup EXIT/);
  assert.match(script, /phase=onfailure_probe/);
  assert.match(script, /Triggering OnFailure= dependencies\./);
  assert.match(script, /phase=restart_recovery_probe/);
  assert.match(script, /event-watchdog-livefire-/);
  assert.match(script, /ARTIFACT_ACTION/);
  assert.match(script, /restart_attempted/);
});
