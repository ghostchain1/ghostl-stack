/* eslint-disable no-console */
import { ethers } from "hardhat";

function getEnv(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const vaultAddress = getEnv("LGE_VAULT_ADDRESS");
  const amountWeiRaw = process.env.LGE_DEPOSIT_WEI;
  const amountEthRaw = process.env.LGE_DEPOSIT_ETH;
  const amountWei = amountWeiRaw
    ? BigInt(amountWeiRaw)
    : amountEthRaw
      ? ethers.parseEther(amountEthRaw)
      : ethers.parseEther("10");

  const [signer] = await ethers.getSigners();
  console.log(`Depositor: ${signer.address}`);
  console.log(`Vault: ${vaultAddress}`);
  console.log(`Deposit: ${amountWei.toString()} wei`);

  const vault = await ethers.getContractAt("LoadBalancerVault", vaultAddress);
  const tx = await vault.deposit(ethers.ZeroAddress, amountWei, { value: amountWei });
  const receipt = await tx.wait();
  console.log(`tx=${receipt?.hash || tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

