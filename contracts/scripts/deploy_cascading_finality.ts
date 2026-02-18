import { ethers, network } from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!ethers.isAddress(trimmed)) {
    throw new Error(`invalid address: ${trimmed}`);
  }
  return ethers.getAddress(trimmed);
}

function ensureBytes32(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!ethers.isHexString(trimmed, 32)) {
    throw new Error(`${label} must be a 32-byte hex value`);
  }
  return trimmed;
}

async function assertCode(provider: ethers.Provider, address: string, label: string): Promise<void> {
  const code = await provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`No code at ${label} address ${address}`);
  }
}

async function hasCode(provider: ethers.Provider, address: string): Promise<boolean> {
  const code = await provider.getCode(address);
  return !!code && code !== "0x";
}

async function main() {
  const root = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const outputDir = process.env.OUTPUT_DIR ?? path.resolve(__dirname, "..", "deployments", network.name);
  const tmpPath = path.join(root, ".tmp", `last_cascading_finality_${network.name}.json`);
  const deploymentPath = path.join(outputDir, "cascading-finality.json");

  const [deployer] = await ethers.getSigners();
  if (!deployer?.provider) {
    throw new Error("missing provider (check hardhat network RPC config)");
  }

  const provider = deployer.provider as ethers.Provider;
  const net = await provider.getNetwork();
  const governanceExecutor = normalizeAddress(process.env.GOVERNANCE_EXECUTOR) ?? deployer.address;
  const governanceTimelock = normalizeAddress(process.env.GOVERNANCE_TIMELOCK) ?? ethers.ZeroAddress;
  const aiPolicyHash = ensureBytes32(process.env.AI_POLICY_HASH, "AI_POLICY_HASH");
  const autoAcceptPolicyHash = parseBool(process.env.AUTO_ACCEPT_POLICY_HASH, true);
  const enforceHierarchicalFinality = parseBool(process.env.ENFORCE_HIERARCHICAL_FINALITY, true);

  const bridgeAddress = normalizeAddress(process.env.L2L3_BRIDGE_ADDRESS ?? process.env.BRIDGE_L2L3_ADDRESS);
  const l2OnL1RollupAddress = normalizeAddress(process.env.ROLLUP_L2_L1_ADDRESS ?? process.env.L1_ROLLUP_L2_ADDRESS);
  const l3OnL2RollupAddress = normalizeAddress(process.env.ROLLUP_L3_L2_ADDRESS ?? process.env.L2_ROLLUP_L3_ADDRESS);

  let l1OracleAddress = normalizeAddress(process.env.L1_FINALITY_ORACLE_ADDRESS);
  let l2OracleAddress = normalizeAddress(process.env.L2_FINALITY_ORACLE_ADDRESS);
  let l3OracleAddress = normalizeAddress(process.env.L3_FINALITY_ORACLE_ADDRESS);

  console.log("network:", { name: network.name, chainId: Number(net.chainId) });
  console.log("deployer:", deployer.address);
  console.log("governance:", { executor: governanceExecutor, timelock: governanceTimelock });

  const L1OracleFactory = await ethers.getContractFactory("L1FinalityOracle", deployer);
  const L2OracleFactory = await ethers.getContractFactory("L2FinalityOracle", deployer);
  const L3OracleFactory = await ethers.getContractFactory("L3FinalityOracle", deployer);

  if (l1OracleAddress) {
    await assertCode(provider, l1OracleAddress, "L1FinalityOracle");
  } else {
    const l1Oracle = await L1OracleFactory.deploy(governanceExecutor, governanceTimelock);
    await l1Oracle.waitForDeployment();
    l1OracleAddress = await l1Oracle.getAddress();
    console.log("L1FinalityOracle:", l1OracleAddress);
  }

  if (l2OracleAddress) {
    await assertCode(provider, l2OracleAddress, "L2FinalityOracle");
  } else {
    const l2Oracle = await L2OracleFactory.deploy(governanceExecutor, governanceTimelock, l1OracleAddress);
    await l2Oracle.waitForDeployment();
    l2OracleAddress = await l2Oracle.getAddress();
    console.log("L2FinalityOracle:", l2OracleAddress);
  }

  if (l3OracleAddress) {
    await assertCode(provider, l3OracleAddress, "L3FinalityOracle");
  } else {
    const l3Oracle = await L3OracleFactory.deploy(governanceExecutor, governanceTimelock, l1OracleAddress, l2OracleAddress);
    await l3Oracle.waitForDeployment();
    l3OracleAddress = await l3Oracle.getAddress();
    console.log("L3FinalityOracle:", l3OracleAddress);
  }

  if (!l1OracleAddress || !l2OracleAddress || !l3OracleAddress) {
    throw new Error("failed to resolve cascading finality oracle addresses");
  }

  if (aiPolicyHash && autoAcceptPolicyHash) {
    const l1Oracle = (await ethers.getContractAt("L1FinalityOracle", l1OracleAddress, deployer)) as any;
    const alreadyAccepted = await l1Oracle.acceptedPolicyHash(aiPolicyHash);
    if (!alreadyAccepted) {
      const tx = await l1Oracle.setAcceptedPolicyHash(aiPolicyHash, true);
      await tx.wait();
      console.log("Accepted AI policy hash on L1FinalityOracle:", aiPolicyHash);
    }
  }

  const rollupL2ParentOracle = normalizeAddress(process.env.ROLLUP_L2_PARENT_ORACLE_ADDRESS) ?? l2OracleAddress;
  const rollupL3ParentOracle = normalizeAddress(process.env.ROLLUP_L3_PARENT_ORACLE_ADDRESS) ?? l3OracleAddress;
  const skippedWiring: Array<{ target: string; reason: string }> = [];

  if (bridgeAddress) {
    if (!(await hasCode(provider, bridgeAddress))) {
      const reason = "address has no bytecode on selected network";
      console.warn(`Skipping bridge wiring (${bridgeAddress}): ${reason}`);
      skippedWiring.push({ target: "bridge", reason });
    } else {
      const bridge = (await ethers.getContractAt("L2L3Bridge", bridgeAddress, deployer)) as any;
      let bridgeCompatible = true;
      try {
        await bridge.l2FinalityOracle();
        await bridge.l3FinalityOracle();
        await bridge.enforceHierarchicalFinality();
      } catch {
        bridgeCompatible = false;
      }

      if (!bridgeCompatible) {
        const reason = "contract is ABI-incompatible with cascading finality bridge interface";
        console.warn(`Skipping bridge wiring (${bridgeAddress}): ${reason}`);
        skippedWiring.push({ target: "bridge", reason });
      } else {
        const currentL2Oracle = ethers.getAddress(await bridge.l2FinalityOracle());
        if (currentL2Oracle !== l2OracleAddress) {
          const tx = await bridge.setL2FinalityOracle(l2OracleAddress);
          await tx.wait();
          console.log(`Bridge wired L2FinalityOracle -> ${l2OracleAddress}`);
        }

        const currentL3Oracle = ethers.getAddress(await bridge.l3FinalityOracle());
        if (currentL3Oracle !== l3OracleAddress) {
          const tx = await bridge.setL3FinalityOracle(l3OracleAddress);
          await tx.wait();
          console.log(`Bridge wired L3FinalityOracle -> ${l3OracleAddress}`);
        }

        const currentEnforcement = Boolean(await bridge.enforceHierarchicalFinality());
        if (currentEnforcement !== enforceHierarchicalFinality) {
          const tx = await bridge.setEnforceHierarchicalFinality(enforceHierarchicalFinality);
          await tx.wait();
          console.log(`Bridge enforceHierarchicalFinality -> ${enforceHierarchicalFinality}`);
        }
      }
    }
  }

  if (l2OnL1RollupAddress) {
    if (!(await hasCode(provider, l2OnL1RollupAddress))) {
      const reason = "address has no bytecode on selected network";
      console.warn(`Skipping rollup L2->L1 wiring (${l2OnL1RollupAddress}): ${reason}`);
      skippedWiring.push({ target: "rollupL2L1", reason });
    } else {
      const l2Rollup = (await ethers.getContractAt("OptimisticRollup", l2OnL1RollupAddress, deployer)) as any;
      let rollupCompatible = true;
      let currentParent = ethers.ZeroAddress;
      try {
        currentParent = ethers.getAddress(await l2Rollup.parentFinalityOracle());
      } catch {
        rollupCompatible = false;
      }

      if (!rollupCompatible) {
        const reason = "contract is ABI-incompatible with OptimisticRollup parent-finality interface";
        console.warn(`Skipping rollup L2->L1 wiring (${l2OnL1RollupAddress}): ${reason}`);
        skippedWiring.push({ target: "rollupL2L1", reason });
      } else if (currentParent !== rollupL2ParentOracle) {
        const tx = await l2Rollup.setParentFinalityOracle(rollupL2ParentOracle);
        await tx.wait();
        console.log(`Rollup L2->L1 parentFinalityOracle -> ${rollupL2ParentOracle}`);
      }
    }
  }

  if (l3OnL2RollupAddress) {
    if (!(await hasCode(provider, l3OnL2RollupAddress))) {
      const reason = "address has no bytecode on selected network";
      console.warn(`Skipping rollup L3->L2 wiring (${l3OnL2RollupAddress}): ${reason}`);
      skippedWiring.push({ target: "rollupL3L2", reason });
    } else {
      const l3Rollup = (await ethers.getContractAt("OptimisticRollup", l3OnL2RollupAddress, deployer)) as any;
      let rollupCompatible = true;
      let currentParent = ethers.ZeroAddress;
      try {
        currentParent = ethers.getAddress(await l3Rollup.parentFinalityOracle());
      } catch {
        rollupCompatible = false;
      }

      if (!rollupCompatible) {
        const reason = "contract is ABI-incompatible with OptimisticRollup parent-finality interface";
        console.warn(`Skipping rollup L3->L2 wiring (${l3OnL2RollupAddress}): ${reason}`);
        skippedWiring.push({ target: "rollupL3L2", reason });
      } else if (currentParent !== rollupL3ParentOracle) {
        const tx = await l3Rollup.setParentFinalityOracle(rollupL3ParentOracle);
        await tx.wait();
        console.log(`Rollup L3->L2 parentFinalityOracle -> ${rollupL3ParentOracle}`);
      }
    }
  }

  const out = {
    network: network.name,
    chainId: Number(net.chainId),
    deployer: deployer.address,
    governanceExecutor,
    governanceTimelock,
    aiPolicyHash,
    enforceHierarchicalFinality,
    oracles: {
      l1: l1OracleAddress,
      l2: l2OracleAddress,
      l3: l3OracleAddress
    },
    wiring: {
      bridge: bridgeAddress ?? null,
      rollupL2L1: l2OnL1RollupAddress ?? null,
      rollupL3L2: l3OnL2RollupAddress ?? null,
      rollupL2ParentOracle,
      rollupL3ParentOracle,
      skipped: skippedWiring
    },
    generatedAt: new Date().toISOString()
  };

  await fs.mkdir(path.dirname(tmpPath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(deploymentPath, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log("Wrote:", tmpPath);
  console.log("Wrote:", deploymentPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
