import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  const governor = process.env.GOVERNOR_ADDRESS || deployer.address;
  const timelock = process.env.TIMELOCK_ADDRESS || ethers.ZeroAddress;
  const l2Aggregator = process.env.L2_REVENUE_AGGREGATOR_ADDRESS;

  if (!l2Aggregator || !ethers.isAddress(l2Aggregator)) {
    throw new Error("L2_REVENUE_AGGREGATOR_ADDRESS must be a valid address");
  }

  const l1ChainId = Number(process.env.L1_CHAIN_ID || Number(network.chainId));
  const l2ChainId = Number(process.env.L2_CHAIN_ID || 901);

  const Treasury = await ethers.getContractFactory("SovereignTreasuryEngine");
  const treasury = await Treasury.deploy(governor, timelock, l1ChainId, l2ChainId, l2Aggregator);
  await treasury.waitForDeployment();

  const Distributor = await ethers.getContractFactory("SovereignRewardDistributor");
  const distributor = await Distributor.deploy(governor, timelock);
  await distributor.waitForDeployment();

  console.log(
    JSON.stringify(
      {
        ok: true,
        deployer: deployer.address,
        networkChainId: Number(network.chainId),
        configuredL1ChainId: l1ChainId,
        configuredL2ChainId: l2ChainId,
        sovereignTreasuryEngine: await treasury.getAddress(),
        sovereignRewardDistributor: await distributor.getAddress()
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
