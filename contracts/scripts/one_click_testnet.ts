import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const network = process.env.TESTNET_NETWORK || "polygonAmoy";
const root = path.resolve(__dirname, "..", "deployments", network);
mkdirSync(root, { recursive: true });

const startedAt = new Date().toISOString();
const result = spawnSync(
  "ts-node",
  ["scripts/deploy_one_click.ts", "--layer", "all", "--network", network],
  { stdio: "inherit", env: process.env }
);

const payload = {
  network,
  startedAt,
  finishedAt: new Date().toISOString(),
  status: result.status ?? 1
};
writeFileSync(path.join(root, "last_testnet_deploy.json"), JSON.stringify(payload, null, 2));

process.exit(result.status ?? 1);
