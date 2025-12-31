import http from "node:http";

const PORT = Number(process.env.PORT || "8546");
const UPSTREAM_URL = process.env.UPSTREAM_URL || "http://anvil:8545";
const LOG_REQUESTS = process.env.LOG_REQUESTS === "1";

const checksumAccounts = new Map([
  ["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
  ["0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
  ["0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"],
  ["0x90f79bf6eb2c4f870365e785982e1f101e93b906", "0x90F79bf6EB2c4f870365E785982E1f101E93b906"],
  ["0x15d34aaf54267db7d7c367839aaf71a00a2c6a65", "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"],
  ["0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc", "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"],
  ["0x976ea74026e726554db657fa54763abd0c3a0aa9", "0x976EA74026E726554dB657fA54763abd0C3a0aa9"],
  ["0x14dc79964da2c08b23698b3d3cc7ca32193d9955", "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"],
  ["0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f", "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"],
  ["0xa0ee7a142d267c1f36714e4a8f75612f20a79720", "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"]
]);

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

function patchRequestPayload(payload) {
  const patchOne = (msg) => {
    if (!msg || typeof msg !== "object") return msg;
    if (msg.method === "eth_feeHistory" && Array.isArray(msg.params) && msg.params.length >= 3 && msg.params[2] == null) {
      msg.params = [msg.params[0], msg.params[1], []];
    }
    if (msg.method === "eth_estimateGas" && Array.isArray(msg.params) && msg.params.length >= 1) {
      const tx = msg.params[0];
      if (tx && typeof tx === "object" && "gas" in tx) {
        const g = tx.gas;
        const isZeroHex = typeof g === "string" && /^0x0*$/i.test(g);
        const isZeroNum = typeof g === "number" && g === 0;
        if (g == null || isZeroHex || isZeroNum) delete tx.gas;
      }
    }
    return msg;
  };

  if (Array.isArray(payload)) return payload.map((m) => patchOne(m));
  return patchOne(payload);
}

function describeRpcCall(method, params) {
  if (method !== "eth_call" || !Array.isArray(params) || !params.length) return "";
  const tx = params[0];
  if (!tx || typeof tx !== "object") return "";
  const to = typeof tx.to === "string" ? tx.to : "";
  const data = typeof tx.data === "string" ? tx.data : "";
  const sel = data.startsWith("0x") && data.length >= 10 ? data.slice(0, 10) : "";
  const extra = [to && `to=${to}`, sel && `sel=${sel}`].filter(Boolean).join(" ");
  return extra ? ` (${extra})` : "";
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, upstream: UPSTREAM_URL });
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: String(e?.message ?? e) });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json(res, 400, { ok: false, error: "invalid json" });
  }

  const methodById = new Map();
  const methods = [];
  if (Array.isArray(payload)) {
    for (const msg of payload) {
      if (msg && typeof msg === "object" && "id" in msg && "method" in msg) {
        methodById.set(msg.id, msg.method);
        methods.push(msg.method);
      }
    }
  } else if (payload && typeof payload === "object" && "id" in payload && "method" in payload) {
    methodById.set(payload.id, payload.method);
    methods.push(payload.method);
  }

  if (LOG_REQUESTS && methods.length) {
    const uniq = [...new Set(methods)].join(",");
    // eslint-disable-next-line no-console
    console.log(`rpc-proxy -> ${uniq}`);
    for (const msg of Array.isArray(payload) ? payload : [payload]) {
      if (!msg || typeof msg !== "object" || !("method" in msg)) continue;
      const method = msg.method;
      const params = "params" in msg ? msg.params : undefined;
      // eslint-disable-next-line no-console
      console.log(`rpc-proxy call ${method}${describeRpcCall(method, params)}`);
    }
  }

  const patched = patchRequestPayload(payload);

  let upstreamRes;
  try {
    upstreamRes = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patched)
    });
  } catch (e) {
    return json(res, 502, { ok: false, error: String(e?.message ?? e) });
  }

  const txt = await upstreamRes.text();
  let out = txt;
  const ct = upstreamRes.headers.get("content-type") || "application/json";
  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(txt);
      const patchResp = (r) => {
        const method = methodById.get(r?.id);
        if (method === "eth_accounts" && Array.isArray(r?.result)) {
          r.result = r.result.map((a) => checksumAccounts.get(String(a).toLowerCase()) ?? a);
        }
        return r;
      };
      out = JSON.stringify(Array.isArray(parsed) ? parsed.map(patchResp) : patchResp(parsed));
    } catch {
      // ignore
    }
  }

  res.statusCode = upstreamRes.status;
  res.setHeader("content-type", ct);
  res.end(out);
});

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`ghost-rpc-proxy listening on :${PORT} -> ${UPSTREAM_URL}`);
});
