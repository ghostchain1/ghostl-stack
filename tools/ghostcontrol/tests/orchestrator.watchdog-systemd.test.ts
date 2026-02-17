import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const healthUnitPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/infra/systemd/ghostcontrol-event-watchdog-healthcheck.service",
);
const recoveryUnitPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/infra/systemd/ghostcontrol-event-watchdog-recovery.service",
);

test("healthcheck unit triggers recovery service on failure", () => {
  const unit = readFileSync(healthUnitPath, "utf8");
  assert.match(unit, /OnFailure=ghostcontrol-event-watchdog-recovery\.service/);
});

test("recovery unit runs watchdog_recovery orchestrator", () => {
  const unit = readFileSync(recoveryUnitPath, "utf8");
  assert.match(unit, /orchestrator\/watchdog_recovery\.ts/);
  assert.match(unit, /User=ghost/);
  assert.match(unit, /GHOSTCONTROL_WATCHDOG_SERVICE_NAME=ghostcontrol-event-watchdog\.service/);
});
