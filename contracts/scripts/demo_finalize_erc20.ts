import { ghost } from "hardhat";

async function main() {
  const bridgeAddress = process.env.BRIDGE_L2L3_ADDRESS;
  if (!bridgeAddress) {
    throw new Error("Missing env BRIDGE_L2L3_ADDRESS (source services/ghost-guard/.env first)");
  }

  const token = process.env.DEMO_TOKEN;
  const from = process.env.DEMO_FROM;
  const to = process.env.DEMO_TO;
  const amountWeiStr = process.env.DEMO_AMOUNT_WEI;
  const nonceStr = process.env.DEMO_NONCE;
  if (!token || !from || !to || !amountWeiStr || !nonceStr) {
    throw new Error("Missing env DEMO_TOKEN/DEMO_FROM/DEMO_TO/DEMO_AMOUNT_WEI/DEMO_NONCE");
  }

  const amountWei = BigInt(amountWeiStr);
  const nonce = BigInt(nonceStr);

  const [signer] = await ghost.getSigners();
  const bridge = await ghost.getContractAt("L2L3Bridge", bridgeAddress, signer);

  const tx = await bridge.finalizeERC20ToL3(token, from, to, amountWei, nonce);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("Finalized ERC20.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

