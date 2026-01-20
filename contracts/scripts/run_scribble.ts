import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "reports", "formal", "scribble");
mkdirSync(outDir, { recursive: true });

const result = spawnSync(
  "npx",
  ["scribble", "--config", "formal/scribble.config.json"],
  { cwd: root, stdio: "inherit" }
);
const summaryPath = path.join(root, "reports", "formal", "summary.json");
writeFileSync(
  summaryPath,
  JSON.stringify(
    { tool: "scribble", status: result.status === 0 ? "ok" : "failed", updatedAt: new Date().toISOString() },
    null,
    2
  )
);
process.exit(result.status ?? 1);
