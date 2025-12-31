import { ethers } from "hardhat";

async function main() {
  const bridgeAddress = process.env.BRIDGE_L2L3_ADDRESS;
  if (!bridgeAddress) {
    throw new Error("Missing env BRIDGE_L2L3_ADDRESS (source services/ghost-guard/.env first)");
  }

  const from = process.env.DEMO_FROM;
  const to = process.env.DEMO_TO;
  const amountWeiStr = process.env.DEMO_AMOUNT_WEI;
  const nonceStr = process.env.DEMO_NONCE;
  if (!from || !to || !amountWeiStr || !nonceStr) {
    throw new Error("Missing env DEMO_FROM/DEMO_TO/DEMO_AMOUNT_WEI/DEMO_NONCE (try infra/scripts/demo-finalize.sh)");
  }

  const amountWei = BigInt(amountWeiStr);
  const nonce = BigInt(nonceStr);

  const [signer] = await ethers.getSigners();
  const bridge = await ethers.getContractAt("L2L3Bridge", bridgeAddress, signer);

  const tx = await bridge.finalizeToL3(from, to, amountWei, nonce);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("Finalized.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

