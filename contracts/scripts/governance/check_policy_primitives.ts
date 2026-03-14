/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ghost } from "hardhat";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_REPORT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "policy_primitives_status.json"
);

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const out: Record<string, string> = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
};

const envFilePath =
  process.env.STACK_ENV_FILE || path.join(repoRoot, "services", "stack.env");
const fileEnv = loadEnvFile(envFilePath);
const readEnv = (key: string) => process.env[key] ?? fileEnv[key];

const normalize = (value?: string) => {
  if (!value) return "";
  return ghost.isAddress(value) ? ghost.getAddress(value) : "";
};

const expectedConstitutionHash = readEnv("CONSTITUTION_HASH") || "";
const expectedExecutor = normalize(
  readEnv("AI_CONSTITUTION_EXECUTOR") || readEnv("PROPOSAL_EXECUTOR_ADDRESS") || ""
);
const aiProposalExecutorAddress = normalize(readEnv("AI_PROPOSAL_EXECUTOR_ADDRESS"));
const evidenceVaultAddress = normalize(readEnv("EVIDENCE_VAULT_ADDRESS"));
const chainPolicyRegistryAddress = normalize(readEnv("CHAIN_POLICY_REGISTRY_ADDRESS"));
const agentPolicyRegistryAddress = normalize(
  readEnv("POLICY_REGISTRY_ADDRESS") || readEnv("AGENT_POLICY_CONTRACT") || ""
);

const policyRole = readEnv("POLICY_ROLE") || "L2_AI_MONITOR";

const POLICY_ROLE_HASH = (() => {
  try {
    return ghost.isHexString(policyRole, 32) ? policyRole : ghost.id(policyRole);
  } catch {
    return "";
  }
})();

const reportPath = process.env.POLICY_PRIMITIVES_REPORT || DEFAULT_REPORT_PATH;

const toAddress = (label: string, value: string) => {
  if (!value || !ghost.isAddress(value)) return "";
  return ghost.getAddress(value);
};

