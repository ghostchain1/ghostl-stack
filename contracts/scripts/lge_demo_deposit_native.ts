/* eslint-disable no-console */
import { ghost } from "hardhat";

function getEnv(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const vaultAddress = getEnv("LGE_VAULT_ADDRESS");
  const amountWeiRaw = process.env.LGE_DEPOSIT_WEI;
  const amountGstRaw = process.env.LGE_DEPOSIT_GST;
  const amountWei = amountWeiRaw
    ? BigInt(amountWeiRaw)
    : amountGstRaw
      ? ghost.parseEther(amountGstRaw)
      : ghost.parseEther("10");

  const [signer] = await ghost.getSigners();
  console.log(`Depositor: ${signer.address}`);
  console.log(`Vault: ${vaultAddress}`);
  console.log(`Deposit: ${amountWei.toString()} wei`);

  const vault = await ghost.getContractAt("LoadBalancerVault", vaultAddress);
  const tx = await vault.deposit(ghost.ZeroAddress, amountWei, { value: amountWei });
  const receipt = await tx.wait();
  console.log(`tx=${receipt?.hash || tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
