import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const reports = path.join(root, "reports", "formal");
mkdirSync(reports, { recursive: true });

const targets = [
  "formal/echidna/TokenEchidna.sol",
  "formal/echidna/BridgeEchidna.sol",
  "formal/echidna/GovernanceEchidna.sol",
  "formal/echidna/TreasuryEchidna.sol"
];

const args = [
  "run",
  "--rm",
  "-v",
  `${root}:/src`,
  "trailofbits/echidna",
  "echidna-test",
  "--config",
  "/src/formal/echidna/echidna.yaml",
  "--format",
  "json"
].concat(targets.map((t) => `/src/${t}`));

const result = spawnSync("docker", args, { stdio: "pipe" });
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
