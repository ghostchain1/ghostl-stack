/**
 * complete_deployment.ts
 *
 * Finishes a partially-completed deploy_all.ts run.
 * Assumes all L2 and L1 contracts are already deployed.
 * Performs:
 *   1. Finality oracle wiring on L2
 *   2. L3 contract deployment (L3Inbox, L3BridgedTokenFactory, GhostNFT)
 *   3. Writing deployment records + service .env files
 *
 * Required env vars (in contracts/.env or exported):
 *   RPC_L1, RPC_L2, RPC_L3
 *   DEPLOYER_PRIVATE_KEY or RELAYER_PRIVATE_KEY
 *   DEPLOY_GAS_LIMIT
 *   ENABLE_CASCADING_FINALITY (default: true)
 *   ENFORCE_HIERARCHICAL_FINALITY (default: true)
 *
 *   -- Existing L2 addresses --
 *   GUARD_POLICY_ADDRESS
 *   BRIDGE_L2L3_ADDRESS
 *   L2_ROLLUP_ADDRESS        (OptimisticRollup L3→L2 on L2)
 *   L1_FINALITY_ORACLE_ADDRESS
 *   L2_FINALITY_ORACLE_ADDRESS
 *   L3_FINALITY_ORACLE_ADDRESS
 *
 *   -- Existing L1 addresses --
 *   L1_ROLLUP_ADDRESS        (OptimisticRollup L2→L1 on L1)
 */
import { ghost, network, artifacts } from "hardhat";
import path from "node:path";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function waitForReceipt(
  provider: ghost.JsonRpcProvider,
  hash: string,
  label: string,
  timeoutMs = 120_000
): Promise<ghost.TransactionReceipt | null> {
  const start = Date.now();
  while (true) {
    try {
      const rcpt = await provider.getTransactionReceipt(hash);
      if (rcpt) return rcpt;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("indexing is in progress")) { await sleep(1000); continue; }
      throw err;
    }
    await sleep(1000);
    if (Date.now() - start > timeoutMs) {
      console.warn(`Waited ${timeoutMs}ms for ${label} receipt, continuing...`);
      return null;
    }
  }
}

async function waitForDeployment(c: ghost.Contract, prov: ghost.JsonRpcProvider, label: string) {
  const tx = c.deploymentTransaction();
  if (!tx?.hash) throw new Error(`Missing deployment tx for ${label}`);
  const rcpt = await waitForReceipt(prov, tx.hash, label);
  if (!rcpt || rcpt.status !== 1) throw new Error(`Deploy failed for ${label}`);
}

