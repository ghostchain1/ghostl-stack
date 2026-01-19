import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const reports = path.join(root, "reports", "formal");
mkdirSync(reports, { recursive: true });

const args = [
  "run",
  "--rm",
  "-v",
  `${root}:/src`,
  "trailofbits/eth-security-toolbox",
  "slither",
  "/src",
  "--config-file",
  "/src/formal/slither.config.json",
  "--json",
  "/src/reports/formal/slither.json"
];

const result = spawnSync("docker", args, { stdio: "inherit" });
const summaryPath = path.join(reports, "summary.json");
try {
  const raw = readFileSync(path.join(reports, "slither.json"), "utf8");
  const parsed = JSON.parse(raw) as { results?: { detectors?: unknown[] } };
  const count = Array.isArray(parsed?.results?.detectors) ? parsed.results.detectors.length : 0;
  writeFileSync(
    summaryPath,
    JSON.stringify({ tool: "slither", issues: count, updatedAt: new Date().toISOString() }, null, 2)
  );
} catch {
  writeFileSync(
    summaryPath,
    JSON.stringify({ tool: "slither", issues: null, updatedAt: new Date().toISOString() }, null, 2)
  );
}
process.exit(result.status ?? 1);
