import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";

const app = Fastify({ logger: true });

const cfg = {
  port: Number(process.env.PORT ?? 8484),
  env: process.env.GHOSTOS_ENV ?? "devnet",
  rpcL1: process.env.RPC_L1 ?? "http://host.docker.internal:18545",
  rpcL2: process.env.RPC_L2 ?? "http://host.docker.internal:29547",
  rpcL3: process.env.RPC_L3 ?? "http://host.docker.internal:39545",
  aiVaultUrl: process.env.AI_VAULT_URL ?? "",
  requireSignature: process.env.CONTROL_PLANE_REQUIRE_SIGNATURE === "1",
  hmacSecret: process.env.CONTROL_PLANE_HMAC_SECRET ?? "dev-control-plane-secret",
  vmManualOnly: process.env.VM_PROTOCOL_MANUAL_ONLY !== "0",
  l3OracleAddress: process.env.L3_OUTPUT_ORACLE_ADDRESS ?? "",
};

// Canonical GhostChain registry (matches chain IDs from AGENTS.md / copilot-instructions.md)
export const GHOST_REGISTRY = {
  devnet: {
    l1: { chainId: 14000101, rpc: cfg.rpcL1 },
    l2: { chainId: 901, rpc: cfg.rpcL2 },
    l3: { chainId: 903, rpc: cfg.rpcL3 },
  },
} as const;

// Policy table — kept in source to match AGENTS.md security model
const POLICY = {
  safe_auto: ["restart_service", "refresh_worker", "clear_temp_cache", "rotate_noncritical_logs"],
  approval_required: [
    "promote_environment",
    "validator_change",
    "bridge_route_change",
    "treasury_action",
    "signer_policy_change",
  ],
  forbidden: [
    "chain_reset",
    "silent_state_delete",
    "raw_secret_export",
    "unsigned_mainnet_action",
  ],
} as const;

