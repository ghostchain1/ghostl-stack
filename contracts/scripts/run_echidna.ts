import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const reports = path.join(root, "reports", "formal");
mkdirSync(reports, { recursive: true });
const summaryPath = path.join(reports, "summary.json");
const solcVersion = process.env.ECHIDNA_SOLC_VERSION ?? "0.8.24";
const useDocker = process.env.ECHIDNA_USE_DOCKER !== "false";
const strict =
  process.env.ECHIDNA_STRICT === "1" ||
  process.env.SLITHER_STRICT === "1" ||
  Boolean(process.env.CI) ||
  process.env.GITHUB_ACTIONS === "true";
const configPath = path.join(root, "formal", "echidna", "echidna.yaml");

const targets = [
  "formal/echidna/TokenEchidna.sol",
  "formal/echidna/BridgeEchidna.sol",
  "formal/echidna/GovernanceEchidna.sol",
  "formal/echidna/TreasuryEchidna.sol",
  "formal/echidna/EscalationEchidna.sol",
  "formal/echidna/ComplianceRootEchidna.sol"
];

function writeSummary(payload: Record<string, unknown>) {
  writeFileSync(
    summaryPath,
    JSON.stringify({ tool: "echidna", updatedAt: new Date().toISOString(), ...payload }, null, 2)
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
      (haystack.includes("permission denied") || haystack.includes("operation not permitted")))
  );
}

function skip(message: string): never {
  if (strict) {
    writeSummary({ status: "failed", error: message });
    process.exit(1);
  }
  process.stderr.write(`[echidna] SKIPPED: ${message}\n`);
  process.stderr.write(
    "[echidna] Hint: run on a host with Docker daemon access, or set ECHIDNA_STRICT=1 to fail hard.\n"
  );
  process.exit(0);
}

if (useDocker) {
  const dockerVersion = spawnSync("docker", ["version"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (dockerVersion.error && (dockerVersion.error as NodeJS.ErrnoException).code === "ENOENT") {
    skip("docker not found; install Docker to run Echidna (or set ECHIDNA_USE_DOCKER=false for a local echidna-test)");
  }
  if (dockerVersion.status !== 0) {
    const stderr = dockerVersion.stderr ?? "";
    if (stderr && isDockerDaemonUnavailable(stderr)) {
      skip("docker daemon not reachable; cannot run Echidna in this environment");
    }
    writeSummary({ status: "failed", error: `docker version failed (exit ${dockerVersion.status ?? "unknown"})` });
    process.exit(dockerVersion.status ?? 1);
  }
}

const args = useDocker
  ? [
      "run",
      "--rm",
      "--user",
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      "-e",
      "HOME=/tmp",
      "-v",
      `${root}:/src`,
      "-w",
      "/src",
      "trailofbits/echidna",
      "echidna-test",
      "--config",
      "/src/formal/echidna/echidna.yaml",
      "--format",
      "json"
    ].concat(targets.map((t) => `/src/${t}`))
  : [
      "--config",
      configPath,
      "--format",
      "json"
    ].concat(targets.map((t) => path.join(root, t)));

const result = spawnSync(useDocker ? "docker" : "echidna-test", args, {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024
});
if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
  if (useDocker) {
    skip("docker not found; install Docker to run Echidna (or set ECHIDNA_USE_DOCKER=false for a local echidna-test)");
  }
  console.error("[echidna] echidna-test not found. Install Echidna or set ECHIDNA_USE_DOCKER=true.");
  process.exit(1);
}
if (result.stderr && result.stderr.length) {
  process.stderr.write(result.stderr);
}
if (useDocker && result.status !== 0 && result.stderr && isDockerDaemonUnavailable(result.stderr)) {
  skip("docker daemon not reachable; cannot run Echidna in this environment");
}
if (result.stdout && result.stdout.length) {
  writeFileSync(path.join(reports, "echidna.json"), result.stdout);
  process.stdout.write(result.stdout);
}
const summary = {
  tool: "echidna",
  status: result.status === 0 ? "ok" : "failed",
  updatedAt: new Date().toISOString()
};
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
process.exit(result.status ?? 1);
