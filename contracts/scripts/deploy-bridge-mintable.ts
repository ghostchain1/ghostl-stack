import { ghost } from "hardhat";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

async function main() {
  const name = getEnv("TOKEN_NAME");
  const symbol = getEnv("TOKEN_SYMBOL");
  const decimals = Number(getEnv("TOKEN_DECIMALS"));
  const bridge = getEnv("BRIDGE");

  const [deployer] = await ghost.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Bridge: ${bridge}`);
  console.log(`Token: ${name} (${symbol}), decimals: ${decimals}`);

  const Token = await ghost.getContractFactory("BridgeMintableERC20");
  const token = await Token.deploy(name, symbol, decimals, bridge);
  await token.waitForDeployment();

  console.log(`BridgeMintableERC20 deployed at: ${token.target as string}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
