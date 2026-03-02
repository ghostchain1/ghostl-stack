import { ethers } from "hardhat";

/**
 * deploy-shibarium-bridge.ts
 *
 * Deploys ShibariumBridge on Ethereum L1 and registers it in the
 * GSTCrossChainAdapter as a supported chain (chainId 109).
 *
 * Required env vars
 * ─────────────────
 *   GST_ADDRESS           – canonical GST ERC-20 on L1
 *   FX_ROOT_TUNNEL        – Shibarium's FxERC20RootTunnel address on Ethereum
 *   CHILD_GST             – GST-S token address on Shibarium (0x0 if not yet deployed)
 *   GOVERNOR              – governance / timelock address
 *   TIMELOCK              – secondary timelock (optional, pass 0x0 to skip)
 *   CROSS_CHAIN_ADAPTER   – GSTCrossChainAdapter address (to register the chain)
 *   YIELD_ORACLE          – AI yield oracle address for Shibarium
 *   MAX_DEPLOYMENT        – max GST to deploy to Shibarium (in human units, default 500000)
 *
 * Optional env vars (defaults provided)
 * ──────────────────────────────────────
 *   SHIBARIUM_CHAIN_ID    – defaults to 109 (mainnet); set to 157 for Puppynet
 */

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const gstAddress         = getEnv("GST_ADDRESS");
  const fxRootTunnel       = getEnv("FX_ROOT_TUNNEL");
  const childGST           = getEnv("CHILD_GST",       ethers.ZeroAddress);
  const governor           = getEnv("GOVERNOR",         deployer.address);
  const timelock           = getEnv("TIMELOCK",         ethers.ZeroAddress);
  const crossChainAdapter  = getEnv("CROSS_CHAIN_ADAPTER");
  const yieldOracle        = getEnv("YIELD_ORACLE",    deployer.address);
  const maxDeploymentHuman = getEnv("MAX_DEPLOYMENT",  "500000");
  const shibariumChainId   = Number(getEnv("SHIBARIUM_CHAIN_ID", "109"));

  const maxDeployment = ethers.parseEther(maxDeploymentHuman);

  console.log("──────────────────────────────────────────────");
  console.log("ShibariumBridge deployment");
  console.log("──────────────────────────────────────────────");
  console.log(`Deployer         : ${deployer.address}`);
  console.log(`GST (L1)         : ${gstAddress}`);
  console.log(`FxRootTunnel     : ${fxRootTunnel}`);
  console.log(`Child GST (init) : ${childGST}`);
  console.log(`Governor         : ${governor}`);
  console.log(`Timelock         : ${timelock}`);
  console.log(`Shibarium ChainId: ${shibariumChainId}`);
  console.log(`Max deployment   : ${maxDeploymentHuman} GST`);
  console.log("──────────────────────────────────────────────");

  // ── 1. Deploy ShibariumBridge ────────────────────────────────────────────

  const BridgeFactory = await ethers.getContractFactory("ShibariumBridge");
  const bridge = await BridgeFactory.deploy(
    gstAddress,
    fxRootTunnel,
    childGST,
    governor,
    timelock,
  );
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log(`ShibariumBridge deployed : ${bridgeAddress}`);

  // ── 2. Register in GSTCrossChainAdapter ─────────────────────────────────

  const adapter = await ethers.getContractAt("GSTCrossChainAdapter", crossChainAdapter);

  const addChainTx = await adapter.addChain(
    shibariumChainId,
    bridgeAddress,
    childGST === ethers.ZeroAddress
      ? "0x0000000000000000000000000000000000000001" // placeholder until childGST is deployed
      : childGST,
    yieldOracle,
    maxDeployment,
    "Shibarium",
  );
  await addChainTx.wait();
  console.log(`Shibarium registered in GSTCrossChainAdapter (tx ${addChainTx.hash})`);

  // ── 3. Authorise the adapter as an operator on the bridge ────────────────

  const opTx = await bridge.setOperator(crossChainAdapter, true);
  await opTx.wait();
  console.log(`GSTCrossChainAdapter authorised as operator (tx ${opTx.hash})`);

  console.log("──────────────────────────────────────────────");
  console.log("Deployment complete.");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Deploy ShibariumBridgeChild on Shibarium (chainId 109) and fund");
  console.log("     it with BRIDGE_MINTER role on the GST-S token.");
  console.log("  2. Call ShibariumBridge.setChildGST(<gstS_address>) if CHILD_GST was 0x0.");
  console.log("  3. Call ShibariumBridge.mapToken() via governance after childGST is set.");
  console.log("  4. Update GSTCrossChainAdapter chain config with the correct remoteGST if");
  console.log("     a placeholder was used (call setMaxDeployment / re-register as needed).");
  console.log("──────────────────────────────────────────────");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
