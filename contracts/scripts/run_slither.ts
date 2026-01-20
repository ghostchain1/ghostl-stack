import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const reports = path.join(root, "reports", "formal");
mkdirSync(reports, { recursive: true });
const summaryPath = path.join(reports, "summary.json");

const artifactsDir = path.join(root, "artifacts");
const buildInfoDir = path.join(artifactsDir, "build-info");
const hasArtifacts = existsSync(buildInfoDir) && statSync(buildInfoDir).isDirectory();

const slitherImage = process.env.SLITHER_IMAGE ?? "ghcr.io/crytic/slither:latest";
const platformFlag = process.arch === "arm64" ? ["--platform", "linux/arm64"] : [];
if (!hasArtifacts) {
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        tool: "slither",
        issues: null,
        error: "missing hardhat artifacts; run npm run build in contracts",
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
  process.exit(1);
}

const slitherReport = path.join(reports, "slither.json");
if (existsSync(slitherReport)) {
  unlinkSync(slitherReport);
}

const args = [
  "run",
  "--rm",
  "-e",
  "NPM_CONFIG_UPDATE_NOTIFIER=false",
  "-e",
  "NPM_CONFIG_FUND=false",
  "-e",
  "NPM_CONFIG_AUDIT=false",
  "-w",
  "/src",
  ...platformFlag,
  "-v",
  `${root}:/src`,
  slitherImage,
  "slither",
  "/src",
  "--compile-force-framework",
  "hardhat",
  "--hardhat-ignore-compile",
  "--hardhat-artifacts-directory",
  "/src/artifacts",
  "--hardhat-cache-directory",
  "/src/cache",
  "--exclude",
  "naming-convention,low-level-calls,assembly",
  "--config-file",
  "/src/formal/slither.config.json",
  "--json",
  "/src/reports/formal/slither.json"
];

const result = spawnSync("docker", args, { stdio: "inherit" });
try {
  const raw = readFileSync(slitherReport, "utf8");
  const parsed = JSON.parse(raw) as { results?: { detectors?: Array<{ impact?: string }> } };
  const detectors = Array.isArray(parsed?.results?.detectors) ? parsed.results.detectors : [];
  const blockingImpacts = new Set(["High", "Medium"]);
  const blockingCount = detectors.filter((detector) => blockingImpacts.has(detector.impact ?? "")).length;
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        tool: "slither",
        issues: blockingCount,
        totalFindings: detectors.length,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
  process.exit(blockingCount > 0 ? 1 : 0);
} catch {
  writeFileSync(
    summaryPath,
    JSON.stringify({ tool: "slither", issues: null, updatedAt: new Date().toISOString() }, null, 2)
  );
  process.exit(result.status ?? 1);
}
