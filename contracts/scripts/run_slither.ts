import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveDockerCmd } from "./docker_cmd";

const root = path.resolve(__dirname, "..");
const reports = path.join(root, "reports", "formal");
mkdirSync(reports, { recursive: true });
const summaryPath = path.join(reports, "summary.json");
const runner = (process.env.SLITHER_RUNNER ?? "auto").toLowerCase();
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
    (haystack.includes("dial unix") &&
      haystack.includes("docker.sock") &&
      (haystack.includes("permission denied") ||
        haystack.includes("operation not permitted") ||
        haystack.includes("no such file or directory"))) ||
    (haystack.includes("error during connect") && haystack.includes("docker.sock"))
  );
}

function isDockerImageFetchUnavailable(message: string) {
  const haystack = message.toLowerCase();
  return (
    haystack.includes("unable to find image") ||
    haystack.includes("pull access denied") ||
    haystack.includes("requested access to the resource is denied") ||
    haystack.includes("manifest unknown") ||
    haystack.includes("no such host") ||
    haystack.includes("temporary failure in name resolution") ||
    haystack.includes("dial tcp") ||
    haystack.includes("i/o timeout") ||
    haystack.includes("tls handshake timeout") ||
    haystack.includes("context deadline exceeded") ||
    haystack.includes("network is unreachable") ||
    haystack.includes("proxyconnect tcp") ||
    haystack.includes("connection refused") ||
    haystack.includes("connection reset by peer")
  );
}

function skip(message: string): never {
  if (strict) {
    writeSummary({ issues: null, error: message });
    process.exit(1);
  }
  process.stderr.write(`[slither] SKIPPED: ${message}\n`);
  process.stderr.write(
    "[slither] Hint: install Slither locally (slither-analyzer) or run on a host with Docker daemon access. Set SLITHER_STRICT=1 to fail hard.\n"
  );
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

class RunnerUnavailableError extends Error {
  runner: "docker" | "local";
  constructor(runner: "docker" | "local", message: string) {
    super(message);
    this.name = "RunnerUnavailableError";
    this.runner = runner;
  }
}

function slitherEnv() {
  const forgeDir = path.dirname(forgeHostPath!);
  const currentPath = process.env.PATH ?? "";
  const env = { ...process.env };
  if (!currentPath.split(path.delimiter).includes(forgeDir)) {
    env.PATH = `${forgeDir}${path.delimiter}${currentPath}`;
  }
  return env;
}

function findSlitherBin(): string | null {
  const candidates = [
    process.env.SLITHER_BIN,
    path.join(root, ".venv-slither", "bin", "slither"),
    path.join(root, ".venv", "bin", "slither"),
    "slither"
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      env: slitherEnv()
    });
    if (probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT") continue;
    if (probe.status !== 0) continue;
    return candidate;
  }

  return null;
}

function runSlitherAndWriteReports(raw: string) {
  const parsed = JSON.parse(raw) as {
    success?: boolean;
    error?: string | null;
    results?: { detectors?: Array<{ check?: string; impact?: string }> };
  };

  // Only replace the existing report once we have valid JSON.
  const slitherReport = path.join(reports, "slither.json");
  const slitherReportTmp = `${slitherReport}.tmp`;
  if (existsSync(slitherReportTmp)) {
    unlinkSync(slitherReportTmp);
  }
  writeFileSync(slitherReportTmp, raw);
  try {
    renameSync(slitherReportTmp, slitherReport);
  } catch {
    copyFileSync(slitherReportTmp, slitherReport);
    unlinkSync(slitherReportTmp);
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
}

function runSlitherLocal(slitherBin: string) {
  const args = [
    root,
    "--compile-force-framework",
    "foundry",
    "--foundry-ignore-compile",
    "--foundry-out-directory",
    slitherOutDir,
    "--exclude",
    "naming-convention,low-level-calls,assembly",
    "--config-file",
    path.join(root, "formal", "slither.config.json"),
    "--json",
    "-"
  ];

  const result = spawnSync(slitherBin, args, {
    cwd: root,
    encoding: "utf8",
    env: slitherEnv(),
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.stderr && result.stderr.length) {
    process.stderr.write(result.stderr);
  }
  if (!result.stdout || result.stdout.length === 0) {
    writeSummary({ issues: null, error: `local slither produced no JSON output (exit ${result.status ?? "unknown"})` });
    process.exit(1);
  }
  runSlitherAndWriteReports(result.stdout);
}

function runSlitherDocker() {
  const docker = resolveDockerCmd();
  const dockerVersion = spawnSync(docker.cmd, [...docker.args, "version"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (dockerVersion.error && (dockerVersion.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new RunnerUnavailableError("docker", "docker not found; install Docker to run Slither");
  }
  const dockerVersionOut = `${dockerVersion.stdout ?? ""}\n${dockerVersion.stderr ?? ""}`.trim();
  if (dockerVersionOut && isDockerDaemonUnavailable(dockerVersionOut)) {
    throw new RunnerUnavailableError("docker", "docker daemon not reachable; cannot run Slither in this environment");
  }
  if (dockerVersion.status !== 0) {
    throw new RunnerUnavailableError("docker", `docker version failed (exit ${dockerVersion.status ?? "unknown"})`);
  }

  const args = [
    "run",
    "--rm",
    "--user",
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
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

  const result = spawnSync(docker.cmd, [...docker.args, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new RunnerUnavailableError("docker", "docker not found; install Docker to run Slither");
  }
  if (result.stderr && result.stderr.length) {
    process.stderr.write(result.stderr);
  }
  if (!result.stdout || result.stdout.length === 0) {
    const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    if (out && isDockerDaemonUnavailable(out)) {
      throw new RunnerUnavailableError("docker", "docker daemon not reachable; cannot run Slither in this environment");
    }
    if (out && isDockerImageFetchUnavailable(out)) {
      throw new RunnerUnavailableError(
        "docker",
        "unable to fetch Slither image (network/registry unavailable); cannot run Slither in this environment"
      );
    }
    if (result.status === 125) {
      throw new RunnerUnavailableError("docker", "docker run failed; cannot run Slither in this environment");
    }
    throw new Error(`slither produced no JSON output (exit ${result.status ?? "unknown"})`);
  }
  runSlitherAndWriteReports(result.stdout);
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

try {
  if (runner !== "auto" && runner !== "docker" && runner !== "local") {
    skip(`unknown SLITHER_RUNNER=${runner}; use auto|docker|local`);
  }

  if (runner === "local") {
    const slitherBin = findSlitherBin();
    if (!slitherBin) {
      skip("slither not found; install slither-analyzer (pip) or use SLITHER_RUNNER=docker");
    }
    runSlitherLocal(slitherBin);
  }

  if (runner === "docker") {
    try {
      runSlitherDocker();
    } catch (error) {
      if (error instanceof RunnerUnavailableError && error.runner === "docker") {
        skip(error.message);
      }
      throw error;
    }
  }

  // auto: prefer Docker when available, otherwise fall back to local if installed.
  try {
    runSlitherDocker();
  } catch (error) {
    if (error instanceof RunnerUnavailableError && error.runner === "docker") {
      const slitherBin = findSlitherBin();
      if (!slitherBin) {
        skip(error.message);
      }
      runSlitherLocal(slitherBin);
    }
    throw error;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  writeSummary({ issues: null, error: `slither runner failed: ${message}` });
  process.exit(1);
}
