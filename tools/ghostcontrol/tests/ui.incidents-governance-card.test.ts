import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const incidentsPageTsxPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/apps/ui/app/incidents/page.tsx",
);
const incidentsPageJsxPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/apps/ui/app/incidents/page.jsx",
);

test("incidents page renders event-cycle governance posture section", () => {
  const tsx = readFileSync(incidentsPageTsxPath, "utf8");

  assert.match(tsx, /Event-Cycle Governance Posture/);
  assert.match(tsx, /governance\/event-cycle-incidents/);
  assert.match(tsx, /Status filter:/);
  assert.match(tsx, /Signal filter:/);
  assert.match(tsx, /threshold-breached/);
  assert.match(tsx, /Tracked governance summaries/);
  assert.match(tsx, /Recent governance incidents:/);
});

test("compiled incidents page mirrors event-cycle governance posture section", () => {
  const jsx = readFileSync(incidentsPageJsxPath, "utf8");

  assert.match(jsx, /Event-Cycle Governance Posture/);
  assert.match(jsx, /governance\/event-cycle-incidents/);
  assert.match(jsx, /Status filter:/);
  assert.match(jsx, /Signal filter:/);
  assert.match(jsx, /threshold-breached/);
  assert.match(jsx, /Tracked governance summaries/);
  assert.match(jsx, /Recent governance incidents:/);
});
