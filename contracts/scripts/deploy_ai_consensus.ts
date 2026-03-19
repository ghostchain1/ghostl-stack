/**
 * deploy_ai_consensus.ts
 *
 * Deploys AIGuardianL1/L2/L3 to their respective chains, configures
 * them for devnet (no attestation requirements, deployer as signer),
 * and updates services/stack.env + services/ghost-guard/.env.
 *
 * Usage:
 *   cd contracts
 *   DEPLOYER_PRIVATE_KEY=0xac09... \
 *   RPC_L1=http://localhost:18545 \
 *   RPC_L2=http://localhost:7260 \
 *   RPC_L3=http://localhost:7270 \
 *   npx ts-node scripts/deploy_ai_consensus.ts
 *
 * Safe to re-run: skips contracts already deployed at the recorded address.
 */

import { ghost } from "@ghostchain/sdk";
import path from "node:path";
import crypto from "node:crypto";
import { readFileSync, promises as fs } from "node:fs";

// ── config ───────────────────────────────────────────────────────────────────

const DEPLOYER_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  // Hardhat/Anvil devnet account #0 — well-known test key, devnet-only fallback.
  // Set DEPLOYER_PRIVATE_KEY env var for testnet/mainnet.
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";
const RPC_L2 = process.env.RPC_L2 ?? "http://localhost:7260";
const RPC_L3 = process.env.RPC_L3 ?? "http://localhost:7270";

const REPO_ROOT = path.resolve(__dirname, "../..");
const STACK_ENV =
  process.env.STACK_ENV ?? path.join(REPO_ROOT, "services/stack.env");
const GHOST_GUARD_ENV =
  process.env.GHOST_GUARD_ENV ?? path.join(REPO_ROOT, "services/ghost-guard/.env");
const OUTPUT_DIR =
  process.env.OUTPUT_DIR ?? path.join(__dirname, "../deployments/ai-consensus");

// Model ID = keccak256(utf8("GHOST_AI_CONSENSUS_V1")) – must match ghost-guard buildModelId()
const AI_MODEL_TEXT = process.env.AI_MODEL_ID ?? "GHOST_AI_CONSENSUS_V1";
const AI_MODEL_ID = ghost.keccak256(ghost.toUtf8Bytes(AI_MODEL_TEXT));

const ARTIFACTS = path.resolve(__dirname, "../artifacts");

// ── artifact loading ─────────────────────────────────────────────────────────

function loadArtifact(contractName: string, solFileSubdir: string) {
  // Hardhat artifact path: artifacts/src/<subdir>/<Contract>.sol/<Contract>.json
  const p = path.join(ARTIFACTS, "src", solFileSubdir, `${contractName}.sol`, `${contractName}.json`);
  try {
    return JSON.parse(readFileSync(p, "utf8")) as { abi: ghost.InterfaceAbi; bytecode: string };
  } catch {
    throw new Error(`Cannot load artifact for ${contractName} at:\n  ${p}\n  Run: npx hardhat compile`);
  }
}

// ── .env read/write ──────────────────────────────────────────────────────────

