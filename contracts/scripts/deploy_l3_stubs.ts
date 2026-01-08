import { ethers } from "hardhat";

async function main() {
  const rpc = process.env.RPC_L2 ?? "http://localhost:29545";
  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(
    process.env.DEPLOYER_PRIVATE_KEY ??
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    provider
  );

  console.log("Deploying L3 stubs from", await signer.getAddress(), "to", rpc);
  const net = await provider.getNetwork();
  console.log("Network", net);

  const L2OO = await ethers.getContractFactory("MockL2OutputOracle", signer);
  const l2oo = await L2OO.deploy(0);
  console.log("MockL2OutputOracle tx", l2oo.deploymentTransaction()?.hash);
  await l2oo.waitForDeployment();
  const l2ooAddress = await l2oo.getAddress();
  console.log("MockL2OutputOracle deployed at", l2ooAddress);

  const DGF = await ethers.getContractFactory("MockDisputeGameFactory", signer);
  const dgf = await DGF.deploy();
  console.log("MockDisputeGameFactory tx", dgf.deploymentTransaction()?.hash);
  await dgf.waitForDeployment();
  const dgfAddress = await dgf.getAddress();
  console.log("MockDisputeGameFactory deployed at", dgfAddress);

  console.log("\nSet these for L3 proposer/batcher:");
  console.log("  L3_L2OO_ADDRESS=", l2ooAddress);
  console.log("  L3_GAME_FACTORY_ADDRESS=", dgfAddress);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
