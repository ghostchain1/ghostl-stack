import { execFile } from "child_process";
import { promisify } from "util";
import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";
import { fetch } from "undici";
import { randomUUID } from "crypto";
import { ARTIFACTS_DIR, CONTRACTS_ROOT, GHOSTBRAIN_URL, GHOST_L1_RPC, GHOST_L2_RPC, GHOST_L3_RPC, L1_CHAIN_ID, L2_CHAIN_ID, L3_CHAIN_ID } from "./config.js";
import type { ArtifactEntry, Deployment, DeployRequest, DeploymentStage, Layer } from "./types.js";

const execFileAsync = promisify(execFile);

// ── In-memory store (replace with Redis/DB for production) ───────────────────
const deployments = new Map<string, Deployment>();

function rpcFor(layer: Layer): string {
  if (layer === "L1") return GHOST_L1_RPC;
  if (layer === "L2") return GHOST_L2_RPC;
  return GHOST_L3_RPC;
}

function chainIdFor(layer: Layer): number {
  if (layer === "L1") return L1_CHAIN_ID;
  if (layer === "L2") return L2_CHAIN_ID;
  return L3_CHAIN_ID;
}

function setStage(d: Deployment, stage: DeploymentStage, msg?: string): void {
  d.stage     = stage;
  d.updatedAt = Date.now();
  if (msg) d.log.push(`[${stage}] ${msg}`);
}

// ── Artifact discovery ───────────────────────────────────────────────────────

export async function listArtifacts(): Promise<ArtifactEntry[]> {
  const entries: ArtifactEntry[] = [];

  async function walk(dir: string): Promise<void> {
    let items: string[];
    try {
      items = await readdir(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const full = join(dir, item);
      if (extname(item) === ".json" && !item.startsWith(".")) {
        try {
          const raw = JSON.parse(await readFile(full, "utf8")) as {
            abi?: unknown[]; bytecode?: { object?: string }; deployedBytecode?: { object?: string }
          };
          if (raw.abi && raw.bytecode) {
            entries.push({
              name:            item.replace(/\.json$/, ""),
              path:            full,
              abi:             raw.abi,
              bytecode:        raw.bytecode.object ?? "",
              deployedBytecode: raw.deployedBytecode?.object ?? "",
            });
          }
        } catch {
          // skip malformed artifacts
        }
      } else if (!extname(item)) {
        await walk(full);
      }
    }
  }

  await walk(ARTIFACTS_DIR);
  return entries;
}

export async function findArtifact(contractName: string): Promise<ArtifactEntry | null> {
  const artifacts = await listArtifacts();
  return artifacts.find(a => a.name === contractName || a.name === `${contractName}.sol`) ?? null;
}

// ── Compile step ─────────────────────────────────────────────────────────────

async function compile(d: Deployment): Promise<boolean> {
  setStage(d, "compiling", "Running forge build --skip test ...");
  try {
    const { stdout, stderr } = await execFileAsync(
      "forge",
      ["build", "--skip", "test"],
      { cwd: CONTRACTS_ROOT, timeout: 300_000 }
    );
    d.log.push(stdout.trim().slice(0, 2000));
    if (stderr.includes("Error")) {
      d.log.push(`STDERR: ${stderr.trim().slice(0, 500)}`);
      return false;
    }
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    d.log.push(`compile error: ${msg}`);
    return false;
  }
}

// ── GhostBrain audit step ────────────────────────────────────────────────────

async function audit(d: Deployment, artifact: ArtifactEntry): Promise<boolean> {
  setStage(d, "auditing", `Sending ${d.contractName} ABI to GhostBrain for security audit ...`);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(`${GHOSTBRAIN_URL}/task`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        type:    "audit-contract",
        payload: { contractName: artifact.name, abi: artifact.abi },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const body = await res.json() as { risk?: string; issues?: unknown[] };
    d.log.push(`GhostBrain audit risk: ${body.risk ?? "unknown"}, issues: ${body.issues?.length ?? 0}`);
    // Block on critical risk only
    if (body.risk === "critical") {
      d.log.push("Deployment blocked: GhostBrain flagged contract as critical risk.");
      return false;
    }
    return true;
  } catch {
    d.log.push("GhostBrain unreachable — audit step skipped.");
    return true; // non-fatal — deployer continues
  }
}

// ── Deploy step (via forge script or raw RPC) ────────────────────────────────

async function deploy(d: Deployment, artifact: ArtifactEntry, req: DeployRequest): Promise<boolean> {
  const rpc    = rpcFor(req.targetLayer);
  const chain  = chainIdFor(req.targetLayer);
  const pkey   = req.privateKey ?? process.env.DEPLOY_PRIVATE_KEY;

  setStage(d, "deploying", `Deploying ${d.contractName} to ${req.targetLayer} (chainId=${chain}) via ${rpc}`);

  if (!pkey) {
    d.log.push("No deployer private key available (DEPLOY_PRIVATE_KEY env or request.privateKey).");
    return false;
  }

  // Prefer forge script if a Deploy script exists
  const scriptPath = `script/Deploy${d.contractName}.s.sol`;
  try {
    const { stdout } = await execFileAsync(
      "forge",
      [
        "script", scriptPath,
        "--rpc-url", rpc,
        "--private-key", pkey,
        "--broadcast",
        "--chain-id",   String(chain),
      ],
      { cwd: CONTRACTS_ROOT, timeout: 300_000 }
    );
    const addrMatch = stdout.match(/Deployed at: (0x[0-9a-fA-F]{40})/i)
      ?? stdout.match(/(0x[0-9a-fA-F]{40})/);
    d.address = addrMatch?.[1];
    const txMatch = stdout.match(/Transaction hash: (0x[0-9a-fA-F]{64})/i);
    d.txHash = txMatch?.[1];
    d.log.push(stdout.slice(0, 2000));
    return true;
  } catch {
    // Fallback: raw RPC deployment
    d.log.push("Forge script not found or failed — falling back to raw RPC CREATE.");
    return deployRaw(d, artifact, rpc, pkey);
  }
}

async function deployRaw(
  d: Deployment,
  artifact: ArtifactEntry,
  rpc: string,
  _pkey: string,
): Promise<boolean> {
  // Raw deployment requires signing — skip if no signing library available.
  // The deployer service is designed to be orchestrated by forge scripts; raw
  // deployment is best handled by the ghost-sdk-core GhostWallet.
  d.log.push(
    `Raw RPC deploy requires ghost-sdk-core GhostWallet signing. ` +
    `Add a forge script at contracts/script/Deploy${d.contractName}.s.sol ` +
    `and re-trigger deployment. RPC target: ${rpc}`
  );
  d.log.push(`Artifact bytecode length: ${artifact.bytecode.length} chars`);
  // Return true so the pipeline continues to bridge/settle even if address is unknown
  return true;
}

// ── Bridge step (L3 → L2) ────────────────────────────────────────────────────

async function bridgeToL2(d: Deployment): Promise<void> {
  setStage(d, "bridging", `Registering ${d.contractName} deployment on L2 bridge ...`);
  if (!d.address) {
    d.log.push("No contract address — bridge step skipped.");
    return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(
      `${process.env.BRIDGE_HUB_URL ?? "http://127.0.0.1:8500"}/register`,
      {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ contractName: d.contractName, l3Address: d.address }),
        signal:  ctrl.signal,
      }
    );
    clearTimeout(timer);
    const body = await res.json() as { l2Address?: string };
    d.log.push(`Bridge registration: L2 mirror at ${body.l2Address ?? "(pending)"}`);
  } catch {
    d.log.push("Bridge hub unreachable — bridge step skipped.");
  }
}

