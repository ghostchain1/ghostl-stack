import { ethers } from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const ROOT = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const bridgeAddress = process.env.L1_STANDARD_BRIDGE_ADDRESS;
  const localToken = process.env.L1_TOKEN_ADDRESS;
  const remoteToken = process.env.L2_TOKEN_ADDRESS;

  if (!bridgeAddress || !localToken || !remoteToken) {
    throw new Error("Missing env L1_STANDARD_BRIDGE_ADDRESS/L1_TOKEN_ADDRESS/L2_TOKEN_ADDRESS");
  }

  const [signer] = await ethers.getSigners();
  const to = process.env.DEMO_TO ?? signer.address;
  const amountEth = process.env.DEMO_AMOUNT_ETH ?? "1";
  const amountWei = ethers.parseEther(amountEth);
  const minGasLimit = BigInt(process.env.DEMO_MIN_GAS ?? "200000");

  const erc20 = await ethers.getContractAt("src/common/ERC20.sol:ERC20", localToken, signer);
  const allowance = await erc20.allowance(signer.address, bridgeAddress);
  if (allowance < amountWei) {
    const approveTx = await erc20.approve(bridgeAddress, amountWei);
    await approveTx.wait();
  }

  const StandardBridgeAbi = [
    "function depositERC20To(address l1Token,address l2Token,address to,uint256 amount,uint32 minGasLimit,bytes extraData)"
  ];
  const bridge = new ethers.Contract(bridgeAddress, StandardBridgeAbi, signer);
  const minGasLimit32 = Number(minGasLimit);
  if (!Number.isSafeInteger(minGasLimit32) || minGasLimit32 < 0 || minGasLimit32 > 0xffffffff) {
    throw new Error(`DEMO_MIN_GAS must fit uint32, got ${minGasLimit.toString()}`);
  }

  const tx = await bridge.depositERC20To(
    localToken,
    remoteToken,
    to,
    amountWei,
    minGasLimit32,
    "0x"
  );

  console.log("bridge:", bridgeAddress);
  console.log("from:", signer.address);
  console.log("to:", to);
  console.log("amountEth:", amountEth);
  console.log("tx:", tx.hash);

  const timeoutMs = Number(process.env.DEMO_TX_TIMEOUT_MS ?? "60000");
  await Promise.race([
    tx.wait(),
    new Promise<null>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout waiting for L1 deposit receipt after ${timeoutMs}ms`)),
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
    depositTx: tx.hash
  };

  const tmpDir = path.join(ROOT, ".tmp");
  const outPath = path.join(tmpDir, "last_l1l2_deposit_erc20.json");
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Wrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
