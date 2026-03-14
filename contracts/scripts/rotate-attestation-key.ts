/**
 * rotate-attestation-key.ts
 *
 * Rotates the COMPLIANCE_ATTESTATION_PRIVATE_KEY signer across all contracts
 * that store an allowlist of authorized AI/compliance attestor addresses.
 *
 * Run with:
 *   npx hardhat run scripts/rotate-attestation-key.ts --network <anvil|ghostl2|ghostl3>
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY         — governance/owner key that can call admin functions
 *   OLD_ATTESTATION_ADDRESS      — address derived from the old (compromised) key
 *   NEW_ATTESTATION_ADDRESS      — address derived from the new key
 *   AI_ORACLE_REGISTRY_ADDRESS   — deployed AIOracleRegistry address (if set)
 *   AI_ATTESTATION_BASE_ADDRESS  — deployed AIAttestationBase address (if set)
 *   AI_COMMAND_CENTER_ADDRESS    — deployed AICommandCenter address (if set)
 *   AI_ATTESTATION_HUB_L1       — deployed AIAttestationHub on L1 (if set)
 *   AI_ATTESTATION_HUB_L2       — deployed AIAttestationHub on L2 (if set)
 *   AI_ATTESTATION_HUB_L3       — deployed AIAttestationHub on L3 (if set)
 */

import { ghost } from "hardhat";

// AIOracleRegistry ABI (subset needed for rotation)
const ORACLE_REGISTRY_ABI = [
  "function rotateSigner(address oldSigner, address newSigner, uint32 signerType, string calldata metadataURI) external",
  "function registerSigner(address signer, uint32 signerType, string calldata metadataURI) external",
  "function setSignerStatus(address signer, bool allowed, uint32 signerType, string calldata metadataURI) external",
  "function isAllowed(address signer) external view returns (bool)",
];

// AIAttestationBase / AICommandCenter ABI (setSigner pattern)
const ATTESTATION_BASE_ABI = [
  "function setSigner(address signer, bool allowed) external",
  "function aiSigners(address) external view returns (bool)",
];

// AICommandCenter uses same pattern
const COMMAND_CENTER_ABI = [
  "function setSigner(address signer, bool allowed) external",
  "function aiSigners(address) external view returns (bool)",
];

async function main() {
  const [deployer] = await ghost.getSigners();
  console.log(`[rotate-attestation-key] deployer: ${deployer.address}`);

  const OLD_ADDR = process.env.OLD_ATTESTATION_ADDRESS;
  const NEW_ADDR = process.env.NEW_ATTESTATION_ADDRESS;

  if (!OLD_ADDR || !NEW_ADDR) {
    throw new Error(
      "Set OLD_ATTESTATION_ADDRESS and NEW_ATTESTATION_ADDRESS env vars.\n" +
        "  OLD = address derived from old (compromised) key: 0x369c64...2187\n" +
        "  NEW = address derived from new key"
    );
  }

  console.log(`  OLD signer: ${OLD_ADDR}`);
  console.log(`  NEW signer: ${NEW_ADDR}`);

  let rotated = 0;

  // ── 1. AIOracleRegistry ────────────────────────────────────────────────────
  const registryAddr = process.env.AI_ORACLE_REGISTRY_ADDRESS;
  if (registryAddr) {
    console.log(`\n[AIOracleRegistry] @ ${registryAddr}`);
    const registry = new ghost.Contract(registryAddr, ORACLE_REGISTRY_ABI, deployer);

    // rotateSigner atomically disables old + registers new
    const tx = await registry.rotateSigner(
      OLD_ADDR,
      NEW_ADDR,
      1, // signerType: 1 = COMPLIANCE_AI
      "rotated:2026-03-03:pr4-exposure"
    );
    await tx.wait();
    console.log(`  ✅ rotateSigner tx: ${tx.hash}`);
    rotated++;
  } else {
    console.log("\n[AIOracleRegistry] skipped — AI_ORACLE_REGISTRY_ADDRESS not set");
  }

  // ── 2. AIAttestationBase derivatives ──────────────────────────────────────
  const baseAddr = process.env.AI_ATTESTATION_BASE_ADDRESS;
  if (baseAddr) {
    console.log(`\n[AIAttestationBase] @ ${baseAddr}`);
    const base = new ghost.Contract(baseAddr, ATTESTATION_BASE_ABI, deployer);

    const wasAllowed = await base.aiSigners(OLD_ADDR);
    if (wasAllowed) {
      const tx1 = await base.setSigner(OLD_ADDR, false);
      await tx1.wait();
      console.log(`  revoked old signer tx: ${tx1.hash}`);
    } else {
      console.log(`  old signer was not active — skipping revoke`);
    }

    const tx2 = await base.setSigner(NEW_ADDR, true);
    await tx2.wait();
    console.log(`  ✅ authorized new signer tx: ${tx2.hash}`);
    rotated++;
  } else {
    console.log("\n[AIAttestationBase] skipped — AI_ATTESTATION_BASE_ADDRESS not set");
  }

  // ── 3. AICommandCenter ────────────────────────────────────────────────────
  const cmdAddr = process.env.AI_COMMAND_CENTER_ADDRESS;
  if (cmdAddr) {
    console.log(`\n[AICommandCenter] @ ${cmdAddr}`);
    const cmd = new ghost.Contract(cmdAddr, COMMAND_CENTER_ABI, deployer);

    const wasAllowed = await cmd.aiSigners(OLD_ADDR);
    if (wasAllowed) {
      const tx1 = await cmd.setSigner(OLD_ADDR, false);
      await tx1.wait();
      console.log(`  revoked old signer tx: ${tx1.hash}`);
    }

    const tx2 = await cmd.setSigner(NEW_ADDR, true);
    await tx2.wait();
    console.log(`  ✅ authorized new signer tx: ${tx2.hash}`);
    rotated++;
  } else {
    console.log("\n[AICommandCenter] skipped — AI_COMMAND_CENTER_ADDRESS not set");
  }

  // ── 4. AIAttestationHub (per-layer) ───────────────────────────────────────
  // AIAttestationHub uses AIOracleRegistry for signer checks — covered by step 1.
  // If the registry is shared, no extra step needed here.
  for (const [envKey, label] of [
    ["AI_ATTESTATION_HUB_L1", "AIAttestationHub(L1)"],
    ["AI_ATTESTATION_HUB_L2", "AIAttestationHub(L2)"],
    ["AI_ATTESTATION_HUB_L3", "AIAttestationHub(L3)"],
  ] as const) {
    const hubAddr = process.env[envKey];
    if (hubAddr) {
      // Hub delegates signer checks to its AIOracleRegistry — covered by step 1.
      console.log(`\n[${label}] @ ${hubAddr} — signer auth delegated to registry ✅`);
    }
  }

  console.log(`\n[rotate-attestation-key] done — ${rotated} contract(s) updated`);

  if (rotated === 0) {
    console.warn(
      "\n⚠️  No contracts were updated — set the address env vars for deployed contracts.\n" +
        "   This script is a no-op until contract addresses are provided."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