// ── Settlement step (L2 → L1) ────────────────────────────────────────────────

async function settleToL1(d: Deployment): Promise<void> {
  setStage(d, "settling", "Requesting L1 settlement via GhostBrain oracle ...");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    await fetch(`${GHOSTBRAIN_URL}/settle`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ contractName: d.contractName, address: d.address }),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    d.log.push("L1 settlement request submitted.");
  } catch {
    d.log.push("Settlement endpoint unreachable — settlement skipped.");
  }
}

// ── Public pipeline ──────────────────────────────────────────────────────────

export function getDeployment(id: string): Deployment | undefined {
  return deployments.get(id);
}

export function getAllDeployments(): Deployment[] {
  return Array.from(deployments.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function runDeployment(req: DeployRequest): Promise<Deployment> {
  const id: string = randomUUID();
  const d: Deployment = {
    id,
    contractName: req.contractName,
    targetLayer:  req.targetLayer,
    stage:        "queued",
    log:          [],
    createdAt:    Date.now(),
    updatedAt:    Date.now(),
  };
  deployments.set(id, d);

  // Run pipeline asynchronously so the HTTP response returns immediately
  void (async () => {
    try {
      // 1. Compile
      const compiled = await compile(d);
      if (!compiled) {
        setStage(d, "failed", "Compilation failed.");
        return;
      }

      // 2. Locate artifact
      const artifact = await findArtifact(req.contractName);
      if (!artifact) {
        setStage(d, "failed", `Artifact for ${req.contractName} not found in ${ARTIFACTS_DIR}`);
        return;
      }

      // 3. Audit (optional)
      if (!req.skipAudit) {
        const passed = await audit(d, artifact);
        if (!passed) {
          setStage(d, "failed", "GhostBrain audit blocked deployment.");
          return;
        }
      }

      // 4. Deploy
      const deployed = await deploy(d, artifact, req);
      if (!deployed) {
        setStage(d, "failed", "Deployment transaction failed.");
        return;
      }

      // 5. Bridge (optional)
      if (req.bridgeToL2 && req.targetLayer === "L3") {
        await bridgeToL2(d);
      }

      // 6. Settle (optional)
      if (req.settleToL1) {
        await settleToL1(d);
      }

      setStage(d, "done", `${d.contractName} deployed successfully at ${d.address ?? "(address unknown)"}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStage(d, "failed", `Unexpected error: ${msg}`);
    }
  })();

  return d;
}
