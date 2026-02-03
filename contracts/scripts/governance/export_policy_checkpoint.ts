/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

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

const normalizeAddress = (value?: string) => {
  if (!value) return "";
  return ethers.isAddress(value) ? ethers.getAddress(value) : "";
};

const parsePolicyKeysFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data.filter((item) => typeof item === "string");
  if (typeof data?.policyKey === "string") return [data.policyKey];
  if (Array.isArray(data?.policyKeys)) return data.policyKeys.filter((item: unknown) => typeof item === "string");
  if (Array.isArray(data?.keys)) return data.keys.filter((item: unknown) => typeof item === "string");
  return [];
};

const policyKeysFromEnv = (() => {
  const raw = readEnv("POLICY_KEYS") || "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
})();

const policyKeysFile =
  readEnv("POLICY_KEYS_FILE") ||
  process.env.POLICY_KEYS_FILE ||
  path.join(repoRoot, "ops", "governance", "chain-policy-l1.json");

const policyKeys = Array.from(
  new Set([...policyKeysFromEnv, ...parsePolicyKeysFile(policyKeysFile)].filter(Boolean))
);

const policyRegistryAddress = normalizeAddress(
  readEnv("CHAIN_POLICY_REGISTRY_ADDRESS") || readEnv("POLICY_REGISTRY_ADDRESS")
);
const policyCheckpointLayer = readEnv("POLICY_CHECKPOINT_LAYER") || "L1";
const outputDir =
  readEnv("POLICY_CHECKPOINT_OUT_DIR") ||
  path.join(repoRoot, "infra", "evidence", "out");

const toBytes32 = (value: string) => {
  if (ethers.isHexString(value, 32)) return value;
  return ethers.id(value);
};

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

async function main() {
  if (!policyRegistryAddress) {
    throw new Error("missing_policy_registry_address");
  }
  if (!policyKeys.length) {
    throw new Error("missing_policy_keys");
  }

  const [signer] = await ethers.getSigners();
  const provider = signer.provider;
  if (!provider) {
    throw new Error("missing_provider");
  }
  const network = await provider.getNetwork();

  const registry = new ethers.Contract(
    policyRegistryAddress,
    [
      "function constitutionHash() view returns (bytes32)",
      "function getPolicy(bytes32) view returns (tuple(uint256 value,uint32 version,uint64 updatedAt,bytes32 evidenceHash), tuple(uint256 value,uint64 activatesAt,bytes32 evidenceHash,bool exists), tuple(uint256 value,uint64 expiresAt,bytes32 evidenceHash,bool active))",
      "function effectivePolicy(bytes32) view returns (uint256 value,uint32 version,bool emergency,bytes32 evidenceHash,uint64 effectiveAt)"
    ],
    signer
  );

  const constitutionHash = await registry.constitutionHash();
  const policies = [];

  for (const rawKey of policyKeys) {
    const keyHash = toBytes32(rawKey);
    const [current, pending, emergency] = await registry.getPolicy(keyHash);
    const effective = await registry.effectivePolicy(keyHash);
    policies.push({
      label: ethers.isHexString(rawKey, 32) ? null : rawKey,
      key: keyHash,
      current: {
        value: current.value?.toString?.() ?? "0",
        version: Number(current.version ?? 0),
        updatedAt: Number(current.updatedAt ?? 0),
        evidenceHash: current.evidenceHash ?? ethers.ZeroHash
      },
      pending: {
        value: pending.value?.toString?.() ?? "0",
        activatesAt: Number(pending.activatesAt ?? 0),
        evidenceHash: pending.evidenceHash ?? ethers.ZeroHash,
        exists: Boolean(pending.exists)
      },
      emergency: {
        value: emergency.value?.toString?.() ?? "0",
        expiresAt: Number(emergency.expiresAt ?? 0),
        evidenceHash: emergency.evidenceHash ?? ethers.ZeroHash,
        active: Boolean(emergency.active)
      },
      effective: {
        value: effective[0]?.toString?.() ?? "0",
        version: Number(effective[1] ?? 0),
        emergency: Boolean(effective[2]),
        evidenceHash: effective[3] ?? ethers.ZeroHash,
        effectiveAt: Number(effective[4] ?? 0)
      }
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    layer: policyCheckpointLayer,
    chainId: Number(network.chainId),
    registryAddress: policyRegistryAddress,
    constitutionHash,
    keysFile: policyKeysFile,
    policies
  };

  const checkpointHash = ethers.keccak256(ethers.toUtf8Bytes(stableStringify(report)));
  const output = { ...report, checkpointHash };

  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const outPath = path.join(
    outputDir,
    `policy-checkpoint-${policyCheckpointLayer.toLowerCase()}-${stamp}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log(`checkpoint=${checkpointHash}`);
  console.log(`output=${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
