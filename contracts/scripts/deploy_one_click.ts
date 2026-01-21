import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
};

const layer = (getArg("--layer") || "all").toLowerCase();
const network = getArg("--network") || "ghostl2";
const rpc = getArg("--rpc");
const deployerKeyEnv = getArg("--deployer-key");

if (!['l1', 'l2', 'l3', 'all'].includes(layer)) {
  console.error("Invalid --layer. Use l1|l2|l3|all.");
  process.exit(1);
}

const env = { ...process.env };
if (deployerKeyEnv) {
  const value = process.env[deployerKeyEnv];
  if (!value) {
    console.error(`Missing env var ${deployerKeyEnv}`);
    process.exit(1);
  }
  env.DEPLOYER_PRIVATE_KEY = value;
}

if (rpc) {
  if (layer === "l1") env.RPC_L1 = rpc;
  if (layer === "l2") env.RPC_L2 = rpc;
  if (layer === "l3") env.RPC_L3 = rpc;
}

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "deployments", network);
mkdirSync(outputDir, { recursive: true });
env.OUTPUT_DIR = outputDir;

const runScript = (script: string) => {
  const result = spawnSync("npx", ["hardhat", "run", "--network", network, script], {
    stdio: "inherit",
    cwd: root,
    env
  });
  return result.status ?? 1;
};

let exitCode = 0;
if (layer === "l1") {
  exitCode = runScript("scripts/deploy-custom-l1.ts");
} else if (layer === "l3") {
  exitCode = runScript("scripts/deploy_all.ts");
} else if (layer === "l2") {
  exitCode = runScript("scripts/deploy_all.ts");
} else {
  exitCode = runScript("scripts/deploy_all.ts");
}

if (exitCode !== 0) process.exit(exitCode);

const apiBase = process.env.CONTRACTS_REGISTRY_API || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const token = process.env.CONTRACTS_REGISTRY_TOKEN || "";
const verificationUrl = process.env.VERIFICATION_SERVICE_URL || "";

const layers = layer === "all" ? ["l1", "l2", "l3"] : [layer];
const results: Array<{
  layer: string;
  registered: number;
  failed: number;
  nftRegistered: number;
  nftFailed: number;
  errors: string[];
}> = [];

const postJson = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-contracts-token": token } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  return res.json().catch(() => ({}));
};

const registerLayer = async (layerKey: string) => {
  const filePath = path.join(outputDir, `${layerKey}.json`);
  const data = JSON.parse(readFileSync(filePath, "utf8")) as { contracts?: unknown[] };
  const contracts = Array.isArray(data.contracts) ? data.contracts : [];
  let registered = 0;
  let failed = 0;
  let nftRegistered = 0;
  let nftFailed = 0;
  const errors: string[] = [];
  for (const entry of contracts) {
    try {
      const meta = entry as { name?: string; address?: string; chainId?: number; abiHash?: string; version?: string };
      await postJson(`${apiBase}/api/contracts/register`, { contract: entry });
      console.log(
        `[registry] registered ${meta.name || "contract"} ${meta.address || ""} chainId=${meta.chainId ?? ""} layer=${layerKey} version=${meta.version || ""} abiHash=${meta.abiHash || ""}`
      );
      if (verificationUrl) {
        await postJson(`${verificationUrl}/verifications`, {
          address: (entry as { address?: string }).address,
          chainId: (entry as { chainId?: number }).chainId,
          status: "pending",
          name: (entry as { name?: string }).name
        });
      }
      registered++;
    } catch (err) {
      failed++;
      console.error(
        `[registry] failed ${layerKey}: ${err instanceof Error ? err.message : String(err)}`
      );
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  const nftContracts = contracts.filter(
    (entry) => (entry as { name?: string }).name?.toLowerCase() === "ghostnft"
  );
  for (const entry of nftContracts) {
    const address = (entry as { address?: string }).address;
    if (!address) continue;
    const rpcOverride =
      layerKey === "l1" ? process.env.RPC_L1 : layerKey === "l3" ? process.env.RPC_L3 : process.env.RPC_L2;
    try {
      await postJson(`${apiBase}/api/nfts/contracts`, {
        address,
        chainId: layerKey,
        standard: "erc721",
        ...(rpcOverride ? { rpc: rpcOverride } : {})
      });
      nftRegistered++;
    } catch (err) {
      nftFailed++;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  results.push({ layer: layerKey, registered, failed, nftRegistered, nftFailed, errors });
};

(async () => {
  for (const layerKey of layers) {
    try {
      await registerLayer(layerKey);
    } catch (err) {
      results.push({
        layer: layerKey,
        registered: 0,
        failed: 1,
        nftRegistered: 0,
        nftFailed: 1,
        errors: [err instanceof Error ? err.message : String(err)]
      });
    }
  }

  writeFileSync(path.join(outputDir, "registry-post.json"), JSON.stringify({ network, layer, results }, null, 2));
})();
