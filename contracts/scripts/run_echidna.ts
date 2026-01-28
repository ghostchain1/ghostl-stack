import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const reports = path.join(root, "reports", "formal");
mkdirSync(reports, { recursive: true });
const solcVersion = process.env.ECHIDNA_SOLC_VERSION ?? "0.8.24";
const useDocker = process.env.ECHIDNA_USE_DOCKER !== "false";
const configPath = path.join(root, "formal", "echidna", "echidna.yaml");

const targets = [
  "formal/echidna/TokenEchidna.sol",
  "formal/echidna/BridgeEchidna.sol",
  "formal/echidna/GovernanceEchidna.sol",
  "formal/echidna/TreasuryEchidna.sol",
  "formal/echidna/EscalationEchidna.sol",
  "formal/echidna/ComplianceRootEchidna.sol"
];

const args = useDocker
  ? [
      "run",
      "--rm",
      "-v",
      `${root}:/src`,
      "trailofbits/echidna",
      "echidna-test",
      "--config",
      "/src/formal/echidna/echidna.yaml",
      "--format",
      "json",
      "--solc-version",
      solcVersion
    ].concat(targets.map((t) => `/src/${t}`))
  : [
      "--config",
      configPath,
      "--format",
      "json",
      "--solc-version",
      solcVersion
    ].concat(targets.map((t) => path.join(root, t)));

const result = spawnSync(useDocker ? "docker" : "echidna-test", args, { stdio: "pipe" });
if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
  if (useDocker) {
    console.error("[echidna] docker not found. Install Docker or set ECHIDNA_USE_DOCKER=false for local echidna-test.");
  } else {
    console.error("[echidna] echidna-test not found. Install Echidna or set ECHIDNA_USE_DOCKER=true.");
  }
  process.exit(1);
}
if (result.stdout && result.stdout.length) {
  writeFileSync(path.join(reports, "echidna.json"), result.stdout);
  process.stdout.write(result.stdout);
}
if (result.stderr && result.stderr.length) {
  process.stderr.write(result.stderr);
}
const summary = {
  tool: "echidna",
  status: result.status === 0 ? "ok" : "failed",
  updatedAt: new Date().toISOString()
};
writeFileSync(path.join(reports, "summary.json"), JSON.stringify(summary, null, 2));
process.exit(result.status ?? 1);
