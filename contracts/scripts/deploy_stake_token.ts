import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const owner = await signer.getAddress();
  const initialSupply = ethers.parseEther(process.env.STAKE_TOKEN_SUPPLY ?? "1000000");

  const factory = await ethers.getContractFactory("StakeToken");
  const token = await factory.deploy(owner, initialSupply);
  await token.waitForDeployment();

  const addr = await token.getAddress();
  const net = await signer.provider!.getNetwork();

  // JSON-only output so bash scripts can parse reliably.
  console.log(JSON.stringify({ ok: true, chainId: net.chainId.toString(), owner, stakeToken: addr }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
