import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import {
  AdapterRegistryAbi,
  CircuitBreakerAbi,
  LoadBalancerVaultAbi,
  ProposalExecutorAbi,
  SettlementOracleAbi
} from "./abi.js";
import { getEnv, loadEnvFile } from "./env.js";
import { buildCall, buildExecutorBatchCalldata, writeProposalArtifacts, writeTextArtifact } from "./proposals.js";

type Cmd = "status" | "propose-adapter-add" | "propose-cap-change" | "force-settle" | "pause-adapter" | "resume-adapter" | "export-audit";

const argv = process.argv.slice(2);
const cmd = (argv[0] || "") as Cmd;

const argValue = (name: string, fallback = ""): string => {
  const idx = argv.indexOf(name);
  if (idx === -1) return fallback;
  const v = argv[idx + 1];
  if (!v) throw new Error(`missing_arg:${name}`);
  return v;
};

const hasFlag = (name: string) => argv.includes(name);

const envFile = argValue("--env-file", "services/stack.env");
const fileEnv = fs.existsSync(envFile) ? loadEnvFile(envFile) : {};

const RPC_L1 = getEnv(fileEnv, "RPC_L1", "http://localhost:18545");
const provider = new ethers.JsonRpcProvider(RPC_L1);

const LGE_VAULT = getEnv(fileEnv, "LGE_VAULT_ADDRESS", "");
const LGE_ORACLE = getEnv(fileEnv, "LGE_ORACLE_ADDRESS", "");
const LGE_ADAPTER_REGISTRY = getEnv(fileEnv, "LGE_ADAPTER_REGISTRY_ADDRESS", "");
const LGE_BREAKER = getEnv(fileEnv, "LGE_CIRCUIT_BREAKER_ADDRESS", "");
const EXECUTOR = getEnv(fileEnv, "EXECUTOR_ADDRESS_L1", "");

const adapterRegistry: any = new ethers.Contract(LGE_ADAPTER_REGISTRY, AdapterRegistryAbi, provider);
const breaker: any = new ethers.Contract(LGE_BREAKER, CircuitBreakerAbi, provider);
const vault: any = new ethers.Contract(LGE_VAULT, LoadBalancerVaultAbi, provider);
const oracle: any = new ethers.Contract(LGE_ORACLE, SettlementOracleAbi, provider);
const executor: any = EXECUTOR ? new ethers.Contract(EXECUTOR, ProposalExecutorAbi, provider) : null;

const outDir = "artifacts/governance/liquidity-gravity/proposals";

const normalizeHex = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const requestZkProof = async (url: string, payload: Record<string, unknown>, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`zk_prover_http_${res.status}`);
    const body = (await res.json()) as any;
    const proof = body?.proof;
    if (typeof proof !== "string" || !proof.trim()) throw new Error("zk_prover_invalid_response");
    const hex = normalizeHex(proof);
    if (!ethers.isHexString(hex) || hex === "0x") throw new Error("zk_prover_invalid_proof");
    return hex;
  } finally {
    clearTimeout(timer);
  }
};

async function status() {
  const adapterIds = (getEnv(fileEnv, "LGE_ADAPTER_IDS", "1") || "1")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const asset = getEnv(
    fileEnv,
    "LGE_DEPLOY_ASSET",
    getEnv(fileEnv, "LGE_SETTLEMENT_ASSET", getEnv(fileEnv, "GAS_TOKEN_ADDRESS_L1", "native"))
  ).trim();
  const assetAddr = !asset || asset === "native" ? ethers.ZeroAddress : ethers.getAddress(asset);

  const globalPaused: boolean = await breaker.paused();
  const results = [];
  for (const adapterId of adapterIds) {
    const cfg = await adapterRegistry.getAdapter(adapterId);
    const [ok, dueAt]: [boolean, bigint] = await oracle.canContinue(adapterId);
    const deployed: bigint = await vault.deployedByAdapterAsset(adapterId, assetAddr);
    const totals = await vault.assetTotals(assetAddr);
    const adapterPaused: boolean = await breaker.adapterPaused(adapterId);
    const lastSettledAt: bigint = await oracle.lastSettledAt(adapterId);
    const lastDeploymentAt: bigint = await oracle.lastDeploymentAt(adapterId);

    results.push({
      adapterId,
      externalChainId: String(cfg.externalChainId),
      operator: String(cfg.operator),
      enabled: Boolean(cfg.enabled),
      paused: Boolean(cfg.paused),
      breakerPaused: globalPaused || adapterPaused,
      canContinue: ok,
      dueAt: dueAt.toString(),
      deployed: deployed.toString(),
      idle: totals.idle.toString(),
      lastSettledAt: lastSettledAt.toString(),
      lastDeploymentAt: lastDeploymentAt.toString()
    });
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, rpc: RPC_L1, asset: assetAddr, adapters: results }, null, 2));
}