async function patchEnvFile(filePath: string, patches: Record<string, string>) {
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    /* new file */
  }

  const updatedKeys = new Set<string>();
  const lines = raw.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();
    if (key in patches) {
      updatedKeys.add(key);
      return `${key}=${patches[key]}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(patches)) {
    if (!updatedKeys.has(key)) lines.push(`${key}=${value}`);
  }

  await fs.writeFile(filePath, lines.join("\n"), "utf8");
  console.log(`  [env] patched ${filePath}`);
}

// ── deploy ───────────────────────────────────────────────────────────────────

async function deploy(
  contractName: string,
  solFileSubdir: string,
  layer: string,
  signer: ghost.Wallet
): Promise<{ address: string; contract: ghost.Contract }> {
  const provider = signer.provider as ghost.JsonRpcProvider;
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  // Check saved deployment for idempotency
  const savedPath = path.join(OUTPUT_DIR, `ai-${layer}.json`);
  try {
    const saved = JSON.parse(await fs.readFile(savedPath, "utf8")) as {
      contracts: Array<{ address: string; chainId: number }>;
    };
    const entry = saved.contracts?.[0];
    if (entry?.address && entry.chainId === chainId) {
      const code = await provider.getCode(entry.address);
      if (code && code !== "0x") {
        console.log(`  [skip] ${contractName} already deployed at ${entry.address}`);
        const { abi } = loadArtifact(contractName, solFileSubdir);
        return { address: entry.address, contract: new ghost.Contract(entry.address, abi, signer) };
      }
    }
  } catch {
    /* no saved file yet */
  }

  const { abi, bytecode } = loadArtifact(contractName, solFileSubdir);
  if (!bytecode || bytecode === "0x") throw new Error(`Empty bytecode for ${contractName}`);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1_000_000_000n;
  const factory = new ghost.ContractFactory(abi, bytecode, signer);

  console.log(`  [deploy] ${contractName} → chain ${chainId}`);
  const instance = await factory.deploy({ gasLimit: 6_000_000n, gasPrice });
  await instance.waitForDeployment();
  const address = await instance.getAddress();
  console.log(`  [ok]     ${contractName} @ ${address}`);

  // Save deployment record
  const art = loadArtifact(contractName, solFileSubdir);
  const abiHash = crypto.createHash("sha256").update(JSON.stringify(art.abi)).digest("hex");
  await fs.writeFile(
    savedPath,
    JSON.stringify(
      {
        network: layer === "l1" ? "anvil" : layer === "l2" ? "ghostl2" : "ghostl3",
        layer,
        contracts: [
          {
            name: contractName,
            address,
            chainId,
            layer,
            abi: art.abi,
            abiHash,
            version: process.env.CONTRACTS_VERSION ?? "0.0.1",
            deployedAt: new Date().toISOString(),
          },
        ],
      },
      null,
      2
    )
  );

  return { address, contract: new ghost.Contract(address, abi, signer) };
}

// ── configure ────────────────────────────────────────────────────────────────

async function configure(contract: ghost.Contract, deployerAddress: string, layer: string) {
  console.log(`  [configure] ${layer.toUpperCase()} guardian...`);
  const provider = contract.runner!.provider!;
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1_000_000_000n;
  const g = { gasLimit: 600_000n, gasPrice };

  // 1. Register deployer as AI signer
  if (!(await contract.aiSigners(deployerAddress))) {
    await (await contract.setSigner(deployerAddress, true, g)).wait();
    console.log(`    setSigner(deployer, true)`);
  } else {
    console.log(`    signer: already registered`);
  }

  // 2. Register model
  if (!(await contract.allowedModels(AI_MODEL_ID))) {
    await (await contract.setModel(AI_MODEL_ID, true, g)).wait();
    console.log(`    setModel(${AI_MODEL_TEXT})`);
  } else {
    console.log(`    model: already registered`);
  }

  // 3. Permissive policy – disable offchain digest, 1 signer, 24h age window
  await (await contract.setPolicy(
    8_000,      // minConfidenceBps
    86_400n,    // maxAttestationAge (24 h)
    false,      // requireOffchainDigest
    1n,         // minSigners
    g
  )).wait();
  console.log(`    setPolicy(8000, 86400, requireOffchain=false, minSigners=1)`);

  // 4. Disable layer digest requirements (no oracles running in dev)
  for (const lid of [1, 2, 3]) {
    const required: boolean = await contract.requireLayerDigest(lid);
    if (required) {
      await (await contract.setLayerRequired(lid, false, g)).wait();
      console.log(`    setLayerRequired(${lid}, false)`);
    }
  }

  // 5. Extend layer max ages to 24 h so stale-digest checks don't fire
  for (const lid of [1, 2, 3]) {
    await (await contract.setLayerMaxAge(lid, 86_400n, g)).wait();
  }
  console.log(`    setLayerMaxAge(*, 86400)`);

  // 6. Disable fraud + compliance assessment requirements so checkTransaction()
  //    returns (true, 0, 0) for all new operation IDs → ghost-guard returns "allow"
  const rFraud: boolean = await contract.requireFraudAssessment();
  const rCompliance: boolean = await contract.requireComplianceAssessment();
  if (rFraud || rCompliance) {
    await (await contract.setAssessmentRequirements(false, false, g)).wait();
    console.log(`    setAssessmentRequirements(false, false)`);
  } else {
    console.log(`    assessment requirements: already disabled`);
  }

  console.log(`  [ok] ${layer.toUpperCase()} guardian configured`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const provL1 = new ghost.JsonRpcProvider(RPC_L1);
  const provL2 = new ghost.JsonRpcProvider(RPC_L2);
  const provL3 = new ghost.JsonRpcProvider(RPC_L3);
  const sigL1 = new ghost.Wallet(DEPLOYER_KEY, provL1);
  const sigL2 = new ghost.Wallet(DEPLOYER_KEY, provL2);
  const sigL3 = new ghost.Wallet(DEPLOYER_KEY, provL3);

  const deployer = sigL1.address;
  console.log(`Deployer : ${deployer}`);
  console.log(`Model    : ${AI_MODEL_TEXT} → ${AI_MODEL_ID}`);

  // connectivity check
  for (const [name, p] of [["L1", provL1], ["L2", provL2], ["L3", provL3]] as const) {
    const net = await (p as ghost.JsonRpcProvider).getNetwork().catch((e) => {
      throw new Error(`Cannot connect to ${name} (${e.message})`);
    });
    console.log(`${name} chainId : ${net.chainId}`);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // ── L1 ──────────────────────────────────────────────────────────────────────
  console.log("\n── AIGuardianL1 ──");
  const { address: addrL1, contract: ctL1 } = await deploy("AIGuardianL1", "l1", "l1", sigL1);
  await configure(ctL1, deployer, "l1");

  // ── L2 ──────────────────────────────────────────────────────────────────────
  console.log("\n── AIGuardianL2 ──");
  const { address: addrL2, contract: ctL2 } = await deploy("AIGuardianL2", "l2", "l2", sigL2);
  await configure(ctL2, deployer, "l2");

  // ── L3 ──────────────────────────────────────────────────────────────────────
  console.log("\n── AIGuardianL3 ──");
  const { address: addrL3, contract: ctL3 } = await deploy("AIGuardianL3", "l3", "l3", sigL3);
  await configure(ctL3, deployer, "l3");

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n── Addresses ──");
  console.log(`AI_GUARDIAN_L1_ADDRESS=${addrL1}`);
  console.log(`AI_GUARDIAN_L2_ADDRESS=${addrL2}`);
  console.log(`AI_GUARDIAN_L3_ADDRESS=${addrL3}`);

  const patches: Record<string, string> = {
    AI_GUARDIAN_L1_ADDRESS: addrL1,
    AI_GUARDIAN_L2_ADDRESS: addrL2,
    AI_GUARDIAN_L3_ADDRESS: addrL3,
    GUARD_PRIVATE_KEY: DEPLOYER_KEY,
    AI_SIGNER_PRIVATE_KEY: DEPLOYER_KEY,
    // Fail-open so a guardian startup delay does NOT block infra txs
    AI_CONSENSUS_FAIL_OPEN: "1",
  };

  console.log("\n── Patching .env files ──");
  await patchEnvFile(STACK_ENV, patches);
  await patchEnvFile(GHOST_GUARD_ENV, {
    ...patches,
    // ghost-guard reads PRIVATE_KEY not GUARD_PRIVATE_KEY
    PRIVATE_KEY: DEPLOYER_KEY,
  });

  console.log("\n✓ Done. Restart ghost-guard:");
  console.log(
    "  docker compose -p ghostl-stack -f docker-compose.phase3.yml up -d --force-recreate ghost-guard"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
