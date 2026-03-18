import http from "node:http";

const upstreamUrl = process.env.UPSTREAM_URL || "http://host.docker.internal:18545";
const port = Number.parseInt(process.env.PORT || "18546", 10);
const fallbackSafeFinalizedToLatest =
  (process.env.L1_RPC_PROXY_FALLBACK_SAFE_FINALIZED_TO_LATEST || "1") === "1";

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { jsonrpc: "2.0", id: payload?.id ?? null, error: { code: -32603, message: text } };
  }
}

async function blobBaseFeeResponse(id) {
  const latest = await postJson(upstreamUrl, {
    jsonrpc: "2.0",
    id,
    method: "eth_getBlockByNumber",
    params: ["latest", false],
  });
  const baseFee = latest?.result?.baseFeePerGas || "0x0";
  return { jsonrpc: "2.0", id, result: baseFee };
}

function normalizeBlockResult(result) {
  if (!result || typeof result !== "object") return result;
  return {
    ...result,
    blobGasUsed: result.blobGasUsed ?? "0x0",
    excessBlobGas: result.excessBlobGas ?? "0x0",
    parentBeaconBlockRoot: result.parentBeaconBlockRoot ?? null,
  };
}

function normalizeResponseBlocks(response) {
  if (!response || typeof response !== "object") return response;
  if (Array.isArray(response)) {
    return response.map(normalizeResponseBlocks);
  }
  if ("result" in response) {
    return {
      ...response,
      result: normalizeBlockResult(response.result),
    };
  }
  return response;
}

async function handleOne(reqBody) {
  if (reqBody?.method === "eth_blobBaseFee") {
    return blobBaseFeeResponse(reqBody.id ?? null);
  }
  // Some dev L1 RPCs don't support "safe"/"finalized" block tags; OP Stack components may poll them.
  // In such environments, fall back to "latest" to keep derivation/sequencing moving.
  if (
    fallbackSafeFinalizedToLatest &&
    reqBody?.method === "eth_getBlockByNumber" &&
    Array.isArray(reqBody?.params) &&
    (reqBody.params[0] === "safe" || reqBody.params[0] === "finalized")
  ) {
    const response = await postJson(upstreamUrl, { ...reqBody, params: ["latest", reqBody.params[1] ?? false] });
    return normalizeResponseBlocks(response);
  }
  if (reqBody?.method === "eth_getBlockByNumber" || reqBody?.method === "eth_getBlockByHash") {
    const response = await postJson(upstreamUrl, reqBody);
    return normalizeResponseBlocks(response);
  }
  return postJson(upstreamUrl, reqBody);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
    return;
  }

  try {
    const response = Array.isArray(body)
      ? await Promise.all(body.map(handleOne))
      : await handleOne(body);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (err) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body?.id ?? null,
        error: { code: -32603, message: String(err?.message || err) },
      }),
    );
  }
});

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`l1-rpc-proxy listening on :${port}, upstream=${upstreamUrl}`);
});
