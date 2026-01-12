import { ethers } from "hardhat";

function getEnv(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

async function main() {
  const name = getEnv("TOKEN_NAME", "Test Token");
  const symbol = getEnv("TOKEN_SYMBOL", "TST");
  const decimals = Number(getEnv("TOKEN_DECIMALS", "18"));
  const mintTo = process.env.MINT_TO;
  const mintAmount = process.env.MINT_AMOUNT ? BigInt(process.env.MINT_AMOUNT) : 0n;

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Token: ${name} (${symbol}), decimals: ${decimals}`);

  const Token = await ethers.getContractFactory("TestERC20");
  const token = await Token.deploy(name, symbol, decimals);
  await token.waitForDeployment();
  console.log(`TestERC20 deployed at: ${token.target as string}`);

  if (mintTo && mintAmount > 0n) {
    const tx = await token.mint(mintTo, mintAmount);
    await tx.wait();
    console.log(`Minted ${mintAmount} to ${mintTo}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
