const express = require("express");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(express.static("public"));

const jsonRpc = async (url, method) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || "rpc error");
    return body.result;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

app.get("/api/status", async (_req, res) => {
  const targets = [
    { id: "op-node", kind: "rpc", url: "http://localhost:9546", method: "optimism_syncStatus" },
    { id: "l2-geth", kind: "rpc", url: "http://localhost:29545", method: "eth_blockNumber" },
    { id: "guard", kind: "http", url: "http://localhost:7070/health" },
    { id: "relayer", kind: "http", url: "http://localhost:7171/health" },
    { id: "proposer-l2", kind: "http", url: "http://localhost:7272/health" },
    { id: "proposer-l3", kind: "http", url: "http://localhost:7373/health" },
    { id: "challenger-l2", kind: "http", url: "http://localhost:7282/health" },
    { id: "challenger-l3", kind: "http", url: "http://localhost:7383/health" },
    { id: "ai-monitor", kind: "http", url: "http://localhost:7575/health" },
    { id: "op-gate", kind: "http", url: "http://localhost:28546/gate/status" }
  ];

  const results = await Promise.all(
    targets.map(async (t) => {
      try {
        const data = t.kind === "rpc" ? await jsonRpc(t.url, t.method) : await fetchJson(t.url);
        return { id: t.id, ok: true, data };
      } catch (e) {
        return { id: t.id, ok: false, error: e?.message || String(e) };
      }
    })
  );

  res.json({ ok: true, services: results });
});

app.listen(PORT, () => {
  console.log(`ghostl-stack dashboard running on http://localhost:${PORT}`);
});
