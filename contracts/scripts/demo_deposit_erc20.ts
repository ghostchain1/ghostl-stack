import { ghost } from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const ROOT = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const bridgeAddress = process.env.BRIDGE_L2L3_ADDRESS;
  const tokenAddress = process.env.L2_TOKEN_ADDRESS;
  if (!bridgeAddress || !tokenAddress) {
    throw new Error("Missing env BRIDGE_L2L3_ADDRESS/L2_TOKEN_ADDRESS (source services/ghost-guard/.env first)");
  }

  const [signer] = await ghost.getSigners();
  const to = process.env.DEMO_TO ?? signer.address;
  const amountGst = process.env.DEMO_AMOUNT_GST ?? "1";
  const amountWei = ghost.parseEther(amountGst);
  const nonce = BigInt(process.env.DEMO_NONCE ?? Math.floor(Date.now() / 1000).toString());

  // Disambiguate between multiple ERC20 artifacts in this repo.
  const token = await ghost.getContractAt("src/common/ERC20.sol:ERC20", tokenAddress, signer);
  const bridge = await ghost.getContractAt("L2L3Bridge", bridgeAddress, signer);

  const approveTx = await token.approve(bridgeAddress, amountWei);
  await approveTx.wait();

  const tx = await bridge.depositERC20ToL3(tokenAddress, to, amountWei, nonce);

  console.log("bridge:", bridgeAddress);
  console.log("token:", tokenAddress);
  console.log("from:", signer.address);
  console.log("to:", to);
  console.log("amountGst:", amountGst);
  console.log("nonce:", nonce.toString());
  console.log("tx:", tx.hash);

  await tx.wait();
  console.log("ERC20DepositInitiated emitted.");

  const out = {
    bridge: bridgeAddress,
    token: tokenAddress,
    from: signer.address,
    to,
    amountWei: amountWei.toString(),
    nonce: nonce.toString(),
    depositTx: tx.hash
  };

  const tmpDir = path.join(ROOT, ".tmp");
  const outPath = path.join(tmpDir, "last_deposit_erc20.json");
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Wrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