async function main() {
  const [signer] = await ghost.getSigners();
  const provider = signer.provider;
  if (!provider) {
    throw new Error("missing_provider");
  }
  const network = await provider.getNetwork();

  const codeAt = async (address: string) => {
    if (!address) return { address, codePresent: false };
    const code = await provider.getCode(address);
    return { address, codePresent: code !== "0x" };
  };

  const tryExecutorProbe = async (address: string) => {
    if (!address || !ghost.isAddress(address)) return null;
    try {
      const executor = new ghost.Contract(
        address,
        ["function delay() view returns (uint256)", "function queueLength() view returns (uint256)"],
        signer
      );
      const delay = await executor.delay();
      const queueLength = await executor.queueLength();
      return { delay: delay.toString(), queueLength: queueLength.toString() };
    } catch {
      return null;
    }
  };

  const registryAbi = [
    "function constitutionHash() view returns (bytes32)",
    "function governor() view returns (address)",
    "function timelock() view returns (address)"
  ];
  const evidenceAbi = [
    "function constitutionHash() view returns (bytes32)",
    "function governor() view returns (address)",
    "function timelock() view returns (address)",
    "function submitters(address) view returns (bool)"
  ];
  const executorAbi = [
    "function constitutionHash() view returns (bytes32)",
    "function governor() view returns (address)",
    "function timelock() view returns (address)",
    "function policyRegistry() view returns (address)",
    "function evidenceVault() view returns (address)",
    "function constitutionalGuard() view returns (address)",
    "function minApprovals() view returns (uint256)",
    "function signerSetHash() view returns (bytes32)",
    "function maxUpdateAge() view returns (uint64)"
  ];
  const guardAbi = [
    "function constitution() view returns (address)",
    "function constitutionLocked() view returns (bool)",
    "function governor() view returns (address)",
    "function timelock() view returns (address)"
  ];
  const constitutionAbi = [
    "function governance() view returns (address)",
    "function verifierAgent() view returns (address)",
    "function zkVerifier() view returns (address)"
  ];
  const agentPolicyAbi = [
    "function governor() view returns (address)",
    "function timelock() view returns (address)",
    "function rolePolicies(bytes32) view returns (bytes32 policyHash,bool enabled,uint64 updatedAt)"
  ];

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    chainId: Number(network.chainId),
    stackEnv: envFilePath,
    addresses: {
      aiProposalExecutor: aiProposalExecutorAddress || null,
      evidenceVault: evidenceVaultAddress || null,
      chainPolicyRegistry: chainPolicyRegistryAddress || null,
      agentPolicyRegistry: agentPolicyRegistryAddress || null,
      expectedConstitutionHash: expectedConstitutionHash || null
    },
    checks: {}
  };

  const checks = report.checks as Record<string, unknown>;

  if (chainPolicyRegistryAddress) {
    const code = await codeAt(chainPolicyRegistryAddress);
    const registry = new ghost.Contract(chainPolicyRegistryAddress, registryAbi, signer);
    const constitutionHash = await registry.constitutionHash();
    const governor = await registry.governor();
    const timelock = await registry.timelock();
    checks.policyRegistry = {
      ...code,
      constitutionHash,
      governor,
      timelock,
      governorMatchesExpected: expectedExecutor ? governor === expectedExecutor : null,
      matchesConstitution: expectedConstitutionHash
        ? constitutionHash.toLowerCase() === expectedConstitutionHash.toLowerCase()
        : null
    };
  }

  if (evidenceVaultAddress) {
    const code = await codeAt(evidenceVaultAddress);
    const vault = new ghost.Contract(evidenceVaultAddress, evidenceAbi, signer);
    const constitutionHash = await vault.constitutionHash();
    const governor = await vault.governor();
    const timelock = await vault.timelock();
    const submitterAllowed = aiProposalExecutorAddress
      ? await vault.submitters(aiProposalExecutorAddress)
      : null;
    checks.evidenceVault = {
      ...code,
      constitutionHash,
      governor,
      timelock,
      governorMatchesExpected: expectedExecutor ? governor === expectedExecutor : null,
      submitterAllowed,
      matchesConstitution: expectedConstitutionHash
        ? constitutionHash.toLowerCase() === expectedConstitutionHash.toLowerCase()
        : null
    };
  }

  let guardAddress = "";
  if (aiProposalExecutorAddress) {
    const code = await codeAt(aiProposalExecutorAddress);
    const executor = new ghost.Contract(aiProposalExecutorAddress, executorAbi, signer);
    const constitutionHash = await executor.constitutionHash();
    const governor = await executor.governor();
    const timelock = await executor.timelock();
    const policyRegistry = await executor.policyRegistry();
    const evidenceVault = await executor.evidenceVault();
    guardAddress = await executor.constitutionalGuard();
    const minApprovals = await executor.minApprovals();
    const signerSetHash = await executor.signerSetHash();
    const maxUpdateAge = await executor.maxUpdateAge();
    checks.aiProposalExecutor = {
      ...code,
      constitutionHash,
      governor,
      timelock,
      governorMatchesExpected: expectedExecutor ? governor === expectedExecutor : null,
      policyRegistry,
      evidenceVault,
      constitutionalGuard: guardAddress,
      minApprovals: minApprovals.toString(),
      signerSetHash,
      maxUpdateAge: maxUpdateAge.toString(),
      matchesConstitution: expectedConstitutionHash
        ? constitutionHash.toLowerCase() === expectedConstitutionHash.toLowerCase()
        : null
    };
  }

  if (guardAddress && ghost.isAddress(guardAddress)) {
    const code = await codeAt(guardAddress);
    const guard = new ghost.Contract(guardAddress, guardAbi, signer);
    const constitution = await guard.constitution();
    const locked = await guard.constitutionLocked();
    const governor = await guard.governor();
    const timelock = await guard.timelock();
    checks.constitutionalGuard = {
      ...code,
      constitution,
      constitutionLocked: locked,
      governor,
      timelock
    };
    if (constitution && ghost.isAddress(constitution)) {
      const constitutionContract = new ghost.Contract(constitution, constitutionAbi, signer);
      const governance = await constitutionContract.governance();
      const verifierAgent = await constitutionContract.verifierAgent();
      const zkVerifier = await constitutionContract.zkVerifier();
      checks.ghostConstitution = {
        address: constitution,
        governance,
        verifierAgent,
        zkVerifier
      };
    }
    if (checks.aiProposalExecutor && (checks.aiProposalExecutor as any).governor) {
      const probe = await tryExecutorProbe((checks.aiProposalExecutor as any).governor as string);
      if (probe) {
        (checks.aiProposalExecutor as any).governorExecutorProbe = probe;
      }
    }
  }

  if (agentPolicyRegistryAddress) {
    const code = await codeAt(agentPolicyRegistryAddress);
    const policy = new ghost.Contract(agentPolicyRegistryAddress, agentPolicyAbi, signer);
    const governor = await policy.governor();
    const timelock = await policy.timelock();
    let rolePolicy = null;
    if (POLICY_ROLE_HASH && ghost.isHexString(POLICY_ROLE_HASH, 32)) {
      const rp = await policy.rolePolicies(POLICY_ROLE_HASH);
      rolePolicy = {
        roleHash: POLICY_ROLE_HASH,
        policyHash: rp.policyHash,
        enabled: rp.enabled,
        updatedAt: rp.updatedAt.toString()
      };
    }
    checks.agentPolicyRegistry = {
      ...code,
      governor,
      timelock,
      rolePolicy
    };
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`[policy] wrote status report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
