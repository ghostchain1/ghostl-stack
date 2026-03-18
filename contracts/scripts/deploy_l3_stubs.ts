import { ghost, artifacts, network } from "hardhat";
import fs from "fs";
import path from "path";
import crypto from "node:crypto";

async function main() {
  const rpc = process.env.RPC_L2 ?? "http://localhost:29547";
  const provider = new ghost.JsonRpcProvider(rpc);
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) {
    throw new Error("missing_DEPLOYER_PRIVATE_KEY");
  }
  const signer = new ghost.Wallet(deployerKey, provider);

  console.log("Deploying L3 stubs from", await signer.getAddress(), "to", rpc);
  const net = await provider.getNetwork();
  console.log("Network", net);

  const outputDir = process.env.OUTPUT_DIR ?? path.resolve(__dirname, "..", "deployments", network.name);
  const outputFile = process.env.OUTPUT_FILE ?? path.join(outputDir, "l3.json");
  const version = process.env.CONTRACTS_VERSION ?? "0.0.1";

  const L2OO = await ghost.getContractFactory("MockL2OutputOracle", signer);
  const l2oo = await L2OO.deploy(0);
  console.log("MockL2OutputOracle tx", l2oo.deploymentTransaction()?.hash);
  await l2oo.waitForDeployment();
  const l2ooAddress = await l2oo.getAddress();
  console.log("MockL2OutputOracle deployed at", l2ooAddress);

  const DGF = await ghost.getContractFactory("MockDisputeGameFactory", signer);
  const dgf = await DGF.deploy();
  console.log("MockDisputeGameFactory tx", dgf.deploymentTransaction()?.hash);
  await dgf.waitForDeployment();
  const dgfAddress = await dgf.getAddress();
  console.log("MockDisputeGameFactory deployed at", dgfAddress);

  const chainId = Number((await provider.getNetwork()).chainId);
  const entries = [
    { name: "MockL2OutputOracle", address: l2ooAddress },
    { name: "MockDisputeGameFactory", address: dgfAddress }
  ];
  const contracts = await Promise.all(
    entries.map(async (entry) => {
      const artifact = await artifacts.readArtifact(entry.name);
      const abiHash = crypto.createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex");
      return {
        name: entry.name,
        address: entry.address,
        chainId,
        layer: "l3",
        abi: artifact.abi,
        abiHash,
        version,
        deployedAt: new Date().toISOString()
      };
    })
  );
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify({ network: network.name, layer: "l3", contracts }, null, 2));
  console.log("Wrote deployments to", outputFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
