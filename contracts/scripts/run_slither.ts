import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const reports = path.join(root, "reports", "formal");
mkdirSync(reports, { recursive: true });
const summaryPath = path.join(reports, "summary.json");
const strict =
  process.env.SLITHER_STRICT === "1" ||
  Boolean(process.env.CI) ||
  process.env.GITHUB_ACTIONS === "true";

function writeSummary(payload: Record<string, unknown>) {
  writeFileSync(
    summaryPath,
    JSON.stringify({ tool: "slither", updatedAt: new Date().toISOString(), ...payload }, null, 2)
  );
}

function isDockerDaemonUnavailable(message: string) {
  const haystack = message.toLowerCase();
  return (
    haystack.includes("permission denied while trying to connect to the docker api") ||
    haystack.includes("got permission denied while trying to connect to the docker daemon socket") ||
    haystack.includes("cannot connect to the docker daemon") ||
    haystack.includes("is the docker daemon running") ||
    haystack.includes("dial unix") &&
      haystack.includes("docker.sock") &&
      (haystack.includes("permission denied") || haystack.includes("operation not permitted"))
  );
}

function skip(message: string): never {
  if (strict) {
    writeSummary({ issues: null, error: message });
    process.exit(1);
  }
  process.stderr.write(`[slither] SKIPPED: ${message}\n`);
  process.stderr.write("[slither] Hint: run on a host with Docker daemon access, or set SLITHER_STRICT=1 to fail hard.\n");
  process.exit(0);
}

const forgeCandidates = [
  process.env.FORGE_BIN,
  path.join(os.homedir(), ".foundry", "bin", "forge"),
  "/usr/local/bin/forge",
  "/usr/bin/forge"
].filter((value): value is string => typeof value === "string" && value.length > 0);
const forgeHostPath = forgeCandidates.find((candidate) => existsSync(candidate));

const slitherOutDir = path.join(root, "out-slither");
const buildInfoDir = path.join(slitherOutDir, "build-info");
const cacheDir = path.join(root, "cache-slither");

const slitherImage = process.env.SLITHER_IMAGE ?? "ghcr.io/crytic/slither:latest";
const platformFlag = process.arch === "arm64" ? ["--platform", "linux/arm64"] : [];
if (!forgeHostPath) {
  writeSummary({ issues: null, error: "missing forge; set FORGE_BIN or install Foundry" });
  process.exit(1);
}

const dockerVersion = spawnSync("docker", ["version"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
if (dockerVersion.error && (dockerVersion.error as NodeJS.ErrnoException).code === "ENOENT") {
  skip("docker not found; install Docker to run Slither");
}
if (dockerVersion.status !== 0) {
  const stderr = dockerVersion.stderr ?? "";
  if (stderr && isDockerDaemonUnavailable(stderr)) {
    skip("docker daemon not reachable; cannot run Slither in this environment");
  }
  writeSummary({ issues: null, error: `docker version failed (exit ${dockerVersion.status ?? "unknown"})` });
  process.exit(dockerVersion.status ?? 1);
}

// Always build into a dedicated output directory to ensure Slither sees fresh build-info
// and to avoid interference from other build commands (forge test, scribble, etc).
rmSync(slitherOutDir, { recursive: true, force: true });
rmSync(cacheDir, { recursive: true, force: true });

const build = spawnSync(
  forgeHostPath,
  [
    "build",
    "--force",
    "--offline",
    "--out",
    slitherOutDir,
    "--build-info",
    "--build-info-path",
    buildInfoDir,
    "--cache-path",
    cacheDir
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
);
if (build.stderr && build.stderr.length) {
  process.stderr.write(build.stderr);
}
if (build.status !== 0) {
  writeSummary({ issues: null, error: `forge build failed (exit ${build.status ?? "unknown"})` });
  process.exit(1);
}
const hasBuildInfo = existsSync(buildInfoDir) && readdirSync(buildInfoDir).some((entry) => entry.endsWith(".json"));
if (!hasBuildInfo) {
  writeSummary({ issues: null, error: "missing Foundry build info after build" });
  process.exit(1);
}

const slitherReport = path.join(reports, "slither.json");
const slitherReportTmp = `${slitherReport}.tmp`;

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
  "-v",
  `${forgeHostPath}:/usr/local/bin/forge:ro`,
  slitherImage,
  "slither",
  "/src",
  "--compile-force-framework",
  "foundry",
  "--foundry-ignore-compile",
  "--foundry-out-directory",
  "/src/out-slither",
  "--exclude",
  "naming-convention,low-level-calls,assembly",
  "--config-file",
  "/src/formal/slither.config.json",
  "--json",
  "-"
];

try {
  const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    skip("docker not found; install Docker to run Slither");
  }
  if (result.stderr && result.stderr.length) {
    process.stderr.write(result.stderr);
  }
  if (!result.stdout || result.stdout.length === 0) {
    const stderr = result.stderr ?? "";
    if (stderr && isDockerDaemonUnavailable(stderr)) {
      skip("docker daemon not reachable; cannot run Slither in this environment");
    }
    writeSummary({ issues: null, error: `slither produced no JSON output (exit ${result.status ?? "unknown"})` });
    process.exit(result.status ?? 1);
  }

  const raw = result.stdout;
  const parsed = JSON.parse(raw) as {
    success?: boolean;
    error?: string | null;
    results?: { detectors?: Array<{ check?: string; impact?: string }> };
  };

  // Only replace the existing report once we have valid JSON.
  if (existsSync(slitherReportTmp)) {
    unlinkSync(slitherReportTmp);
  }
  writeFileSync(slitherReportTmp, raw);
  try {
    renameSync(slitherReportTmp, slitherReport);
  } catch {
    if (existsSync(slitherReport)) {
      unlinkSync(slitherReport);
    }
    renameSync(slitherReportTmp, slitherReport);
  }

  if (parsed.success === false) {
    writeSummary({ issues: null, error: parsed.error ?? "slither failed" });
    process.exit(1);
  }

  const detectors = Array.isArray(parsed?.results?.detectors) ? parsed.results.detectors : [];
  const allowlistedMediumChecks = new Set(["unused-return"]);
  const blockingCount = detectors.filter((detector) => {
    const impact = detector.impact ?? "";
    if (impact === "High") return true;
    if (impact !== "Medium") return false;
    const check = detector.check ?? "";
    return !allowlistedMediumChecks.has(check);
  }).length;
  writeSummary({ issues: blockingCount, totalFindings: detectors.length });
  process.exit(blockingCount > 0 ? 1 : 0);
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  writeSummary({ issues: null, error: `slither runner failed: ${message}` });
  process.exit(1);
}
