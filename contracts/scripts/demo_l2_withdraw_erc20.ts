import { ethers } from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const ROOT = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const bridgeAddress = process.env.L2_STANDARD_BRIDGE_ADDRESS;
  const localToken = process.env.L2_TOKEN_ADDRESS;
  const remoteToken = process.env.L1_TOKEN_ADDRESS;

  if (!bridgeAddress || !localToken || !remoteToken) {
    throw new Error("Missing env L2_STANDARD_BRIDGE_ADDRESS/L2_TOKEN_ADDRESS/L1_TOKEN_ADDRESS");
  }

  const [signer] = await ethers.getSigners();
  const to = process.env.DEMO_TO ?? signer.address;
  const amountGst = process.env.DEMO_AMOUNT_GST ?? process.env.DEMO_AMOUNT_ETH ?? "1";
  const amountWei = ethers.parseEther(amountGst);
  const minGasLimit = BigInt(process.env.DEMO_MIN_GAS ?? "200000");

  // For L1-native tokens represented as OptimismMintableERC20 on L2, withdrawals are initiated via
  // L2StandardBridge.withdrawTo(_l2Token, _to, _amount, _minGasLimit, _extraData).
  const MintableAbi = ["function l1Token() view returns (address)"];
  const mintable = new ethers.Contract(localToken, MintableAbi, signer);
  const mappedL1 = (await mintable.l1Token()) as string;
  if (mappedL1.toLowerCase() !== remoteToken.toLowerCase()) {
    throw new Error(
      `L2 token ${localToken} maps to L1 token ${mappedL1}, expected ${remoteToken}. Check L1_TOKEN_ADDRESS/L2_TOKEN_ADDRESS.`
    );
  }

  const L2StandardBridgeAbi = [
    "function withdrawTo(address l2Token,address to,uint256 amount,uint32 minGasLimit,bytes extraData)"
  ];
  const bridge = new ethers.Contract(bridgeAddress, L2StandardBridgeAbi, signer);

  const minGasLimit32 = Number(minGasLimit);
  if (!Number.isSafeInteger(minGasLimit32) || minGasLimit32 < 0 || minGasLimit32 > 0xffffffff) {
    throw new Error(`DEMO_MIN_GAS must fit uint32, got ${minGasLimit.toString()}`);
  }

  const tx = await bridge.withdrawTo(localToken, to, amountWei, minGasLimit32, "0x");

  console.log("bridge:", bridgeAddress);
  console.log("from:", signer.address);
  console.log("to:", to);
  console.log("amountGst:", amountGst);
  console.log("tx:", tx.hash);

  const timeoutMs = Number(process.env.DEMO_TX_TIMEOUT_MS ?? "60000");
  await Promise.race([
    tx.wait(),
    new Promise<null>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout waiting for L2 withdraw receipt after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
  console.log("BridgeInitiated emitted.");

  const out = {
    bridge: bridgeAddress,
    from: signer.address,
    to,
    amountWei: amountWei.toString(),
    withdrawTx: tx.hash
  };

  const tmpDir = path.join(ROOT, ".tmp");
  const outPath = path.join(tmpDir, "last_l1l2_withdraw_erc20.json");
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Wrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
