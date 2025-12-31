import { ethers } from "hardhat";

async function main() {
  const tokenAddress = process.env.L2_TOKEN_ADDRESS;
  const account = process.env.DEMO_ACCOUNT;
  if (!tokenAddress || !account) {
    throw new Error("Missing env L2_TOKEN_ADDRESS/DEMO_ACCOUNT (source services/ghost-guard/.env first)");
  }

  const token = await ethers.getContractAt("ERC20", tokenAddress);
  const bal = await token.balanceOf(account);
  console.log("token:", tokenAddress);
  console.log("account:", account);
  console.log("balanceWei:", bal.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

