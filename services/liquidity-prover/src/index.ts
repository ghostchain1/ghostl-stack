import "dotenv/config";
import express from "express";
import client from "prom-client";

const env = process.env;

const PORT = Number(env.PORT || "7611");

const STATIC_PROOF_HEX = env.LGE_PROVER_PROOF_HEX || env.LGE_ZK_PROOF_HEX || "";

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const proveRequests = new client.Counter({
  name: "lge_prover_requests_total",
  help: "ZK prover requests",
  labelNames: ["result"] as const,
  registers: [registry]
});

const isHex = (value: string) => /^0x[0-9a-fA-F]*$/.test(value);
const isBytes32 = (value: string) => isHex(value) && value.length === 66;
const normalizeHex = (value: string) => (value.trim().startsWith("0x") ? value.trim() : `0x${value.trim()}`);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/metrics", async (_req, res) => {
  res.setHeader("content-type", registry.contentType);
  res.send(await registry.metrics());
});

app.post("/prove-settlement", async (req, res) => {
  try {
    const digest = String((req.body as any)?.digest || "");
    if (!isBytes32(digest)) {
      proveRequests.inc({ result: "bad_request" });
      return res.status(400).json({ error: "invalid_digest" });
    }

    if (!STATIC_PROOF_HEX.trim()) {
      proveRequests.inc({ result: "unavailable" });
      return res.status(503).json({ error: "no_static_proof_configured" });
    }

    const proof = normalizeHex(STATIC_PROOF_HEX);
    if (!isHex(proof) || proof === "0x") {
      proveRequests.inc({ result: "misconfigured" });
      return res.status(500).json({ error: "invalid_static_proof" });
    }

    proveRequests.inc({ result: "ok" });
    return res.json({ proof });
  } catch (e) {
    proveRequests.inc({ result: "error" });
    return res.status(500).json({ error: (e as any)?.message || String(e) });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", service: "liquidity-prover", port: PORT }));
});

