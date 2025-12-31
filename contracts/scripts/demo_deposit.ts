import { ethers } from "hardhat";

async function main() {
  const bridgeAddress = process.env.BRIDGE_L2L3_ADDRESS;
  if (!bridgeAddress) {
    throw new Error("Missing env BRIDGE_L2L3_ADDRESS (source services/ghost-guard/.env first)");
  }

  const [signer] = await ethers.getSigners();
  const to = process.env.DEMO_TO ?? signer.address;
  const amountEth = process.env.DEMO_AMOUNT_ETH ?? "100";
  const amountWei = ethers.parseEther(amountEth);
  const nonce = BigInt(process.env.DEMO_NONCE ?? Math.floor(Date.now() / 1000).toString());

  const bridge = await ethers.getContractAt("L2L3Bridge", bridgeAddress, signer);
  const tx = await bridge.depositToL3(to, amountWei, nonce);

  console.log("bridge:", bridgeAddress);
  console.log("from:", signer.address);
  console.log("to:", to);
  console.log("amountEth:", amountEth);
  console.log("nonce:", nonce.toString());
  console.log("tx:", tx.hash);

  await tx.wait();
  console.log("DepositInitiated emitted.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