async function main() {
  const GAS_LIMIT = BigInt(process.env.DEPLOY_GAS_LIMIT ?? "15000000");
  const txOpts = { gasLimit: GAS_LIMIT };

  const rpcL1 = process.env.RPC_L1 ?? "http://localhost:18545";
  const rpcL2 = process.env.RPC_L2 ?? "http://localhost:7260";
  const rpcL3 = process.env.RPC_L3 ?? "http://localhost:7270";
  const version = process.env.CONTRACTS_VERSION ?? "0.0.1";
  const ROOT = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const enableCascadingFinality = (process.env.ENABLE_CASCADING_FINALITY ?? "true") !== "false";
  const enforceHierarchicalFinality = (process.env.ENFORCE_HIERARCHICAL_FINALITY ?? "true") !== "false";

  const l2ChainId = Number(process.env.L2_CHAIN_ID ?? 901);
  const l3ChainId = Number(process.env.L3_CHAIN_ID ?? 903);
  const challengePeriodSeconds = Number(process.env.CHALLENGE_PERIOD_SECONDS ?? 30);
  const CANONICAL_GAS_TOKEN = process.env.CANONICAL_GAS_TOKEN ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const l2TokenAddr = process.env.L2_TOKEN_ADDRESS ?? process.env.L2_TOKEN ?? CANONICAL_GAS_TOKEN;

  // Known addresses
  const policyAddr = ghost.getAddress(process.env.GUARD_POLICY_ADDRESS!);
  const bridgeAddr = ghost.getAddress(process.env.BRIDGE_L2L3_ADDRESS!);
  const l2NftAddr = ghost.getAddress(process.env.L2_NFT_ADDRESS!);
  const l2RollupAddr = ghost.getAddress(process.env.L2_ROLLUP_ADDRESS!);
  const l1FinalityOracleAddr = ghost.getAddress(process.env.L1_FINALITY_ORACLE_ADDRESS!);
  const l2FinalityOracleAddr = ghost.getAddress(process.env.L2_FINALITY_ORACLE_ADDRESS!);
  const l3FinalityOracleAddr = ghost.getAddress(process.env.L3_FINALITY_ORACLE_ADDRESS!);
  const l1RollupAddr = ghost.getAddress(process.env.L1_ROLLUP_ADDRESS!);
  const l1ConstitutionAddr = ghost.getAddress(process.env.L1_CONSTITUTION_ADDRESS!);
  const l1NftAddr = ghost.getAddress(process.env.L1_NFT_ADDRESS!);

  console.log("=== Complete Deployment ===");
  console.log({ rpcL1, rpcL2, rpcL3, l2ChainId, l3ChainId, enableCascadingFinality });

  // Providers + signers
  const l2Signers = await ghost.getSigners();
  if (!l2Signers.length) throw new Error("No signers for L2 network");
  const l2 = l2Signers[0];
  const l2Provider = l2.provider as ghost.JsonRpcProvider;

  const relayerKey = process.env.RELAYER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY!;
  if (!relayerKey) throw new Error("Missing RELAYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");

  const l1Provider = new ghost.JsonRpcProvider(rpcL1);
  const _l1Signer = new ghost.Wallet(relayerKey, l1Provider);
  const l1Network = await l1Provider.getNetwork();

  const l3Provider = new ghost.JsonRpcProvider(rpcL3);
  const l3Signer = new ghost.Wallet(relayerKey, l3Provider);
  const relayerAddr = await l3Signer.getAddress();

  // Deployment record helpers
  const deployments: Record<string, Array<{ name: string; address: string; chainId: number; layer: string; abi: unknown; abiHash: string; version: string; deployedAt: string }>> = { l1: [], l2: [], l3: [] };

  const recordDeployment = async (layer: "l1" | "l2" | "l3", name: string, address: string, chainId: number) => {
    const artifact = await artifacts.readArtifact(name);
    const abiHash = crypto.createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex");
    deployments[layer].push({ name, address, chainId, layer, abi: artifact.abi, abiHash, version, deployedAt: new Date().toISOString() });
  };

  // ── Record already-deployed L2 contracts ──
  await recordDeployment("l2", "GuardPolicy", policyAddr, l2ChainId);
  await recordDeployment("l2", "L2L3Bridge", bridgeAddr, l2ChainId);
  await recordDeployment("l2", "GhostNFT", l2NftAddr, l2ChainId);
  await recordDeployment("l2", "OptimisticRollup", l2RollupAddr, l2ChainId);
  await recordDeployment("l2", "L1FinalityOracle", l1FinalityOracleAddr, l2ChainId);
  await recordDeployment("l2", "L2FinalityOracle", l2FinalityOracleAddr, l2ChainId);
  await recordDeployment("l2", "L3FinalityOracle", l3FinalityOracleAddr, l2ChainId);

  // ── Record already-deployed L1 contracts ──
  await recordDeployment("l1", "OptimisticRollup", l1RollupAddr, Number(l1Network.chainId));
  await recordDeployment("l1", "GhostConstitution", l1ConstitutionAddr, Number(l1Network.chainId));
  await recordDeployment("l1", "GhostNFT", l1NftAddr, Number(l1Network.chainId));

  // ── Wire finality oracles on L2 ──
  if (enableCascadingFinality) {
    console.log("\n== Wire Cascading Finality Oracles on L2 ==");
    const bridge = await ghost.getContractAt("L2L3Bridge", bridgeAddr, l2);
    const l2Rollup = await ghost.getContractAt("OptimisticRollup", l2RollupAddr, l2);

    // Bridge.setL2FinalityOracle
    const currentBridgeL2Oracle = ghost.getAddress(await bridge.l2FinalityOracle());
    if (currentBridgeL2Oracle !== l2FinalityOracleAddr) {
      console.log("Setting L2L3Bridge.l2FinalityOracle →", l2FinalityOracleAddr);
      const tx = await bridge.setL2FinalityOracle(l2FinalityOracleAddr, txOpts);
      await waitForReceipt(l2Provider, tx.hash, "Bridge.setL2FinalityOracle");
      console.log("Done.");
    } else {
      console.log("L2L3Bridge.l2FinalityOracle already set:", currentBridgeL2Oracle);
    }

    // Bridge.setL3FinalityOracle
    const currentBridgeL3Oracle = ghost.getAddress(await bridge.l3FinalityOracle());
    if (currentBridgeL3Oracle !== l3FinalityOracleAddr) {
      console.log("Setting L2L3Bridge.l3FinalityOracle →", l3FinalityOracleAddr);
      const tx = await bridge.setL3FinalityOracle(l3FinalityOracleAddr, txOpts);
      await waitForReceipt(l2Provider, tx.hash, "Bridge.setL3FinalityOracle");
      console.log("Done.");
    } else {
      console.log("L2L3Bridge.l3FinalityOracle already set:", currentBridgeL3Oracle);
    }

    // Bridge.setEnforceHierarchicalFinality
    const currentEnforce = Boolean(await bridge.enforceHierarchicalFinality());
    if (currentEnforce !== enforceHierarchicalFinality) {
      console.log("Setting L2L3Bridge.enforceHierarchicalFinality →", enforceHierarchicalFinality);
      const tx = await bridge.setEnforceHierarchicalFinality(enforceHierarchicalFinality, txOpts);
      await waitForReceipt(l2Provider, tx.hash, "Bridge.setEnforceHierarchicalFinality");
      console.log("Done.");
    } else {
      console.log("L2L3Bridge.enforceHierarchicalFinality already set:", currentEnforce);
    }

    // OptimisticRollup(L3→L2).setParentFinalityOracle → l3FinalityOracle
    const currentL2RollupParent = ghost.getAddress(await l2Rollup.parentFinalityOracle());
    const l2RollupParentTarget = l3FinalityOracleAddr;
    if (currentL2RollupParent !== l2RollupParentTarget) {
      console.log("Setting OptimisticRollup(L3→L2).parentFinalityOracle →", l2RollupParentTarget);
      const tx = await l2Rollup.setParentFinalityOracle(l2RollupParentTarget, txOpts);
      await waitForReceipt(l2Provider, tx.hash, "OptimisticRollup(L3→L2).setParentFinalityOracle");
      console.log("Done.");
    } else {
      console.log("OptimisticRollup(L3→L2).parentFinalityOracle already set:", currentL2RollupParent);
    }

    console.log("Finality wiring on L2 complete.");
  }

  // ── Deploy L3 contracts ──
  console.log("\n== Deploy L3Inbox on L3 ==");
  let l3Nonce = await l3Provider.getTransactionCount(relayerAddr, "pending");
  const nextL3Nonce = () => l3Nonce++;

  const Inbox = await ghost.getContractFactory("L3Inbox");
  const inbox = await Inbox.connect(l3Signer).deploy(relayerAddr, { ...txOpts, nonce: nextL3Nonce() });
  await waitForDeployment(inbox, l3Provider, "L3Inbox");
  const inboxAddr = await inbox.getAddress();
  await recordDeployment("l3", "L3Inbox", inboxAddr, l3ChainId);
  console.log("L3Inbox (L3):", inboxAddr);

  console.log("== Deploy L3BridgedTokenFactory on L3 ==");
  const Factory = await ghost.getContractFactory("L3BridgedTokenFactory");
  const factory = await Factory.connect(l3Signer).deploy(relayerAddr, { ...txOpts, nonce: nextL3Nonce() });
  await waitForDeployment(factory, l3Provider, "L3BridgedTokenFactory");
  const factoryAddr = await factory.getAddress();
  await recordDeployment("l3", "L3BridgedTokenFactory", factoryAddr, l3ChainId);
  console.log("L3BridgedTokenFactory (L3):", factoryAddr);

  console.log("== Deploy GhostNFT on L3 ==");
  const GhostNFT = await ghost.getContractFactory("GhostNFT");
  const l3NftName = process.env.L3_NFT_NAME ?? "GhostL3 NFT";
  const l3NftSymbol = process.env.L3_NFT_SYMBOL ?? "GL3NFT";
  const l3Nft = await GhostNFT.connect(l3Signer).deploy(l3NftName, l3NftSymbol, { ...txOpts, nonce: nextL3Nonce() });
  await waitForDeployment(l3Nft, l3Provider, "GhostNFT L3");
  const l3NftAddr = await l3Nft.getAddress();
  await recordDeployment("l3", "GhostNFT", l3NftAddr, l3ChainId);
  console.log("GhostNFT (L3):", l3NftAddr);

  // ── Write service .env files ──
  console.log("\n== Writing service .env files ==");

  const envPath = path.join(ROOT, "services/ghost-guard/.env");
  const guardEnv = [
    `PORT=7070`,
    `RPC_L1=${rpcL1}`,
    `RPC_L2=${rpcL2}`,
    `RPC_L3=${rpcL3}`,
    `GUARD_POLICY_ADDRESS=${policyAddr}`,
    `BRIDGE_L2L3_ADDRESS=${bridgeAddr}`,
    `ENABLE_CASCADING_FINALITY=${enableCascadingFinality ? 1 : 0}`,
    `ENFORCE_HIERARCHICAL_FINALITY=${enforceHierarchicalFinality ? 1 : 0}`,
    `L1_FINALITY_ORACLE_ADDRESS=${l1FinalityOracleAddr}`,
    `L2_FINALITY_ORACLE_ADDRESS=${l2FinalityOracleAddr}`,
    `L3_FINALITY_ORACLE_ADDRESS=${l3FinalityOracleAddr}`,
    `AI_POLICY_HASH=`,
    `PRIVATE_KEY=`,
    `AI_SIGNER_PRIVATE_KEY=`,
    `AI_CONSENSUS_MODE=enforce`,
    `AI_CONSENSUS_FAIL_OPEN=0`,
    `AI_CONFIDENCE_BPS=9000`,
    `AI_RISK_REVIEW_BPS=5000`,
    `AI_RISK_BLOCK_BPS=8000`,
    `L2_TOKEN_ADDRESS=${l2TokenAddr}`,
  ].join("\n") + "\n";
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, guardEnv, "utf8");
  console.log("Wrote:", envPath);

  const relayerEnvPath = path.join(ROOT, "services/ghost-relayer/.env");
  const relayerEnv = [
    `PORT=7171`,
    `RPC_L1=${rpcL1}`,
    `RPC_L2=${rpcL2}`,
    `RPC_L3=${rpcL3}`,
    `BRIDGE_L2L3_ADDRESS=${bridgeAddr}`,
    `ENABLE_CASCADING_FINALITY=${enableCascadingFinality ? 1 : 0}`,
    `L1_FINALITY_ORACLE_ADDRESS=${l1FinalityOracleAddr}`,
    `L2_FINALITY_ORACLE_ADDRESS=${l2FinalityOracleAddr}`,
    `L3_FINALITY_ORACLE_ADDRESS=${l3FinalityOracleAddr}`,
    `L1_ROLLUP_L2_ADDRESS=${l1RollupAddr}`,
    `L1_ROLLUP_PARENT_ORACLE=`,
    `L2_ROLLUP_L3_ADDRESS=${l2RollupAddr}`,
    `L2_ROLLUP_PARENT_ORACLE=${l3FinalityOracleAddr}`,
    `L3_INBOX_ADDRESS=${inboxAddr}`,
    `L3_TOKEN_FACTORY_ADDRESS=${factoryAddr}`,
    `L3_TOKEN_ADDRESS=`,
    `RELAYER_PRIVATE_KEY=`,
    `L2_RELAYER_PRIVATE_KEY=`,
    `L2_TOKEN_ADDRESS=${l2TokenAddr}`,
    `START_BLOCK=`,
  ].join("\n") + "\n";
  await fs.mkdir(path.dirname(relayerEnvPath), { recursive: true });
  await fs.writeFile(relayerEnvPath, relayerEnv, "utf8");
  console.log("Wrote:", relayerEnvPath);

  const proposerDir = path.join(ROOT, "services/ghost-rollup-proposer");
  const proposerL2Env = [
    `PORT=7272`, `RPC_SETTLEMENT=${rpcL1}`, `RPC_CHILD=${rpcL2}`,
    `ROLLUP_ADDRESS=${l1RollupAddr}`, `PROPOSER_PRIVATE_KEY=`,
    `CHALLENGE_PERIOD_SECONDS=${challengePeriodSeconds}`, `BATCH_SIZE=20`, `CONFIRMATIONS=0`,
  ].join("\n") + "\n";
  const proposerL3Env = [
    `PORT=7373`, `RPC_SETTLEMENT=${rpcL2}`, `RPC_CHILD=${rpcL3}`,
    `ROLLUP_ADDRESS=${l2RollupAddr}`, `PROPOSER_PRIVATE_KEY=`,
    `CHALLENGE_PERIOD_SECONDS=${challengePeriodSeconds}`, `BATCH_SIZE=20`, `CONFIRMATIONS=0`,
  ].join("\n") + "\n";
  await fs.mkdir(proposerDir, { recursive: true });
  await fs.writeFile(`${proposerDir}/.env.l2`, proposerL2Env, "utf8");
  await fs.writeFile(`${proposerDir}/.env.l3`, proposerL3Env, "utf8");
  console.log("Wrote:", `${proposerDir}/.env.l2`, `${proposerDir}/.env.l3`);

  const challengerDir = path.join(ROOT, "services/ghost-rollup-challenger");
  const challengerL2Env = [
    `PORT=7282`, `RPC_SETTLEMENT=${rpcL1}`, `RPC_CHILD=${rpcL2}`,
    `ROLLUP_ADDRESS=${l1RollupAddr}`, `CHALLENGER_PRIVATE_KEY=`, `CONFIRMATIONS=0`,
  ].join("\n") + "\n";
  const challengerL3Env = [
    `PORT=7383`, `RPC_SETTLEMENT=${rpcL2}`, `RPC_CHILD=${rpcL3}`,
    `ROLLUP_ADDRESS=${l2RollupAddr}`, `CHALLENGER_PRIVATE_KEY=`, `CONFIRMATIONS=0`,
  ].join("\n") + "\n";
  await fs.mkdir(challengerDir, { recursive: true });
  await fs.writeFile(`${challengerDir}/.env.l2`, challengerL2Env, "utf8");
  await fs.writeFile(`${challengerDir}/.env.l3`, challengerL3Env, "utf8");
  console.log("Wrote:", `${challengerDir}/.env.l2`, `${challengerDir}/.env.l3`);

  // ── Write deployment JSON records ──
  console.log("\n== Writing deployment JSON records ==");
  const outputDir = process.env.OUTPUT_DIR ?? path.resolve(__dirname, "..", "deployments", network.name);
  await fs.mkdir(outputDir, { recursive: true });

  const writeLayer = async (layer: "l1" | "l2" | "l3") => {
    const filePath = path.join(outputDir, `${layer}.json`);
    const tmpPath = `${filePath}.tmp-${process.pid}`;
    await fs.writeFile(tmpPath, JSON.stringify({ network: network.name, layer, contracts: deployments[layer] }, null, 2));
    await fs.rename(tmpPath, filePath);
    console.log("Wrote:", filePath);
  };
  await writeLayer("l1");
  await writeLayer("l2");
  await writeLayer("l3");

  const rollupConfig = {
    l1: { rollup: l1RollupAddr, chainId: Number(l1Network.chainId), parentFinalityOracle: null },
    l2: { rollup: l2RollupAddr, chainId: l2ChainId, parentFinalityOracle: l3FinalityOracleAddr },
    l3: { inbox: inboxAddr, factory: factoryAddr, chainId: l3ChainId },
    cascadingFinality: {
      enabled: enableCascadingFinality,
      enforceHierarchicalFinality,
      l1FinalityOracle: l1FinalityOracleAddr,
      l2FinalityOracle: l2FinalityOracleAddr,
      l3FinalityOracle: l3FinalityOracleAddr,
    },
  };

  const rollupConfigPath = path.join(outputDir, "rollup-config.json");
  await fs.writeFile(`${rollupConfigPath}.tmp`, JSON.stringify(rollupConfig, null, 2));
  await fs.rename(`${rollupConfigPath}.tmp`, rollupConfigPath);
  console.log("Wrote:", rollupConfigPath);

  const cascadingPath = path.join(outputDir, "cascading-finality.json");
  await fs.writeFile(`${cascadingPath}.tmp`, JSON.stringify({
    network: network.name, chainIdL1: Number(l1Network.chainId), chainIdL2: l2ChainId, chainIdL3: l3ChainId,
    enforceHierarchicalFinality, oracles: { l1: l1FinalityOracleAddr, l2: l2FinalityOracleAddr, l3: l3FinalityOracleAddr },
    rollups: { l2OnL1: l1RollupAddr, l3OnL2: l2RollupAddr, l3OnL2ParentOracle: l3FinalityOracleAddr },
    bridge: { l2L3Bridge: bridgeAddr, l2FinalityOracle: l2FinalityOracleAddr, l3FinalityOracle: l3FinalityOracleAddr },
  }, null, 2));
  await fs.rename(`${cascadingPath}.tmp`, cascadingPath);
  console.log("Wrote:", cascadingPath);

  // Write chains/ rollup refs
  const chainsRoot = path.resolve(ROOT, "chains");
  await fs.mkdir(path.join(chainsRoot, "l2"), { recursive: true });
  await fs.mkdir(path.join(chainsRoot, "l3"), { recursive: true });
  await fs.writeFile(path.join(chainsRoot, "l2", "rollup.json"), JSON.stringify(rollupConfig.l2, null, 2));
  await fs.writeFile(path.join(chainsRoot, "l3", "rollup.json"), JSON.stringify(rollupConfig.l3, null, 2));

  console.log("\n=== Deployment Complete ===");
  console.log("L1 contracts:");
  console.log("  OptimisticRollup (L2→L1):", l1RollupAddr);
  console.log("\nL2 contracts:");
  console.log("  GuardPolicy:", policyAddr);
  console.log("  L2L3Bridge:", bridgeAddr);
  console.log("  OptimisticRollup (L3→L2):", l2RollupAddr);
  console.log("  L1FinalityOracle:", l1FinalityOracleAddr);
  console.log("  L2FinalityOracle:", l2FinalityOracleAddr);
  console.log("  L3FinalityOracle:", l3FinalityOracleAddr);
  console.log("\nL3 contracts:");
  console.log("  L3Inbox:", inboxAddr);
  console.log("  L3BridgedTokenFactory:", factoryAddr);
  console.log("  GhostNFT:", l3NftAddr);
}

main().catch((e) => { console.error(e); process.exit(1); });
