import { ethers } from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const ROOT = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const l3TokenAddress = process.env.L3_TOKEN_ADDRESS;
  if (!l3TokenAddress) {
    throw new Error("Missing env L3_TOKEN_ADDRESS (source services/ghost-relayer/.env first)");
  }

  const [signer] = await ethers.getSigners();
  const to = process.env.DEMO_TO ?? signer.address;
  const amountGst = process.env.DEMO_AMOUNT_GST ?? process.env.DEMO_AMOUNT_ETH ?? "1";
  const amountWei = ethers.parseEther(amountGst);
  const nonce = BigInt(process.env.DEMO_NONCE ?? Math.floor(Date.now() / 1000).toString());

  const token = await ethers.getContractAt("L3BridgedToken", l3TokenAddress, signer);
  const tx = await token.burnToL2(to, amountWei, nonce);

  console.log("l3Token:", l3TokenAddress);
  console.log("from:", signer.address);
  console.log("to(L2):", to);
  console.log("amountGst:", amountGst);
  console.log("nonce:", nonce.toString());
  console.log("tx:", tx.hash);

  await tx.wait();
  console.log("BurnInitiated emitted.");

  const out = {
    l3Token: l3TokenAddress,
    from: signer.address,
    to,
    amountWei: amountWei.toString(),
    nonce: nonce.toString(),
    burnTx: tx.hash
  };

  const tmpDir = path.join(ROOT, ".tmp");
  const outPath = path.join(tmpDir, "last_withdraw_erc20.json");
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Wrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