async function proposeAdapterAdd() {
  if (!EXECUTOR || !executor) throw new Error("missing_env:EXECUTOR_ADDRESS_L1");
  const adapterId = Number(argValue("--adapter"));
  const externalChainId = BigInt(argValue("--chain-id"));
  const riskTier = Number(argValue("--risk-tier", "1"));
  const maxDeployCap = BigInt(argValue("--max-cap"));
  const settlementInterval = Number(argValue("--settlement-interval"));
  const operator = ethers.getAddress(argValue("--operator"));
  const proofType = Number(argValue("--proof-type", "1"));

  const call = buildCall(LGE_ADAPTER_REGISTRY, AdapterRegistryAbi, "configureAdapter", [
    adapterId,
    {
      externalChainId,
      riskTier,
      maxDeployCap,
      settlementInterval,
      proofType,
      operator,
      paused: false,
      enabled: true,
      updatedAt: 0
    }
  ]);
  const executorCalldata = buildExecutorBatchCalldata([call]);

  const description = `LGE: add adapter ${adapterId} (chainId=${externalChainId.toString()})`;
  const payload = {
    kind: "lge.proposal",
    createdAt: new Date().toISOString(),
    description,
    executor: EXECUTOR,
    calls: [call],
    executorCalldata,
    hashes: {
      executorCalldataHash: ethers.keccak256(executorCalldata),
      payloadHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ description, calls: [call] })))
    }
  };

  const { jsonPath, prefix } = writeProposalArtifacts(outDir, `adapter-add-${adapterId}`, payload);
  const calldataPath = writeTextArtifact(outDir, prefix, "calldata.txt", executorCalldata);
  const md = `# Proposal: Add LGE Adapter\n\n- Adapter ID: \`${adapterId}\`\n- External chainId: \`${externalChainId.toString()}\`\n- Operator: \`${operator}\`\n- Max deploy cap: \`${maxDeployCap.toString()}\`\n- Settlement interval: \`${settlementInterval}\` seconds\n- Proof type: \`${proofType}\`\n\n## Executor\n\n- Executor: \`${EXECUTOR}\`\n- Calldata: \`${executorCalldata}\`\n`;
  const mdPath = writeTextArtifact(outDir, prefix, "md", md);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, jsonPath, calldataPath, mdPath }, null, 2));
}

async function proposeCapChange() {
  if (!EXECUTOR || !executor) throw new Error("missing_env:EXECUTOR_ADDRESS_L1");
  const adapterId = Number(argValue("--adapter"));
  const maxDeployCap = BigInt(argValue("--max-cap"));

  const call = buildCall(LGE_ADAPTER_REGISTRY, AdapterRegistryAbi, "setMaxDeployCap", [adapterId, maxDeployCap]);
  const executorCalldata = buildExecutorBatchCalldata([call]);
  const description = `LGE: set adapter cap ${adapterId} => ${maxDeployCap.toString()}`;

  const payload = {
    kind: "lge.proposal",
    createdAt: new Date().toISOString(),
    description,
    executor: EXECUTOR,
    calls: [call],
    executorCalldata
  };

  const { jsonPath, prefix } = writeProposalArtifacts(outDir, `cap-change-${adapterId}`, payload);
  const calldataPath = writeTextArtifact(outDir, prefix, "calldata.txt", executorCalldata);
  const md = `# Proposal: Change Adapter Cap\n\n- Adapter ID: \`${adapterId}\`\n- New max deploy cap: \`${maxDeployCap.toString()}\`\n\n## Executor\n\n- Executor: \`${EXECUTOR}\`\n- Calldata: \`${executorCalldata}\`\n`;
  const mdPath = writeTextArtifact(outDir, prefix, "md", md);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, jsonPath, calldataPath, mdPath }, null, 2));
}

