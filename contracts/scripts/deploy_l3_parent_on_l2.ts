import ghost from "@ghostchain/sdk";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type ArtifactJson = {
  abi: unknown[];
  bytecode: string;
};

const DEFAULT_CHILD_MESSENGER = "0x4200000000000000000000000000000000000007";
const DEFAULT_CHILD_STANDARD_BRIDGE = "0x4200000000000000000000000000000000000010";
const DEFAULT_CHILD_ERC721_BRIDGE = "0x4200000000000000000000000000000000000014";
const DEFAULT_BATCH_INBOX = "0x1111111111111111111111111111111111111111";
const DEFAULT_DEPLOY_GAS_LIMIT = 10_000_000n;
const DEFAULT_GAS_LIMIT = 30_000_000n;
const DEFAULT_BASE_FEE_SCALAR = 1_368n;
const DEFAULT_BLOB_BASE_FEE_SCALAR = 0n;
const CANONICAL_GAS_TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

let nextNonce: number | null = null;

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getEnv(name: string, fallback?: string): string {
  const value = getOptionalEnv(name) ?? fallback?.trim();
  if (value === undefined) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function normalizePrivateKey(raw: string): string {
  const value = raw.trim();
  const prefixed = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(prefixed)) {
    throw new Error(`Invalid private key format: expected 32-byte hex, received length ${value.length}`);
  }
  return prefixed;
}

function normalizeAddress(name: string, fallback?: string): string {
  const value = getEnv(name, fallback);
  if (!ghost.isAddress(value)) {
    throw new Error(`Invalid address for ${name}: ${value}`);
  }
  return ghost.getAddress(value);
}

function getBigIntEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return BigInt(raw);
}

async function findArtifactJsonPath(rootDir: string, name: string): Promise<string | null> {
  const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findArtifactJsonPath(fullPath, name);
      if (nested) {
        return nested;
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name !== `${name}.json`) {
      continue;
    }
    if (!rootDir.endsWith(`${name}.sol`)) {
      continue;
    }
    return fullPath;
  }
  return null;
}

async function loadArtifact(name: string): Promise<ArtifactJson> {
  const artifactsRoot = path.join(process.cwd(), "artifacts");
  const candidates = [
    path.join(artifactsRoot, "contracts", `${name}.sol`, `${name}.json`),
    path.join(artifactsRoot, "src", `${name}.sol`, `${name}.json`),
    path.join(artifactsRoot, "src", "l1custom", `${name}.sol`, `${name}.json`),
    path.join(artifactsRoot, "src", "bridge", `${name}.sol`, `${name}.json`)
  ];
  for (const artifactPath of candidates) {
    try {
      const raw = await fs.promises.readFile(artifactPath, "utf8");
      return JSON.parse(raw) as ArtifactJson;
    } catch {
      // Try next path.
    }
  }

  const discovered = await findArtifactJsonPath(artifactsRoot, name);
  if (!discovered) {
    throw new Error(`Missing artifact for ${name}; compile contracts first`);
  }

  const raw = await fs.promises.readFile(discovered, "utf8");
  return JSON.parse(raw) as ArtifactJson;
}

async function deployContract(
  signer: InstanceType<typeof ghost.Wallet>,
  provider: InstanceType<typeof ghost.JsonRpcProvider>,
  name: string,
  args: readonly unknown[],
  gasLimit: bigint
): Promise<string> {
  const artifact = await loadArtifact(name);
  const factory = new ghost.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const signerAddress = await signer.getAddress();

  if (nextNonce === null) {
    nextNonce = await provider.getTransactionCount(signerAddress, "pending");
  }

  while (true) {
    const nonce = nextNonce;
    const predictedAddress = ghost.getCreateAddress(signerAddress, BigInt(nonce));
    const predictedCode = await provider.getCode(predictedAddress);
    if (predictedCode !== "0x") {
      console.log(`${name}: CREATE(${nonce}) collides at ${predictedAddress}; consuming nonce with self-tx`);
      const bumpTx = await signer.sendTransaction({
        to: signerAddress,
        value: 0n,
        nonce,
        gasLimit: 21_000n
      });
      console.log(`nonce-bump tx: ${bumpTx.hash} nonce=${nonce}`);
      await bumpTx.wait();
      nextNonce = nonce + 1;
      continue;
    }

    try {
      const contract = await factory.deploy(...args, { nonce, gasLimit });
      const tx = contract.deploymentTransaction();
      if (tx?.hash) {
        console.log(`${name} tx: ${tx.hash} nonce=${nonce}`);
      }
      await contract.waitForDeployment();
      nextNonce = nonce + 1;
      const address = await contract.getAddress();
      console.log(`${name}: ${address}`);
      return address;
    } catch (error) {
      const message = String(
        (error as { shortMessage?: string; message?: string; info?: { error?: { message?: string } } }).shortMessage ??
          (error as { info?: { error?: { message?: string } } }).info?.error?.message ??
          (error as { message?: string }).message ??
          error
      ).toLowerCase();
      if (message.includes("contract address collision")) {
        console.log(`${name}: nonce ${nonce} collides with existing contract, advancing`);
        nextNonce = nonce + 1;
        continue;
      }
      throw error;
    }
  }
}

