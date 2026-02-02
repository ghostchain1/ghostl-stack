import express, { type NextFunction, type Request, type Response } from "express";
import { getAddress, isAddress } from "ethers";
import { loadConfig, type GhostLayer } from "./config.js";
import { NonceStore } from "./nonceStore.js";
import { HubClient, type LatestRiskSnapshot, type PolicySnapshot } from "./hubClient.js";
import { computeRisk } from "./riskEngine.js";
import { signWithWallet } from "./signer.js";

type AttestBody = {
  subject?: string;
  layer?: number;
  modelCardHash?: string;
  explanationRef?: string;
  input?: unknown;
};

const config = loadConfig();

const requestId = () => Math.random().toString(36).slice(2, 10);

const toLayer = (raw: unknown, fallback: GhostLayer): GhostLayer => {
  const parsed = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : fallback;
  if (parsed === 1 || parsed === 2 || parsed === 3) return parsed;
  return fallback;
};

const formatError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const addCorsHeaders = (res: Response, origin: string | undefined, allowedOrigins: string[]) => {
  if (allowedOrigins.length === 0) {
    res.setHeader("access-control-allow-origin", origin || "*");
    res.setHeader("vary", "origin");
    return;
  }
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
  }
};

const main = async () => {
  const nonceStore = await NonceStore.create(config.nonceStorePath);

  const clients: Record<GhostLayer, HubClient> = {
    1: new HubClient(config.layers[1], config.privateKey),
    2: new HubClient(config.layers[2], config.privateKey),
    3: new HubClient(config.layers[3], config.privateKey)
  };

  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.use((req, res, next) => {
    const id = requestId();
    res.setHeader("x-request-id", id);
    (req as Request & { requestId?: string }).requestId = id;
    next();
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    addCorsHeaders(res, origin, config.corsAllowedOrigins);
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,x-ghost-ai-key");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
    if (!config.apiKey) {
      if (!config.allowInsecureDev) {
        res.status(401).json({ ok: false, error: "api key required" });
        return;
      }
      next();
      return;
    }
    const provided = (req.header("x-ghost-ai-key") || "").trim();
    if (!provided || provided !== config.apiKey) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    next();
  };

  const attestCooldown = new Map<string, number>();
  const checkCooldown = (subject: string, layer: GhostLayer): { allowed: boolean; retryAfterSeconds: number } => {
    const key = `${layer}:${subject}`;
    const now = Math.floor(Date.now() / 1000);
    const last = attestCooldown.get(key) ?? 0;
    const minInterval = config.minAttestIntervalSeconds;
    const delta = now - last;
    if (delta < minInterval) {
      return { allowed: false, retryAfterSeconds: minInterval - delta };
    }
    attestCooldown.set(key, now);
    return { allowed: true, retryAfterSeconds: 0 };
  };

  const describeLayer = async (layer: GhostLayer) => {
    const client = clients[layer];
    const hasHub = Boolean(client.hubAddress);
    const hasRegistry = Boolean(client.registryAddress);
    const hasSigner = Boolean(client.wallet);
    let chainId: string | null = null;
    let hubLayerId: number | null = null;
    let policy: PolicySnapshot | null = null;
    let signerAllowed: boolean | null = null;
    try {
      if (hasHub) {
        const [cid, lid] = await Promise.all([client.getChainId(), client.getLayerId()]);
        chainId = cid.toString();
        hubLayerId = Number(lid);
      }
      if (hasRegistry) {
        policy = await client.getPolicySnapshot();
      }
      if (hasSigner && hasRegistry) {
        signerAllowed = await client.isSignerAllowed();
      }
    } catch (err) {
      console.warn(`[ai-attestor] describe layer ${layer} failed: ${formatError(err)}`);
    }
    return {
      layer,
      rpcUrl: config.layers[layer].rpcUrl,
      hubAddress: client.hubAddress || null,
      registryAddress: client.registryAddress || null,
      hasHub,
      hasRegistry,
      hasSigner,
      signerAllowed,
      chainId,
      hubLayerId,
      policy
    };
  };

  const buildHealthPayload = async () => {
    const layers = await Promise.all([describeLayer(1), describeLayer(2), describeLayer(3)]);
    return {
      ok: true,
      service: "ghost-ai-attestor",
      defaultLayer: config.defaultLayer,
      modelVersion: config.modelVersion,
      ttlSeconds: config.ttlSeconds,
      layers
    };
  };

  app.get("/healthz", async (_req, res) => {
    res.json(await buildHealthPayload());
  });

  app.get("/health", async (_req, res) => {
    res.json(await buildHealthPayload());
  });

  app.get("/config", async (_req, res) => {
    const layers = await Promise.all([describeLayer(1), describeLayer(2), describeLayer(3)]);
    res.json({
      ok: true,
      defaultLayer: config.defaultLayer,
      modelVersion: config.modelVersion,
      ttlSeconds: config.ttlSeconds,
      minAttestIntervalSeconds: config.minAttestIntervalSeconds,
      layers
    });
  });

  app.get("/risk/:subject", async (req, res) => {
    const subjectRaw = String(req.params.subject || "").trim();
    if (!subjectRaw || !isAddress(subjectRaw)) {
      res.status(400).json({ ok: false, error: "invalid subject address" });
      return;
    }
    const subject = getAddress(subjectRaw);
    const layer = toLayer(req.query.layer, config.defaultLayer);
    const client = clients[layer];

    const computed = computeRisk({
      subject,
      layer,
      modelVersion: config.modelVersion,
      input: req.query.input ? String(req.query.input) : undefined
    });

    let onChain: LatestRiskSnapshot | null = null;
    try {
      onChain = await client.getLatestRisk(subject);
    } catch (err) {
      console.warn(`[ai-attestor] latest risk read failed: ${formatError(err)}`);
    }

    res.json({
      ok: true,
      subject,
      layer,
      computed: {
        riskScoreBps: computed.riskScoreBps,
        confidence: computed.confidence,
        inputHash: computed.inputHash,
        outputHash: computed.outputHash,
        modelVersion: computed.modelVersion
      },
      onChain
    });
  });

  app.post("/attest", requireApiKey, async (req: Request<unknown, unknown, AttestBody>, res) => {
    const subjectRaw = (req.body?.subject || "").trim();
    if (!subjectRaw || !isAddress(subjectRaw)) {
      res.status(400).json({ ok: false, error: "subject must be a valid address" });
      return;
    }
    const subject = getAddress(subjectRaw);
    const layer = toLayer(req.body?.layer, config.defaultLayer);
    const client = clients[layer];

    if (!client.wallet) {
      res.status(400).json({ ok: false, error: "attestor signer not configured" });
      return;
    }
    if (!client.hubAddress || !client.registryAddress) {
      res.status(503).json({ ok: false, error: "hub or registry address missing for layer" });
      return;
    }

    const cooldown = checkCooldown(subject, layer);
    if (!cooldown.allowed) {
      res.status(429).json({ ok: false, error: "rate_limited", retryAfterSeconds: cooldown.retryAfterSeconds });
      return;
    }

    try {
      const signerAddress = await client.getSignerAddress();
      const allowed = await client.isSignerAllowed();
      if (!allowed) {
        res.status(403).json({ ok: false, error: "attestor signer is not allowlisted" });
        return;
      }

      const risk = computeRisk({
        subject,
        layer,
        modelVersion: config.modelVersion,
        input: req.body?.input
      });

      const [chainId, chainNonce] = await Promise.all([client.getChainId(), client.getOnChainNonce()]);
      const nonce = await nonceStore.reserveNextNonce(signerAddress, chainNonce);

      const signed = await signWithWallet(client.wallet, {
        subject,
        layer,
        chainId,
        hubAddress: client.hubAddress,
        risk,
        ttlSeconds: config.ttlSeconds,
        nonce,
        modelVersion: config.modelVersion,
        modelCardHash: req.body?.modelCardHash,
        explanationRef: req.body?.explanationRef
      });

      try {
        const submission = await client.submitAttestation(signed.attestation, signed.signature);
        res.json({
          ok: true,
          layer,
          subject,
          signer: signerAddress,
          attestationId: submission.attestationId,
          txHash: submission.txHash,
          chainId: submission.chainId.toString(),
          nonce: signed.attestation.nonce.toString(),
          risk: {
            riskScoreBps: risk.riskScoreBps,
            confidence: risk.confidence,
            inputHash: risk.inputHash,
            outputHash: risk.outputHash
          }
        });
        return;
      } catch (err) {
        console.warn(`[ai-attestor] submit failed, attempting nonce resync: ${formatError(err)}`);
      }

      const refreshedNonce = await client.getOnChainNonce();
      await nonceStore.resetToChain(signerAddress, refreshedNonce);
      const retryNonce = await nonceStore.reserveNextNonce(signerAddress, refreshedNonce);
      const retrySigned = await signWithWallet(client.wallet, {
        subject,
        layer,
        chainId,
        hubAddress: client.hubAddress,
        risk,
        ttlSeconds: config.ttlSeconds,
        nonce: retryNonce,
        modelVersion: config.modelVersion,
        modelCardHash: req.body?.modelCardHash,
        explanationRef: req.body?.explanationRef
      });
      const retrySubmission = await client.submitAttestation(retrySigned.attestation, retrySigned.signature);
      res.json({
        ok: true,
        layer,
        subject,
        signer: signerAddress,
        attestationId: retrySubmission.attestationId,
        txHash: retrySubmission.txHash,
        chainId: retrySubmission.chainId.toString(),
        nonce: retrySigned.attestation.nonce.toString(),
        retried: true,
        risk: {
          riskScoreBps: risk.riskScoreBps,
          confidence: risk.confidence,
          inputHash: risk.inputHash,
          outputHash: risk.outputHash
        }
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: formatError(err) });
    }
  });

  const port = config.port;
  app.listen(port, () => {
    console.log(
      `[ghost-ai-attestor] listening on :${port} defaultLayer=L${config.defaultLayer} modelVersion=${config.modelVersion} ttl=${config.ttlSeconds}s`
    );
  });
};

main().catch((err) => {
  console.error(`[ghost-ai-attestor] fatal startup error: ${formatError(err)}`);
  process.exit(1);
});