async function pauseAdapter(mode: "breaker" | "registry", paused: boolean) {
  if (!EXECUTOR || !executor) throw new Error("missing_env:EXECUTOR_ADDRESS_L1");
  const adapterId = Number(argValue("--adapter"));

  const calls = [];
  if (mode === "breaker") {
    calls.push(buildCall(LGE_BREAKER, CircuitBreakerAbi, paused ? "pauseAdapter" : "unpauseAdapter", [adapterId]));
  } else {
    calls.push(buildCall(LGE_ADAPTER_REGISTRY, AdapterRegistryAbi, "setAdapterPaused", [adapterId, paused]));
  }

  const executorCalldata = buildExecutorBatchCalldata(calls);
  const description = `LGE: ${paused ? "pause" : "resume"} adapter ${adapterId} (${mode})`;
  const payload = { kind: "lge.proposal", createdAt: new Date().toISOString(), description, executor: EXECUTOR, calls, executorCalldata };

  const { jsonPath, prefix } = writeProposalArtifacts(outDir, `${paused ? "pause" : "resume"}-${mode}-${adapterId}`, payload);
  const calldataPath = writeTextArtifact(outDir, prefix, "calldata.txt", executorCalldata);
  const md = `# Proposal: ${paused ? "Pause" : "Resume"} Adapter\n\n- Adapter ID: \`${adapterId}\`\n- Mode: \`${mode}\`\n\n## Executor\n\n- Executor: \`${EXECUTOR}\`\n- Calldata: \`${executorCalldata}\`\n`;
  const mdPath = writeTextArtifact(outDir, prefix, "md", md);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, jsonPath, calldataPath, mdPath }, null, 2));
}

async function exportAudit() {
  const srcDir = argValue("--src", "artifacts/audit/liquidity-router");
  const dstDir = argValue("--out", path.join("artifacts", "audit", "exports", "liquidity-router"));
  fs.mkdirSync(dstDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const from = path.join(srcDir, name);
    const to = path.join(dstDir, name);
    fs.copyFileSync(from, to);
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, out: dstDir }, null, 2));
}