async function takeNonce(
  provider: InstanceType<typeof ghost.JsonRpcProvider>,
  signerAddress: string
): Promise<number> {
  if (nextNonce === null) {
    nextNonce = await provider.getTransactionCount(signerAddress, "pending");
  }
  const nonce = nextNonce;
  nextNonce += 1;
  return nonce;
}

async function artifactRecord(
  name: string,
  address: string,
  chainId: number,
  layer: string,
  version: string
) {
  const artifact = await loadArtifact(name);
  const abiHash = crypto.createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex");
  return {
    name,
    address,
    chainId,
    layer,
    abi: artifact.abi,
    abiHash,
    version,
    deployedAt: new Date().toISOString()
  };
}

async function main() {
  const rpc = process.env.RPC_L2 ?? "http://localhost:7260";
  const provider = new ghost.JsonRpcProvider(rpc, "L2");
  const privateKey = normalizePrivateKey(
    getEnv("L3_PARENT_DEPLOYER_PRIVATE_KEY", process.env.DEPLOYER_PRIVATE_KEY)
  );
  const signer = new ghost.Wallet(privateKey, provider);
  const signerAddress = await signer.getAddress();

  const outputFile = process.env.OUTPUT_FILE ?? path.join(process.cwd(), "deployments", "ghostl2", "l3-parent-on-l2.json");
  const outputDir = path.dirname(outputFile);
  const version = process.env.CONTRACTS_VERSION ?? "0.0.1";

  const unsafeBlockSigner = normalizeAddress(
    "UNSAFE_BLOCK_SIGNER",
    process.env.SEQUENCER_ADDRESS ?? signerAddress
  );
  const batcher = normalizeAddress(
    "BATCH_SENDER_ADDRESS",
    process.env.BATCHER ?? process.env.SEQUENCER_ADDRESS ?? signerAddress
  );
  const proposer = normalizeAddress("PROPOSER_ADDRESS", signerAddress);
  const childMessenger = normalizeAddress("CHILD_MESSENGER", DEFAULT_CHILD_MESSENGER);
  const childStandardBridge = normalizeAddress(
    "CHILD_STANDARD_BRIDGE",
    process.env.REMOTE_STANDARD_BRIDGE ?? DEFAULT_CHILD_STANDARD_BRIDGE
  );
  const childERC721Bridge = normalizeAddress("L1_GRC721_BRIDGE", DEFAULT_CHILD_ERC721_BRIDGE);
  const gst20Factory = normalizeAddress(
    "GST20_FACTORY",
    process.env.CANONICAL_GAS_TOKEN ?? process.env.CUSTOM_GAS_TOKEN_ADDRESS ?? CANONICAL_GAS_TOKEN
  );
  const batchInbox = normalizeAddress(
    "BATCH_INBOX_ADDRESS",
    process.env.BATCH_INBOX ?? DEFAULT_BATCH_INBOX
  );
  const gasLimit = getBigIntEnv("GAS_LIMIT", DEFAULT_GAS_LIMIT);
  const deployGasLimit = getBigIntEnv("DEPLOY_GAS_LIMIT", DEFAULT_DEPLOY_GAS_LIMIT);
  const baseFeeScalar = getBigIntEnv("BASE_FEE_SCALAR", DEFAULT_BASE_FEE_SCALAR);
  const blobBaseFeeScalar = getBigIntEnv("BLOB_BASE_FEE_SCALAR", DEFAULT_BLOB_BASE_FEE_SCALAR);
  const legacyScalar = getBigIntEnv("LEGACY_SCALAR", baseFeeScalar);

  const networkInfo = await provider.getNetwork();
  const chainId = Number(networkInfo.chainId);

  console.log("Deploying Ghost L3 parent bundle on L2", {
    deployer: signerAddress,
    chainId,
    rpc,
    batcher,
    proposer,
    unsafeBlockSigner,
    childMessenger,
    childStandardBridge,
    childERC721Bridge,
    gst20Factory,
    batchInbox
  });

  const messengerAddress = await deployContract(signer, provider, "L1CrossDomainMessenger", [childMessenger], deployGasLimit);
  const standardBridgeAddress = await deployContract(signer, provider, "StandardBridge", [
    messengerAddress,
    childStandardBridge
  ], deployGasLimit);
  const systemConfigAddress = await deployContract(signer, provider, "MockSystemConfig", [
    unsafeBlockSigner,
    messengerAddress,
    childERC721Bridge,
    standardBridgeAddress,
    ghost.ZeroAddress,
    gst20Factory,
    batchInbox,
    gasLimit,
    baseFeeScalar,
    blobBaseFeeScalar,
    legacyScalar
  ], deployGasLimit);
  const portalAddress = await deployContract(signer, provider, "L1GhostPortal", [systemConfigAddress], deployGasLimit);

  const systemConfigArtifact = await loadArtifact("MockSystemConfig");
  const systemConfig = new ghost.Contract(systemConfigAddress, systemConfigArtifact.abi, signer);
  const configureTx = await systemConfig.configure(
    unsafeBlockSigner,
    messengerAddress,
    childERC721Bridge,
    standardBridgeAddress,
    portalAddress,
    gst20Factory,
    batchInbox,
    gasLimit,
    baseFeeScalar,
    blobBaseFeeScalar,
    legacyScalar,
    {
      nonce: await takeNonce(provider, signerAddress),
      gasLimit: deployGasLimit
    }
  );
  await configureTx.wait();
  console.log(`MockSystemConfig configured for portal ${portalAddress}`);

  const outputOracleAddress = await deployContract(signer, provider, "MockL2OutputOracle", [0], deployGasLimit);
  const disputeGameFactoryAddress = await deployContract(signer, provider, "MockDisputeGameFactory", [], deployGasLimit);

  const records = await Promise.all([
    artifactRecord("L1CrossDomainMessenger", messengerAddress, chainId, "l2-parent", version),
    artifactRecord("StandardBridge", standardBridgeAddress, chainId, "l2-parent", version),
    artifactRecord("MockSystemConfig", systemConfigAddress, chainId, "l2-parent", version),
    artifactRecord("L1GhostPortal", portalAddress, chainId, "l2-parent", version),
    artifactRecord("MockL2OutputOracle", outputOracleAddress, chainId, "l2-parent", version),
    artifactRecord("MockDisputeGameFactory", disputeGameFactoryAddress, chainId, "l2-parent", version)
  ]);

  const output = {
    network: "ghostl2",
    chainId,
    layer: "l2-parent",
    rpc,
    deployer: signerAddress,
    OptimismPortalProxy: portalAddress,
    SystemConfigProxy: systemConfigAddress,
    ProtocolVersionsProxy: disputeGameFactoryAddress,
    DisputeGameFactoryProxy: disputeGameFactoryAddress,
    L2OutputOracleProxy: outputOracleAddress,
    L1StandardBridgeProxy: standardBridgeAddress,
    L1CrossDomainMessengerProxy: messengerAddress,
    portal: portalAddress,
    systemConfig: systemConfigAddress,
    protocolVersions: disputeGameFactoryAddress,
    disputeGameFactory: disputeGameFactoryAddress,
    l2OutputOracle: outputOracleAddress,
    l1StandardBridge: standardBridgeAddress,
    l1CrossDomainMessenger: messengerAddress,
    contracts: records
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote deployments to ${outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
