import { ethers } from "hardhat";

function parseAddresses(): Array<string> {
  const raw = process.env.FUND_ADDRESSES_JSON || "[]";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("FUND_ADDRESSES_JSON must be valid JSON array of addresses");
  }
  if (!Array.isArray(parsed)) throw new Error("FUND_ADDRESSES_JSON must be a JSON array");
  const out: Array<string> = [];
  for (const a of parsed) {
    if (typeof a !== "string" || !ethers.isAddress(a)) throw new Error(`Invalid address: ${String(a)}`);
    out.push(ethers.getAddress(a));
  }
  return Array.from(new Set(out));
}

async function main() {
  const amountEth = process.env.FUND_AMOUNT_ETH || "10";
  const amountWei = ethers.parseEther(amountEth);
  const addrs = parseAddresses();
  if (addrs.length === 0) {
    console.log("No addresses to fund.");
    return;
  }

  const [signer] = await ethers.getSigners();
  const from = await signer.getAddress();
  const net = await signer.provider!.getNetwork();

  console.log(`Funding ${addrs.length} addresses on chainId=${net.chainId.toString()} from=${from} amountEth=${amountEth}`);
  for (const to of addrs) {
    const tx = await signer.sendTransaction({ to, value: amountWei });
    await tx.wait();
    console.log(`funded ${to} tx=${tx.hash}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

