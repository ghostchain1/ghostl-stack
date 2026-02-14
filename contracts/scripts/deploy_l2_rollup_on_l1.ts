import { ethers } from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const outPath = path.join(root, ".tmp", "last_l2_rollup_on_l1.json");

  const childChainId = BigInt(process.env.L2_CHAIN_ID ?? "901");
  const challengePeriodSeconds = BigInt(process.env.CHALLENGE_PERIOD_SECONDS ?? "30");

  const [deployer] = await ethers.getSigners();
  if (!deployer?.provider) throw new Error("missing provider (check hardhat network RPC config)");

  const proposer =
    process.env.ROLLUP_PROPOSER_ADDRESS ??
    process.env.PROPOSER_ADDRESS ??
    (process.env.PROPOSER_PRIVATE_KEY ? new ethers.Wallet(process.env.PROPOSER_PRIVATE_KEY).address : null) ??
    deployer.address;

  const net = await deployer.provider.getNetwork();
  console.log("network:", { chainId: Number(net.chainId) });
  console.log("deployer:", deployer.address);
  console.log("proposer:", proposer);
  console.log("childChainId:", childChainId.toString());
  console.log("challengePeriodSeconds:", challengePeriodSeconds.toString());

  const Rollup = await ethers.getContractFactory("OptimisticRollup", deployer);
  const rollup = await Rollup.deploy(childChainId, challengePeriodSeconds, proposer);
  console.log("OptimisticRollup deploy tx:", rollup.deploymentTransaction()?.hash ?? "");
  await rollup.waitForDeployment();
  const addr = await rollup.getAddress();
  console.log("OptimisticRollup (L2->L1, deployed on L1):", addr);

  const out = {
    chainId: Number(net.chainId),
    deployer: deployer.address,
    proposer,
    childChainId: childChainId.toString(),
    challengePeriodSeconds: challengePeriodSeconds.toString(),
    rollup: addr
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Wrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