async function forceSettle() {
  const adapterId = Number(argValue("--adapter"));
  const yieldWei = BigInt(argValue("--yield", getEnv(fileEnv, "LGE_SETTLEMENT_YIELD_WEI", "0")));
  const feeWei = BigInt(argValue("--fee", getEnv(fileEnv, "LGE_SETTLEMENT_FEE_WEI", "0")));
  const assetRaw = getEnv(fileEnv, "LGE_SETTLEMENT_ASSET", getEnv(fileEnv, "GAS_TOKEN_ADDRESS_L1", ""));
  const asset = assetRaw === "native" ? ethers.ZeroAddress : ethers.getAddress(assetRaw);
  const commitment = ethers.keccak256(ethers.toUtf8Bytes(`force-settle:${Date.now()}`));

  const operatorPk = getEnv(fileEnv, "LGE_OPERATOR_PRIVATE_KEY", "");
  if (!operatorPk) throw new Error("missing_env:LGE_OPERATOR_PRIVATE_KEY");

  const signer = new ethers.Wallet(operatorPk, provider);
  const oracleWithSigner = oracle.connect(signer);
  const cfg = await adapterRegistry.getAdapter(adapterId);
  const proofType = Number(cfg.proofType);

  const sequence: bigint = (await oracleWithSigner.lastSequence(adapterId)) + 1n;
  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const validUntil = issuedAt + 60n;

  const digest: string = await oracleWithSigner.digestSettlement(
    adapterId,
    asset,
    yieldWei,
    feeWei,
    commitment,
    sequence,
    Number(issuedAt),
    Number(validUntil)
  );

  const dryRun = hasFlag("--dry-run") || !hasFlag("--execute");
  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({ ok: true, dryRun: true, adapterId, proofType, sequence: sequence.toString(), commitment, digest }, null, 2)
    );
    return;
  }

  let tx;
  if (proofType === 2) {
    const proverUrl = argValue("--zk-prover-url", "") || getEnv(fileEnv, "LGE_ZK_PROVER_URL", "");
    const proverTimeoutMs = Number(argValue("--zk-prover-timeout-ms", getEnv(fileEnv, "LGE_ZK_PROVER_TIMEOUT_MS", "5000")));

    let proof = "";
    if (proverUrl.trim()) {
      proof = await requestZkProof(
        proverUrl.trim(),
        {
          adapterId,
          digest,
          asset: asset,
          yieldWei: yieldWei.toString(),
          feeWei: feeWei.toString(),
          commitment,
          sequence: sequence.toString(),
          issuedAt: Number(issuedAt),
          validUntil: Number(validUntil)
        },
        proverTimeoutMs
      );
    } else {
      const proofRaw =
        argValue("--zk-proof", "") || getEnv(fileEnv, "LGE_ZK_PROOF_HEX", "") || getEnv(fileEnv, "LGE_ZK_PROOF", "");
      if (!proofRaw.trim()) throw new Error("missing_proof:--zk-proof or LGE_ZK_PROOF_HEX (or set --zk-prover-url)");
      proof = normalizeHex(proofRaw);
      if (!ethers.isHexString(proof) || proof === "0x") throw new Error("invalid_proof");
    }
    tx = await oracleWithSigner.submitSettlementZk(
      adapterId,
      asset,
      yieldWei,
      feeWei,
      commitment,
      sequence,
      Number(issuedAt),
      Number(validUntil),
      proof,
      asset === ethers.ZeroAddress ? { value: yieldWei + feeWei } : {}
    );
  } else {
    const relayerPks = getEnv(fileEnv, "LGE_RELAYER_PRIVATE_KEYS", "");
    if (!relayerPks) throw new Error("missing_env:LGE_RELAYER_PRIVATE_KEYS");
    const relayers = relayerPks.split(",").map((k) => new ethers.Wallet(k.trim()));
    const sigs = relayers.map((w) => w.signingKey.sign(digest).serialized);
    tx = await oracleWithSigner.submitSettlement(
      adapterId,
      asset,
      yieldWei,
      feeWei,
      commitment,
      sequence,
      Number(issuedAt),
      Number(validUntil),
      sigs,
      asset === ethers.ZeroAddress ? { value: yieldWei + feeWei } : {}
    );
  }
  const receipt = await tx.wait();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, txHash: receipt?.hash || tx.hash }, null, 2));
}

async function main() {
  if (!cmd) throw new Error("missing_command");
  if (cmd === "status") return status();
  if (cmd === "propose-adapter-add") return proposeAdapterAdd();
  if (cmd === "propose-cap-change") return proposeCapChange();
  if (cmd === "pause-adapter") return pauseAdapter((argValue("--mode", "breaker") as any) === "registry" ? "registry" : "breaker", true);
  if (cmd === "resume-adapter") return pauseAdapter((argValue("--mode", "breaker") as any) === "registry" ? "registry" : "breaker", false);
  if (cmd === "export-audit") return exportAudit();
  if (cmd === "force-settle") return forceSettle();
  throw new Error(`unknown_command:${cmd}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(String((e as any)?.message || e));
  process.exit(1);
});