async function rpcCall(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) {
    throw new Error(`${method} failed with HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    result?: string;
    error?: { message?: string };
  };
  if (json.error) throw new Error(json.error.message || "rpc error");
  return json.result ?? null;
}

async function probeChain(name: string, url: string, expectedChainId: number) {
  try {
    const [chainIdHex, blockHex, clientVersion] = await Promise.all([
      rpcCall(url, "eth_chainId"),
      rpcCall(url, "eth_blockNumber"),
      rpcCall(url, "web3_clientVersion"),
    ]);

    const reportedChainId = chainIdHex ? Number(BigInt(chainIdHex)) : null;
    const chainIdMismatch =
      reportedChainId !== null && reportedChainId !== expectedChainId;

    return {
      name,
      status: "ok" as const,
      rpc: url,
      chainId: reportedChainId,
      expectedChainId,
      chainIdMismatch,
      blockNumber: blockHex ? BigInt(blockHex).toString() : null,
      clientVersion,
    };
  } catch (error) {
    return {
      name,
      status: "down" as const,
      rpc: url,
      expectedChainId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeVault() {
  if (!cfg.aiVaultUrl) return { status: "disabled" as const };

  try {
    const res = await fetch(`${cfg.aiVaultUrl.replace(/\/$/, "")}/status`);
    if (!res.ok) throw new Error(`vault status ${res.status}`);
    const json = await res.json();
    return { status: "ok" as const, url: cfg.aiVaultUrl, details: json };
  } catch (error) {
    return {
      status: "down" as const,
      url: cfg.aiVaultUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", async () => ({
  ok: true,
  product: "GhostOS",
  runtime: "Ghost Brain Operating System",
  env: cfg.env,
  advisoryMode: true,
  requireSignature: cfg.requireSignature,
  vmManualOnly: cfg.vmManualOnly,
}));

app.get("/api/chains", async () => {
  const reg = GHOST_REGISTRY.devnet;
  const [l1, l2, l3] = await Promise.all([
    probeChain("ghostchain-l1", reg.l1.rpc, reg.l1.chainId),
    probeChain("ghostl2", reg.l2.rpc, reg.l2.chainId),
    probeChain("ghostl3", reg.l3.rpc, reg.l3.chainId),
  ]);

  return { ok: true, env: cfg.env, chains: { l1, l2, l3 } };
});

app.get("/api/vault/status", async () => ({
  ok: true,
  env: cfg.env,
  vault: await probeVault(),
}));

app.get("/api/policy", async () => ({
  ok: true,
  env: cfg.env,
  policy: POLICY,
}));

app.get("/api/system/overview", async () => {
  const reg = GHOST_REGISTRY.devnet;
  const [[l1, l2, l3], vault] = await Promise.all([
    Promise.all([
      probeChain("ghostchain-l1", reg.l1.rpc, reg.l1.chainId),
      probeChain("ghostl2", reg.l2.rpc, reg.l2.chainId),
      probeChain("ghostl3", reg.l3.rpc, reg.l3.chainId),
    ]),
    probeVault(),
  ]);

  // L3 OutputOracle gate — dynamically probe the oracle contract on L2 (where the
  // L3 output oracle is deployed). Requires L3_OUTPUT_ORACLE_ADDRESS env var.
  let l3OracleReady = false;
  if (cfg.l3OracleAddress) {
    try {
      // Confirm contract is deployed
      const code = await rpcCall(cfg.rpcL2, "eth_getCode", [cfg.l3OracleAddress, "latest"]);
      if (code && code !== "0x" && code !== "0x0") {
        // Call latestOutputIndex() selector 0x69f16eec — succeeds when at least one output exists
        const result = await rpcCall(cfg.rpcL2, "eth_call", [
          { to: cfg.l3OracleAddress, data: "0x69f16eec" },
          "latest",
        ]);
        l3OracleReady = result !== null && result !== "0x";
      }
    } catch {
      // oracle not yet deployed or not responding — gate stays closed
    }
  }

  return {
    ok: true,
    product: "GhostOS",
    runtime: "Ghost Brain Operating System",
    env: cfg.env,
    mode: "advisory",
    controls: {
      requireSignature: cfg.requireSignature,
      vmManualOnly: cfg.vmManualOnly,
    },
    gates: {
      l3OutputOracleReady: l3OracleReady,
      l3PromotionBlocked: !l3OracleReady,
    },
    chains: { l1, l2, l3 },
    vault,
    policy: POLICY,
  };
});

interface VerifyBody {
  ts?: string;
  action?: string;
  target?: string;
  signature?: string;
}

// Verify a signed control-plane action (HMAC-SHA256 over ts:action:target)
app.post<{ Body: VerifyBody }>(
  "/api/control/verify",
  async (request: FastifyRequest<{ Body: VerifyBody }>, reply: FastifyReply) => {
    const body = request.body;

    if (!body.ts || !body.action || !body.target || !body.signature) {
      reply.code(400);
      return { ok: false, error: "missing required fields: ts, action, target, signature" };
    }

    // Reject forbidden actions outright
    if ((POLICY.forbidden as readonly string[]).includes(body.action)) {
      reply.code(403);
      return { ok: false, error: "action is unconditionally forbidden", action: body.action };
    }

    const payload = `${body.ts}:${body.action}:${body.target}`;
    const expected = crypto
      .createHmac("sha256", cfg.hmacSecret)
      .update(payload)
      .digest("hex");

    // Constant-time comparison
    const sigBuf = Buffer.from(body.signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    const ok =
      sigBuf.length === expBuf.length &&
      crypto.timingSafeEqual(sigBuf, expBuf);

    if (!ok) {
      reply.code(403);
      return { ok: false, error: "invalid signature", payload };
    }

    return { ok: true, advisoryOnly: true, payload };
  }
);

// ── Boot ─────────────────────────────────────────────────────────────────────

app.listen({ host: "0.0.0.0", port: cfg.port }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
