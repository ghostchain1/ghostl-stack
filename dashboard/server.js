const express = require("express");
const session = require("express-session");
const { Issuer, generators } = require("openid-client");
const { SiweMessage } = require("siwe");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 4000;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-ghostl-session";
const ROOT_DIR = path.resolve(__dirname, "..");
const COMPOSE_FILE = path.join(ROOT_DIR, ".devcontainer", "docker-compose.yml");
const SAFE_ENV_PATH = path.join(__dirname, ".env");
const parseSafeContracts = (raw) =>
  String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [address, label] = entry.split(":");
      return { address, label: label || "Safe" };
    });
const defaultSafes = (() => {
  const chains = ["l2", "l3"];
  const results = [];
  chains.forEach((chain) => {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "chains", chain, "chain.json"), "utf-8"));
      if (cfg?.premine?.address) results.push({ address: cfg.premine.address, label: `${chain.toUpperCase()} Treasury (dev)` });
    } catch {
      // ignore missing configs
    }
  });
  return results.length
    ? results
    : [
        { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", label: "L2 Ops Safe (dev)" },
        { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", label: "L3 Ops Safe (dev)" }
      ];
})();
const readSafeEnv = () => {
  try {
    const raw = fs.readFileSync(SAFE_ENV_PATH, "utf-8");
    const line = raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("SAFE_CONTRACTS="));
    return line ? line.slice("SAFE_CONTRACTS=".length).trim() : "";
  } catch {
    return "";
  }
};
const OIDC_ISSUER = process.env.OIDC_ISSUER;
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI || `http://localhost:${PORT}/auth/oidc/callback`;
const CORE_SERVICE_URL = process.env.CORE_SERVICE_URL || "http://localhost:8080";
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const SAFE_CONTRACTS = (() => {
  const parsed = parseSafeContracts(process.env.SAFE_CONTRACTS || readSafeEnv());
  return parsed.length ? parsed : defaultSafes;
})();
const CORE_KEYS_ENDPOINT = `${CORE_SERVICE_URL.replace(/\/$/, "")}/api/keys`;

const app = express();

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax", secure: false }
  })
);
app.use((req, _res, next) => {
  if (!req.session.user) req.session.user = { role: "Viewer" };
  next();
});
app.use(express.static("public"));

const keyPath = path.join(__dirname, "data", "api-keys.json");
const readKeys = () => {
  try {
    const raw = fs.readFileSync(keyPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
};
const writeKeys = (keys) => {
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, JSON.stringify(keys, null, 2));
};

const readEnvValue = (filePath, key) => {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const line = raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(`${key}=`));
    if (!line) return null;
    return line.slice(key.length + 1).trim();
  } catch {
    return null;
  }
};

const coreKeyProxy = async (method = "GET", body, pathSuffix = "") => {
  try {
    const resp = await fetch(`${CORE_KEYS_ENDPOINT}${pathSuffix}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!resp.ok) throw new Error(`core_service_status_${resp.status}`);
    return await resp.json();
  } catch (e) {
    return null;
  }
};

const roleOrder = ["Viewer", "Validator", "Ops", "Admin"];
const roleRank = (role) => Math.max(roleOrder.indexOf(role || "Viewer"), 0);
const hasRole = (req, role) => roleRank(req.session?.user?.role) >= roleRank(role);
const requireRole = (role) => (req, res, next) => {
  if (!hasRole(req, role)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  next();
};
const runCompose = (args = []) =>
  new Promise((resolve, reject) => {
    execFile("docker", ["compose", "-f", COMPOSE_FILE, ...args], { cwd: path.dirname(COMPOSE_FILE) }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });

let oidcClientCache = null;
const getOidcClient = async () => {
  if (oidcClientCache) return oidcClientCache;
  if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
    throw new Error("oidc_not_configured");
  }
  const issuer = await Issuer.discover(OIDC_ISSUER);
  oidcClientCache = new issuer.Client({
    client_id: OIDC_CLIENT_ID,
    client_secret: OIDC_CLIENT_SECRET,
    redirect_uris: [OIDC_REDIRECT_URI],
    response_types: ["code"]
  });
  return oidcClientCache;
};

const jsonRpc = async (url, method, params = []) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
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

app.get("/api/diag", async (_req, res) => {
  const response = {
    ok: true,
    guardHealth: null,
    gateStatus: null,
    links: {
      grafana: "http://localhost:3000",
      prometheus: "http://localhost:9090",
      opGate: "http://localhost:28546/gate/status",
      l1Rpc: "http://localhost:28545",
      l2Rpc: "http://localhost:29545",
      l3Rpc: "http://localhost:10545"
    }
  };

  try {
    response.guardHealth = await fetchJson("http://localhost:7070/health");
  } catch (e) {
    response.guardHealth = { ok: false, error: e?.message || String(e) };
  }

  try {
    response.gateStatus = await fetchJson("http://localhost:28546/gate/status");
  } catch (e) {
    response.gateStatus = { ok: false, error: e?.message || String(e) };
  }

  res.json(response);
});

app.get("/api/security/metrics", async (_req, res) => {
  const queryProm = async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  const queries = {
    slashing: "slashing_events_total",
    keyRotations: "validator_key_rotations_total",
    firewall: "firewall_blocked_total",
    ports: "node_firewall_open_ports"
  };
  const metrics = {};
  await Promise.all(
    Object.entries(queries).map(async ([key, q]) => {
      try {
        const resp = await queryProm(q);
        const val = resp?.data?.result?.[0]?.value?.[1];
        metrics[key] = val ? Number(val) : 0;
      } catch (e) {
        metrics[key] = null;
      }
    })
  );

  res.json({ ok: true, metrics, safes: SAFE_CONTRACTS });
});

app.get("/api/validators", async (_req, res) => {
  const pick = (...vals) => vals.find((v) => v);
  const rpcMap = {
    l2: pick(
      process.env.RPC_L2,
      readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L2"),
      readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L2"),
      "http://localhost:9545"
    ),
    l3: pick(
      process.env.RPC_L3,
      readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L3"),
      readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L3"),
      "http://localhost:10545"
    )
  };
  const fetchValidators = async (rpc) => {
    if (!rpc) return [];
    const vals = await jsonRpc(rpc, "ibft_getValidatorsByBlockNumber", ["latest"]).catch(() => null);
    if (Array.isArray(vals) && vals.length) return vals;
    const qbftVals = await jsonRpc(rpc, "qbft_getValidatorsByBlockNumber", ["latest"]).catch(() => null);
    return Array.isArray(qbftVals) ? qbftVals : [];
  };
  const latestAuthor = async (rpc) => {
    if (!rpc) return null;
    const blk = await jsonRpc(rpc, "eth_getBlockByNumber", ["latest", false]).catch(() => null);
    return blk?.miner || blk?.author || null;
  };
  const collectRecentProposers = async (rpc, window = 32) => {
    if (!rpc) return {};
    try {
      const latestHex = await jsonRpc(rpc, "eth_blockNumber");
      const latest = latestHex ? parseInt(latestHex, 16) : 0;
      const counts = {};
      const start = Math.max(0, latest - window + 1);
      for (let n = start; n <= latest; n++) {
        const blk = await jsonRpc(rpc, "eth_getBlockByNumber", [`0x${n.toString(16)}`, false]);
        const author = blk?.miner || blk?.author;
        if (!author) continue;
        const id = String(author).toLowerCase();
        counts[id] = (counts[id] || 0) + 1;
      }
      return { counts, total: latest - start + 1 };
    } catch {
      return {};
    }
  };

  const queryProm = async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  const queries = {
    stake: "validator_stake_tokens",
    commission: "validator_commission_rate",
    missedBlocks: "validator_missed_blocks_total",
    proposerIndex: "validator_proposer_rank",
    byzantine: "byzantine_alerts_total"
  };

  const metrics = {};
  await Promise.all(
    Object.entries(queries).map(async ([key, q]) => {
      try {
        const resp = await queryProm(q);
        metrics[key] = resp?.data?.result || [];
      } catch (e) {
        metrics[key] = [];
      }
    })
  );

  // Normalize per validator label "validator" or "pubkey"
  const map = {};
  Object.entries(metrics).forEach(([key, series]) => {
    series.forEach((s) => {
      const id = s.metric.validator || s.metric.pubkey || s.metric.address || "unknown";
      if (!map[id]) map[id] = { id };
      map[id][key] = s.value?.[1] || s.value;
    });
  });

  // RPC fallbacks to ensure live data
  await Promise.all(
    Object.entries(rpcMap).map(async ([_layer, rpc]) => {
      const vals = await fetchValidators(rpc);
      const author = await latestAuthor(rpc);
      const proposerStats = await collectRecentProposers(rpc, 32);
      vals.forEach((v, idx) => {
        const id = String(v).toLowerCase();
        if (!map[id]) map[id] = { id };
        map[id].proposerIndex = map[id].proposerIndex ?? idx;
        map[id].missedBlocks = map[id].missedBlocks ?? "?";
        map[id].stake = map[id].stake ?? "?";
        map[id].commission = map[id].commission ?? "?";
        map[id].byzantine = map[id].byzantine ?? 0;
        if (proposerStats.counts && proposerStats.counts[id] !== undefined) {
          map[id].missedBlocks = "?";
          map[id].proposerIndex = `${proposerStats.counts[id]}/${proposerStats.total || "?"}`;
        }
      });
      if (author) {
        const id = String(author).toLowerCase();
        if (!map[id]) map[id] = { id };
        map[id].proposerIndex = map[id].proposerIndex ?? "proposer";
      }
    })
  );

  // Ensure baseline fields exist
  Object.values(map).forEach((v) => {
    if (v.stake === undefined) v.stake = "0";
    if (v.commission === undefined) v.commission = "0";
    if (v.byzantine === undefined) v.byzantine = "0";
    if (v.missedBlocks === undefined) v.missedBlocks = "?";
    if (v.proposerIndex === undefined) v.proposerIndex = "?";
  });

  res.json({ ok: true, validators: Object.values(map) });
});

app.get("/api/token", async (_req, res) => {
  // Helper to pick the first truthy value
  const pick = (...vals) => vals.find((v) => v);
  const readEnvValue = (filePath, key) => {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const line = raw
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${key}=`));
      if (!line) return null;
      return line.slice(key.length + 1).trim();
    } catch {
      return null;
    }
  };
  const readChainPremine = (chain) => {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "chains", chain, "chain.json"), "utf-8"));
      return cfg?.premine?.address;
    } catch {
      return null;
    }
  };
  const formatNumber = (val, maxDecimals = 2) => {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return "?";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDecimals }).format(Number(val));
  };
  const formatUnits = (value, decimals = 18, maxDecimals = 4) => {
    if (value === null || value === undefined) return "?";
    const v = typeof value === "bigint" ? value : BigInt(value);
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    const frac = v % base;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxDecimals).replace(/0+$/, "");
    return `${whole.toString()}.${fracStr || "0"}`;
  };
  const rpcCall = async (url, method, params = []) => {
    try {
      return await jsonRpc(url, method, params);
    } catch {
      return null;
    }
  };
  const erc20Call = async (rpc, token, selector, args = "", blockTag = "latest") => {
    if (!token) return null;
    const data = `0x${selector}${args}`;
    const res = await rpcCall(rpc, "eth_call", [{ to: token, data }, blockTag]);
    if (typeof res !== "string" || !res.startsWith("0x")) return null;
    try {
      return BigInt(res);
    } catch {
      return null;
    }
  };
  const totalSupplyAt = async (rpc, token, blockTag = "latest") => erc20Call(rpc, token, "18160ddd", "", blockTag);
  const balanceOfAt = async (rpc, token, account, blockTag = "latest") => {
    if (!account) return null;
    const padded = account.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    return erc20Call(rpc, token, "70a08231", padded, blockTag);
  };

  const defaults = {
    l2: {
      id: "l2",
      rpc: pick(process.env.RPC_L2, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L2"), readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L2"), "http://localhost:9545"),
      token: pick(process.env.L2_TOKEN_ADDRESS, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "L2_TOKEN_ADDRESS"), readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "L2_TOKEN_ADDRESS")),
      treasury: pick(process.env.TREASURY_L2, process.env.TREASURY_ADDRESS, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "TREASURY_ADDRESS"), readChainPremine("l2"))
    },
    l3: {
      id: "l3",
      rpc: pick(process.env.RPC_L3, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L3"), readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L3"), "http://localhost:10545"),
      token: pick(process.env.L3_TOKEN_ADDRESS, readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "L3_TOKEN_ADDRESS")),
      treasury: pick(process.env.TREASURY_L3, process.env.TREASURY_ADDRESS, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "TREASURY_ADDRESS"), readChainPremine("l3"))
    }
  };

  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  const buildFromRpc = async (cfg) => {
    if (!cfg.rpc) return { id: cfg.id };
    try {
      const block = await rpcCall(cfg.rpc, "eth_getBlockByNumber", ["latest", false]);
      const blockNum = block?.number ? parseInt(block.number, 16) : 0;
      const baseFeeWei = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : null;
      const gasLimit = block?.gasLimit ? parseInt(block.gasLimit, 16) : null;

      const supplyNow = await totalSupplyAt(cfg.rpc, cfg.token);
      const lookback = Math.max(1, Math.min(blockNum, 50));
      const prevBlock = `0x${Math.max(blockNum - lookback, 0).toString(16)}`;
      const supplyPrev = await totalSupplyAt(cfg.rpc, cfg.token, prevBlock);
      const emissionPerBlock =
        supplyNow !== null && supplyPrev !== null ? (supplyNow - supplyPrev) / BigInt(lookback || 1) : null;

      const nativeBalHex = cfg.treasury ? await rpcCall(cfg.rpc, "eth_getBalance", [cfg.treasury, "latest"]) : null;
      const nativeBal = nativeBalHex ? BigInt(nativeBalHex) : null;
      const tokenBal = await balanceOfAt(cfg.rpc, cfg.token, cfg.treasury);

      let multisigCount = null;
      if (cfg.token && cfg.treasury) {
        const fromTopic = `0x${cfg.treasury.replace(/^0x/, "").padStart(64, "0")}`;
        const fromBlock = `0x${Math.max(blockNum - 5000, 0).toString(16)}`;
        const logs = await rpcCall(cfg.rpc, "eth_getLogs", [
          { fromBlock, toBlock: "latest", address: cfg.token, topics: [transferTopic, fromTopic] }
        ]);
        multisigCount = Array.isArray(logs) ? logs.length : null;
      }

      return {
        id: cfg.id,
        supply: supplyNow !== null ? `${formatUnits(supplyNow)} GHOST` : "?",
        emissions: emissionPerBlock !== null ? `${formatUnits(emissionPerBlock)} / blk` : "?",
        gasBase: baseFeeWei !== null ? `${formatNumber(Number(baseFeeWei) / 1e9, 3)} gwei` : "?",
        gasTarget: gasLimit !== null ? `${formatNumber(gasLimit / 1_000_000, 1)}M gas` : "?",
        treasury:
          nativeBal !== null || tokenBal !== null
            ? `${nativeBal !== null ? `${formatUnits(nativeBal)} ETH` : "?"} · ${
                tokenBal !== null ? `${formatUnits(tokenBal)} GHOST` : "?"
              }`
            : "?",
        multisig: multisigCount !== null ? `${multisigCount} transfers (last 5k blocks)` : "?"
      };
    } catch {
      return { id: cfg.id };
    }
  };

  const queryProm = async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  // Existing Prometheus metrics (if present) take precedence.
  const promQueries = {
    supply: "token_supply_total",
    emissions: "token_emission_rate",
    gasTarget: "gas_target_price",
    gasBase: "gas_base_fee",
    treasury: "treasury_balance_total",
    multisig: "treasury_multisig_pending"
  };

  const metrics = {};
  await Promise.all(
    Object.entries(promQueries).map(async ([key, q]) => {
      try {
        const resp = await queryProm(q);
        metrics[key] = resp?.data?.result || [];
      } catch (e) {
        metrics[key] = [];
      }
    })
  );

  const map = {};
  Object.entries(metrics).forEach(([key, series]) => {
    series.forEach((s) => {
      const id = s.metric.network || s.metric.chain || s.metric.layer || "l2";
      if (!map[id]) map[id] = { id };
      map[id][key] = s.value?.[1] || s.value;
    });
  });

  // Fill gaps with live RPC reads for L2 and L3.
  const rpcResults = await Promise.all([buildFromRpc(defaults.l2), buildFromRpc(defaults.l3)]);
  rpcResults.forEach((net) => {
    if (!map[net.id]) map[net.id] = net;
    else map[net.id] = { ...net, ...map[net.id] };
  });

  res.json({ ok: true, networks: Object.values(map) });
});

app.get("/api/contracts", async (_req, res) => {
  const pick = (...vals) => vals.find((v) => v);
  const readEnvValue = (filePath, key) => {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const line = raw
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${key}=`));
      if (!line) return null;
      return line.slice(key.length + 1).trim();
    } catch {
      return null;
    }
  };
  const formatPct = (num) => {
    if (num === null || num === undefined || Number.isNaN(num)) return "?";
    return `${num.toFixed(2)}%`;
  };

  const defaults = {
    l2: {
      id: "l2",
      rpc: pick(process.env.RPC_L2, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L2"), readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L2"), "http://localhost:9545")
    },
    l3: {
      id: "l3",
      rpc: pick(process.env.RPC_L3, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L3"), readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L3"), "http://localhost:10545")
    }
  };

  const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"; // EIP-1967 admin slot

  const analyzeNetwork = async (cfg) => {
    if (!cfg.rpc) return { id: cfg.id };
    try {
      const latest = await jsonRpc(cfg.rpc, "eth_getBlockByNumber", ["latest", false]);
      const latestNum = latest?.number ? parseInt(latest.number, 16) : 0;
      const latestTs = latest?.timestamp ? parseInt(latest.timestamp, 16) : null;
      const window = Math.min(latestNum, 50);
      let txCount = 0;
      let failedCount = 0;
      let deploys = 0;
      let ownerless = 0;
      let ownershipChecked = 0;
      let proxies = 0;

      // Gather tx hashes in window
      const blockNumbers = [];
      for (let i = 0; i <= window; i++) blockNumbers.push(`0x${(latestNum - i).toString(16)}`);

      const receipts = [];
      for (const num of blockNumbers) {
        const block = await jsonRpc(cfg.rpc, "eth_getBlockByNumber", [num, false]);
        const hashes = (block?.transactions || []).filter(Boolean);
        for (const h of hashes) {
          const r = await jsonRpc(cfg.rpc, "eth_getTransactionReceipt", [h]);
          if (r) receipts.push(r);
        }
      }

      for (const r of receipts) {
        txCount += 1;
        if (r.status === "0x0") failedCount += 1;
        if (r.contractAddress) deploys += 1;
      }

      const sampleDeploys = receipts.filter((r) => r.contractAddress).slice(0, 20);
      for (const dep of sampleDeploys) {
        const addr = dep.contractAddress;
        // owner()
        try {
          const ownerHex = await jsonRpc(cfg.rpc, "eth_call", [
            { to: addr, data: "0x8da5cb5b" },
            "latest"
          ]);
          if (typeof ownerHex === "string" && ownerHex.startsWith("0x")) {
            ownershipChecked += 1;
            const owner = ownerHex.slice(-40).toLowerCase();
            if (owner === "".padStart(40, "0")) ownerless += 1;
          }
        } catch {
          // ignore
        }
        // proxy admin slot
        try {
          const admin = await jsonRpc(cfg.rpc, "eth_getStorageAt", [addr, adminSlot, "latest"]);
          if (admin && admin !== "0x" && admin !== "0x0" && admin !== "0x".padEnd(66, "0")) {
            proxies += 1;
          }
        } catch {
          // ignore
        }
      }

      const revertRate = txCount ? (failedCount / txCount) * 100 : null;
      const paused = latestTs ? Date.now() / 1000 - latestTs > 60 : false;
      const aiRisk = revertRate !== null ? Math.min(100, revertRate * 2 + (paused ? 20 : 0)) : null;

      return {
        id: cfg.id,
        registry: deploys ? `${deploys} deploys (last ${window} blocks)` : "?",
        ownership:
          ownershipChecked > 0 ? `${ownerless}/${ownershipChecked} ownerless (sample)` : "?",
        proxies: ownershipChecked > 0 ? `${proxies}/${ownershipChecked} likely proxies` : "?",
        revertRate: revertRate !== null ? formatPct(revertRate) : "?",
        pause: paused ? "Paused/Delayed" : "Active",
        aiRisk: aiRisk !== null ? aiRisk.toFixed(1) : "?"
      };
    } catch {
      return { id: cfg.id };
    }
  };

  const queryProm = async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  const queries = {
    registry: "contracts_registry_total",
    ownership: "contracts_ownerless_total",
    proxies: "contracts_upgradeable_total",
    revertRate: "contracts_revert_rate",
    pause: "contracts_paused_total",
    aiRisk: "contracts_ai_risk_score"
  };

  const metrics = {};
  await Promise.all(
    Object.entries(queries).map(async ([key, q]) => {
      try {
        const resp = await queryProm(q);
        metrics[key] = resp?.data?.result || [];
      } catch (e) {
        metrics[key] = [];
      }
    })
  );

  const map = {};
  Object.entries(metrics).forEach(([key, series]) => {
    series.forEach((s) => {
      const id = s.metric.network || s.metric.chain || s.metric.layer || "l2";
      if (!map[id]) map[id] = { id };
      map[id][key] = s.value?.[1] || s.value;
    });
  });

  const rpcResults = await Promise.all([analyzeNetwork(defaults.l2), analyzeNetwork(defaults.l3)]);
  rpcResults.forEach((net) => {
    if (!map[net.id]) map[net.id] = net;
    else map[net.id] = { ...net, ...map[net.id] };
  });

  res.json({ ok: true, networks: Object.values(map) });
});

app.get("/api/bridge", async (_req, res) => {
  const pick = (...vals) => vals.find((v) => v);
  const readEnvValue = (filePath, key) => {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const line = raw
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${key}=`));
      if (!line) return null;
      return line.slice(key.length + 1).trim();
    } catch {
      return null;
    }
  };
  const formatNumber = (val, maxDecimals = 2) => {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return "?";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDecimals }).format(Number(val));
  };
  const formatUnits = (value, decimals = 18, maxDecimals = 4) => {
    if (value === null || value === undefined) return "?";
    const v = typeof value === "bigint" ? value : BigInt(value);
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    const frac = v % base;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxDecimals).replace(/0+$/, "");
    return `${whole.toString()}.${fracStr || "0"}`;
  };
  const rpcCall = async (url, method, params = []) => {
    try {
      return await jsonRpc(url, method, params);
    } catch {
      return null;
    }
  };
  const erc20Call = async (rpc, token, selector, args = "", blockTag = "latest") => {
    if (!token) return null;
    const data = `0x${selector}${args}`;
    const res = await rpcCall(rpc, "eth_call", [{ to: token, data }, blockTag]);
    if (typeof res !== "string" || !res.startsWith("0x")) return null;
    try {
      return BigInt(res);
    } catch {
      return null;
    }
  };
  const totalSupplyAt = async (rpc, token, blockTag = "latest") => erc20Call(rpc, token, "18160ddd", "", blockTag);
  const balanceOfAt = async (rpc, token, account, blockTag = "latest") => {
    if (!account) return null;
    const padded = account.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    return erc20Call(rpc, token, "70a08231", padded, blockTag);
  };

  const defaults = {
    l2: {
      id: "l2",
      rpc: pick(process.env.RPC_L2, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L2"), readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L2"), "http://localhost:9545"),
      bridge: pick(process.env.BRIDGE_L2L3_ADDRESS, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "BRIDGE_L2L3_ADDRESS"), readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "BRIDGE_L2L3_ADDRESS")),
      token: pick(process.env.L2_TOKEN_ADDRESS, readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "L2_TOKEN_ADDRESS"))
    },
    l3: {
      id: "l3",
      rpc: pick(process.env.RPC_L3, readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L3"), readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L3"), "http://localhost:10545"),
      token: pick(process.env.L3_TOKEN_ADDRESS, readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "L3_TOKEN_ADDRESS"))
    }
  };

  const queryProm = async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  const promQueries = {
    pending: "ghost_relayer_pending_finalizations",
    finalized: "ghost_relayer_finalize_success_total",
    deposits: "ghost_relayer_deposits_seen_total",
    proposerFinalized: "ghost_rollup_proposer_finalizations_total",
    challengerMismatch: "ghost_rollup_challenger_mismatches_total",
    challengerChallenges: "ghost_rollup_challenger_challenges_sent_total"
  };

  const metrics = {};
  await Promise.all(
    Object.entries(promQueries).map(async ([key, q]) => {
      try {
        const resp = await queryProm(q);
        metrics[key] = resp?.data?.result || [];
      } catch (e) {
        metrics[key] = [];
      }
    })
  );

  const map = {};
  const setVal = (id, key, val) => {
    if (!map[id]) map[id] = { id };
    map[id][key] = val;
  };

  Object.entries(metrics).forEach(([key, series]) => {
    series.forEach((s) => {
      const job = s.metric?.job || "";
      const id = job.includes("l3") ? "l3" : "l2";
      const value = s.value?.[1] || s.value;
      // Relayer metrics are shared; apply to both
      if (job.includes("ghost-relayer") || job === "ghost-relayer" || key === "pending" || key === "finalized" || key === "deposits") {
        setVal("l2", key, value);
        setVal("l3", key, value);
      } else {
        setVal(id, key, value);
      }
    });
  });

  // RPC + service fallbacks
  const relayerMetrics = await fetchJson("http://localhost:7171/metrics").catch(() => null);
  const l2Liquidity = async () => {
    if (!defaults.l2.rpc || !defaults.l2.bridge) return null;
    const nativeBalHex = await rpcCall(defaults.l2.rpc, "eth_getBalance", [defaults.l2.bridge, "latest"]);
    const nativeBal = nativeBalHex ? BigInt(nativeBalHex) : null;
    const tokenBal = await balanceOfAt(defaults.l2.rpc, defaults.l2.token, defaults.l2.bridge);
    if (nativeBal === null && tokenBal === null) return null;
    return `${nativeBal !== null ? `${formatUnits(nativeBal)} ETH` : "?"} · ${
      tokenBal !== null ? `${formatUnits(tokenBal)} GHOST` : "?"
    }`;
  };
  const l3Liquidity = async () => {
    if (!defaults.l3.rpc || !defaults.l3.token) return null;
    const supply = await totalSupplyAt(defaults.l3.rpc, defaults.l3.token);
    return supply !== null ? `${formatUnits(supply)} GHOST (L3)` : null;
  };

  const l2Block = await rpcCall(defaults.l2.rpc, "eth_getBlockByNumber", ["latest", false]);
  const l3Block = await rpcCall(defaults.l3.rpc, "eth_getBlockByNumber", ["latest", false]);

  const baseFeeL2 = l2Block?.baseFeePerGas ? `${formatNumber(Number(BigInt(l2Block.baseFeePerGas)) / 1e9, 3)} gwei` : "?";
  const baseFeeL3 = l3Block?.baseFeePerGas ? `${formatNumber(Number(BigInt(l3Block.baseFeePerGas)) / 1e9, 3)} gwei` : "?";

  const l2Proofs =
    map.l2?.challengerMismatch || map.l2?.challengerChallenges
      ? `${map.l2?.challengerMismatch ?? "0"} mismatches · ${map.l2?.challengerChallenges ?? "0"} challenges`
      : null;
  const l3Proofs =
    map.l3?.challengerMismatch || map.l3?.challengerChallenges
      ? `${map.l3?.challengerMismatch ?? "0"} mismatches · ${map.l3?.challengerChallenges ?? "0"} challenges`
      : null;

  const l2Liqu = (await l2Liquidity()) || map.l2?.liquidity;
  const l3Liqu = (await l3Liquidity()) || map.l3?.liquidity;

  setVal("l2", "liquidity", l2Liqu ?? "?");
  setVal("l3", "liquidity", l3Liqu ?? "?");

  const pendingRelayer = relayerMetrics?.pendingFinalizations;
  const finalizedRelayer = relayerMetrics?.finalizeSuccess;
  if (pendingRelayer !== undefined) {
    setVal("l2", "pending", formatNumber(pendingRelayer, 0));
    setVal("l3", "pending", formatNumber(pendingRelayer, 0));
  }
  if (finalizedRelayer !== undefined) {
    setVal("l2", "finalized", formatNumber(finalizedRelayer, 0));
    setVal("l3", "finalized", formatNumber(finalizedRelayer, 0));
  }

  setVal("l2", "fees", `Base fee ${baseFeeL2}`);
  setVal("l3", "fees", `Base fee ${baseFeeL3}`);

  setVal("l2", "pause", relayerMetrics ? (relayerMetrics.observeOnly ? "Observe-only (paused)" : "Active") : map.l2?.pause ?? "Interop");
  setVal("l3", "pause", relayerMetrics ? (relayerMetrics.observeOnly ? "Observe-only (paused)" : "Active") : map.l3?.pause ?? "Interop");

  setVal("l2", "proofs", l2Proofs ?? map.l2?.proofs ?? "?");
  setVal("l3", "proofs", l3Proofs ?? map.l3?.proofs ?? "?");

  if (!map.l2?.finalized && map.l2?.proposerFinalized) setVal("l2", "finalized", map.l2.proposerFinalized);
  if (!map.l3?.finalized && map.l3?.proposerFinalized) setVal("l3", "finalized", map.l3.proposerFinalized);

  res.json({ ok: true, networks: Object.values(map) });
});

app.get("/api/proofs", async (_req, res) => {
  const statusLabel = (ok) => (ok ? "Live" : "Degraded");
  const queryProm = async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  const promQueries = {
    proposals: "ghost_rollup_proposer_proposals_total",
    finalizations: "ghost_rollup_proposer_finalizations_total",
    proposerErrors: "ghost_rollup_proposer_errors_total",
    mismatches: "ghost_rollup_challenger_mismatches_total",
    challenges: "ghost_rollup_challenger_challenges_sent_total",
    challengerErrors: "ghost_rollup_challenger_errors_total"
  };

  const metrics = {};
  await Promise.all(
    Object.entries(promQueries).map(async ([key, q]) => {
      try {
        const resp = await queryProm(q);
        metrics[key] = resp?.data?.result || [];
      } catch {
        metrics[key] = [];
      }
    })
  );

  const map = {};
  const setVal = (id, key, val) => {
    if (!map[id]) map[id] = { id };
    map[id][key] = val;
  };
  Object.entries(metrics).forEach(([key, series]) => {
    series.forEach((s) => {
      const job = s.metric?.job || "";
      const id = job.includes("l3") ? "l3" : "l2";
      setVal(id, key, s.value?.[1] || s.value);
    });
  });

  const fetchHealth = async (url) => {
    try {
      return await fetchJson(url);
    } catch {
      return null;
    }
  };

  const proposerL2 = await fetchHealth("http://localhost:7272/health");
  const proposerL3 = await fetchHealth("http://localhost:7373/health");
  const challengerL2 = await fetchHealth("http://localhost:7282/health");
  const challengerL3 = await fetchHealth("http://localhost:7383/health");

  const addHealth = (id, proposer, challenger) => {
    if (!map[id]) map[id] = { id };
    const proposals = proposer?.metrics?.proposals;
    const finals = proposer?.metrics?.finalizations;
    const chall = challenger?.metrics?.challengesSent;
    const mism = challenger?.metrics?.mismatches;
    const nextBatch =
      challenger?.nextBatchToCheck ?? proposer?.nextChildBlock ?? proposer?.metrics?.nextChildBlock ?? null;
    const settlement = proposer?.settlementChainId || challenger?.settlementChainId || proposer?.rollup || null;
    const child = proposer?.childChainId || challenger?.childChainId || null;
    const degraded = Boolean((proposer && proposer.ok === false) || (challenger && challenger.ok === false));

    if (proposals !== undefined) setVal(id, "proposals", proposals);
    if (finals !== undefined) setVal(id, "finalizations", finals);
    if (chall !== undefined || mism !== undefined) {
      setVal(id, "challenges", `${chall ?? "0"} sent · ${mism ?? "0"} mismatches`);
    }
    if (nextBatch !== null) setVal(id, "next", nextBatch);
    if (settlement || child) {
      setVal(
        id,
        "settlement",
        `${settlement ? `L1/settle ${settlement}` : "—"}${child ? ` · child ${child}` : ""}`
      );
    }
    setVal(id, "status", statusLabel(!degraded));
  };

  addHealth("l2", proposerL2, challengerL2);
  addHealth("l3", proposerL3, challengerL3);

  res.json({ ok: true, networks: Object.values(map) });
});

// Feature module statuses for UI rollups
const moduleCatalog = [
  { title: "Access & Security", status: "live", points: ["RBAC matrix", "Admin multisig", "SSO + wallet auth", "Audit log stream"] },
  { title: "Nodes & Consensus", status: "live", points: ["Validator/full/archive inventory", "Sync/peer health", "Version drift alerts", "Restart hooks"] },
  { title: "Validators", status: "beta", points: ["Stake/commission view", "Missed blocks", "Proposer rotation", "Byzantine alerts"] },
  { title: "Token & Treasury", status: "beta", points: ["Supply/emissions", "Gas model controls", "Treasury balances", "Multisig spends"] },
  { title: "Contracts & VM", status: "plan", points: ["Registry + ownership", "Proxy/upgrade status", "Revert rate/AI risk", "Pause/emergency"] },
  { title: "Bridges & Interop", status: "plan", points: ["Pending/finalized transfers", "Liquidity pools", "Pause/fee tuning", "Fraud/fault proofs"] },
  { title: "Txs & Blocks", status: "live", points: ["Mempool & lifecycle", "Block production timeline", "MEV/fairness signals", "Gas insights"] },
  { title: "AI & Intelligence", status: "beta", points: ["Fraud/Sybil scoring", "Predictive congestion", "Downtime/slash risk", "Capacity planning"] },
  { title: "Observability & Alerts", status: "live", points: ["Prom/Grafana embeds", "Threshold + anomaly alerts", "Latency/KPI panels", "Webhooks/Slack/Email"] },
  { title: "DevOps & Upgrades", status: "plan", points: ["Fork scheduling", "Feature flags/canary", "Rollback paths", "Version compatibility"] },
  { title: "Governance", status: "plan", points: ["Proposal/voting dashboards", "Quorum tracking", "Delegations", "Snapshot/off-chain links"] },
  { title: "API & Integrations", status: "plan", points: ["RPC manager + rate limits", "API analytics", "SDK versions", "Exchange/oracle/indexer hooks"] },
  { title: "Advanced L2/L3", status: "plan", points: ["Sequencer controls", "Fraud/ZK proof views", "DA monitoring", "L1↔L2 settlement"] }
];

app.get("/api/modules", (_req, res) => res.json({ ok: true, modules: moduleCatalog }));

app.get("/api/access", async (_req, res) => {
  const rbac = [
    { capability: "Restart/upgrade nodes", admin: "✓", validator: "—", ops: "✓", viewer: "—" },
    { capability: "Modify guard/gate policy", admin: "✓", validator: "—", ops: "✓", viewer: "—" },
    { capability: "Submit governance props", admin: "✓", validator: "✓", ops: "—", viewer: "—" },
    { capability: "Treasury spend/bridge pause", admin: "✓", validator: "—", ops: "✓*", viewer: "—" },
    { capability: "View metrics/logs", admin: "✓", validator: "✓", ops: "✓", viewer: "✓" },
    { capability: "Deploy contracts", admin: "✓", validator: "—", ops: "✓", viewer: "—" },
    { capability: "Manage API keys", admin: "✓", validator: "—", ops: "✓", viewer: "—" }
  ];
  const ssoConfigured = Boolean(OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET);
  const walletAuth = true; // SIWE is wired
  const auditLog = path.join(ROOT_DIR, "dashboard", "data", "audit.log");
  const auditExists = fs.existsSync(auditLog);
  res.json({
    ok: true,
    status: "live",
    rbac,
    multisig: SAFE_CONTRACTS,
    ssoConfigured,
    walletAuth,
    auditLog: auditExists ? auditLog : null
  });
});

app.get("/api/nodes", async (_req, res) => {
  const networks = [
    { id: "l2", rpc: process.env.RPC_L2 || "http://localhost:9545" },
    { id: "l3", rpc: process.env.RPC_L3 || "http://localhost:10545" }
  ];
  const results = await Promise.all(
    networks.map(async (n) => {
      try {
        const blockNumHex = await jsonRpc(n.rpc, "eth_blockNumber");
        const sync = await jsonRpc(n.rpc, "eth_syncing");
        const peersHex = await jsonRpc(n.rpc, "net_peerCount");
        const version = await jsonRpc(n.rpc, "web3_clientVersion");
        const block = await jsonRpc(n.rpc, "eth_getBlockByNumber", [blockNumHex, false]);
        const up = Boolean(blockNumHex);
        const blockNum = blockNumHex ? parseInt(blockNumHex, 16) : null;
        const peers = peersHex ? parseInt(peersHex, 16) : null;
        return {
          id: n.id,
          up,
          block: blockNum,
          peers,
          syncing: sync && typeof sync === "object",
          version,
          lagSeconds: block?.timestamp ? Math.max(0, Math.floor(Date.now() / 1000 - parseInt(block.timestamp, 16))) : null
        };
      } catch (e) {
        return { id: n.id, up: false, error: e?.message || String(e) };
      }
    })
  );
  res.json({ ok: true, networks: results, status: "live" });
});

app.get("/api/txs", async (_req, res) => {
  const rpcUrls = { l2: process.env.RPC_L2 || "http://localhost:9545", l3: process.env.RPC_L3 || "http://localhost:10545" };
  const networks = await Promise.all(
    Object.entries(rpcUrls).map(async ([id, rpc]) => {
      try {
        const blockNumHex = await jsonRpc(rpc, "eth_blockNumber");
        const block = await jsonRpc(rpc, "eth_getBlockByNumber", [blockNumHex, true]);
        const gasPriceHex = await jsonRpc(rpc, "eth_gasPrice");
        const mempool = await jsonRpc(rpc, "txpool_status").catch(() => null);
        const txs = block?.transactions || [];
        return {
          id,
          block: blockNumHex,
          txs: txs.length,
          gasPrice: gasPriceHex,
          mempool
        };
      } catch (e) {
        return { id, error: e?.message || String(e) };
      }
    })
  );
  res.json({ ok: true, networks, status: "live" });
});

app.get("/api/ai", async (_req, res) => {
  const pick = (...vals) => vals.find((v) => v);
  const readEnvValue = (filePath, key) => {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const line = raw
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${key}=`));
      if (!line) return null;
      return line.slice(key.length + 1).trim();
    } catch {
      return null;
    }
  };
  const rpc = {
    l2: pick(
      process.env.RPC_L2,
      readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L2"),
      readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L2"),
      "http://localhost:9545"
    ),
    l3: pick(
      process.env.RPC_L3,
      readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RPC_L3"),
      readEnvValue(path.join(ROOT_DIR, "services/ghost-relayer/.env"), "RPC_L3"),
      "http://localhost:10545"
    )
  };

  const queryProm = async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  const promQueries = {
    risk: "ai_monitor_risk_score",
    congestion: "ai_monitor_congestion_score",
    action: "ai_monitor_last_action"
  };
  const prom = {};
  await Promise.all(
    Object.entries(promQueries).map(async ([key, q]) => {
      try {
        const resp = await queryProm(q);
        prom[key] = resp?.data?.result || [];
      } catch {
        prom[key] = [];
      }
    })
  );

  const buildRpcSignals = async (url) => {
    if (!url) return {};
    try {
      const block = await jsonRpc(url, "eth_getBlockByNumber", ["latest", true]);
      const peers = await jsonRpc(url, "net_peerCount").catch(() => null);
      const gasUsed = parseInt(block?.gasUsed || "0", 16);
      const gasLimit = parseInt(block?.gasLimit || "1", 16);
      const gasRatio = gasLimit > 0 ? gasUsed / gasLimit : 0;
      const txs = Array.isArray(block?.transactions) ? block.transactions.length : 0;
      const lag = block?.timestamp ? Math.max(0, Date.now() / 1000 - parseInt(block.timestamp, 16)) : null;
      const risk = Math.min(100, Math.round(gasRatio * 100 + (txs > 50 ? 10 : 0)));
      const congestion = Math.min(100, Math.round(gasRatio * 100));
      const downtime =
        lag !== null && lag > 30 ? `High risk (lag ${Math.round(lag)}s)` : peers === "0x0" ? "Peers=0 (risk)" : "Nominal";
      const capacity = `${Math.round((1 - gasRatio) * 100)}% headroom`;
      return { risk, congestion, downtime, capacity, action: "Observe" };
    } catch {
      return {};
    }
  };

  const map = { l2: { id: "l2" }, l3: { id: "l3" } };
  const setVal = (id, key, val) => {
    if (!map[id]) map[id] = { id };
    map[id][key] = val;
  };

  Object.entries(prom).forEach(([key, series]) => {
    series.forEach((s) => {
      const job = s.metric?.job || "";
      const id = job.includes("l3") ? "l3" : "l2";
      setVal(id, key, s.value?.[1] || s.value);
    });
  });

  const rpcSignals = await Promise.all(
    Object.entries(rpc).map(async ([id, url]) => ({ id, data: await buildRpcSignals(url) }))
  );
  rpcSignals.forEach(({ id, data }) => {
    Object.entries(data).forEach(([k, v]) => {
      if (!map[id]?.[k]) setVal(id, k, v);
    });
  });

  res.json({ ok: true, status: "beta", networks: Object.values(map) });
});

app.get("/api/observability", (_req, res) => {
  res.json({
    ok: true,
    status: "live",
    targets: [
      { title: "Prometheus", url: "http://localhost:9090" },
      { title: "Grafana", url: "http://localhost:3000" },
      { title: "Gate", url: "http://localhost:28546/gate/status" },
      { title: "Guard", url: "http://localhost:7070/health" }
    ]
  });
});

app.get("/api/devops", (_req, res) => {
  res.json({
    ok: true,
    status: "plan",
    items: ["Fork scheduling", "Feature flags/canary", "Rollback paths", "Version compatibility"]
  });
});

app.get("/api/governance", (_req, res) => {
  res.json({
    ok: true,
    status: "plan",
    items: ["Proposal/voting dashboards", "Quorum tracking", "Delegations", "Snapshot/off-chain links"]
  });
});

app.get("/api/integrations", (_req, res) => {
  const readEnvValue = (filePath, key) => {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const line = raw
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${key}=`));
      if (!line) return null;
      return line.slice(key.length + 1).trim();
    } catch {
      return null;
    }
  };
  const readPkgVersion = (pkgPath) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      return pkg?.version || null;
    } catch {
      return null;
    }
  };

  const rateLimitMax =
    process.env.RATE_LIMIT_MAX ||
    readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RATE_LIMIT_MAX") ||
    null;
  const rateLimitWindow =
    process.env.RATE_LIMIT_WINDOW_MS ||
    readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "RATE_LIMIT_WINDOW_MS") ||
    null;

  const apiKeyCount = readKeys()?.length || 0;
  const sdkVersions = {
    relayer: readPkgVersion(path.join(ROOT_DIR, "services/ghost-relayer/package.json")),
    guard: readPkgVersion(path.join(ROOT_DIR, "services/ghost-guard/package.json")),
    contracts: readPkgVersion(path.join(ROOT_DIR, "contracts/package.json"))
  };

  res.json({
    ok: true,
    status: "plan",
    rpcManager: { rateLimitMax, rateLimitWindowMs: rateLimitWindow },
    apiAnalytics: { apiKeyCount },
    sdkVersions,
    hooks: ["Exchange integrations", "Oracle feeds", "Indexer/webhook callbacks"]
  });
});

app.get("/api/advanced", (_req, res) => {
  res.json({
    ok: true,
    status: "plan",
    items: ["Sequencer controls", "Fraud/ZK proof views", "DA monitoring", "L1↔L2 settlement"]
  });
});

const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

app.get("/api/service/validators", async (_req, res) => {
  const queries = {
    stake: "validator_stake_tokens",
    commission: "validator_commission_rate",
    missedBlocks: "validator_missed_blocks_total",
    proposerIndex: "validator_proposer_rank",
    byzantine: "byzantine_alerts_total"
  };
  const metrics = {};
  await Promise.all(
    Object.entries(queries).map(async ([key, q]) => {
      try {
        const resp = await promQuery(q);
        metrics[key] = resp?.data?.result || [];
      } catch {
        metrics[key] = [];
      }
    })
  );
  const map = {};
  Object.entries(metrics).forEach(([key, series]) => {
    series.forEach((s) => {
      const id = s.metric.validator || s.metric.pubkey || s.metric.address || "unknown";
      if (!map[id]) map[id] = { id };
      map[id][key] = s.value?.[1] || s.value;
    });
  });
  const validators = Object.values(map).map((v) => {
    const stakeNum = Number(v.stake || 0);
    return {
      ...v,
      address: v.id,
      status: "active",
      power: Number.isFinite(stakeNum) ? stakeNum : 0
    };
  });
  res.json({ ok: true, status: "live", validators });
});

app.get("/api/service/staking", async (_req, res) => {
  try {
    const stakeResp = await promQuery("validator_stake_tokens");
    const commissionsResp = await promQuery("validator_commission_rate");
    const stakeSeries = stakeResp?.data?.result || [];
    const commissions = commissionsResp?.data?.result || [];
    const totalStake = stakeSeries.reduce((acc, s) => acc + Number(s.value?.[1] || 0), 0);
    const avgCommission =
      commissions.length > 0
        ? commissions.reduce((acc, s) => acc + Number(s.value?.[1] || 0), 0) / commissions.length
        : 0;
    res.json({
      ok: true,
      status: "beta",
      totalStake,
      avgCommission,
      validators: stakeSeries.map((s) => ({ id: s.metric.validator || s.metric.address, stake: s.value?.[1] }))
    });
  } catch (e) {
    res.json({ ok: true, status: "beta", totalStake: 0, avgCommission: 0, error: e?.message || String(e) });
  }
});

app.get("/api/service/rewards", async (_req, res) => {
  try {
    const supplyResp = await promQuery("token_supply_total");
    const emissionResp = await promQuery("token_emission_rate");
    const supply = supplyResp?.data?.result?.[0]?.value?.[1] || null;
    const emissions = emissionResp?.data?.result?.[0]?.value?.[1] || null;
    res.json({
      ok: true,
      status: "plan",
      supply,
      emissions
    });
  } catch (e) {
    res.json({ ok: true, status: "plan", supply: null, emissions: null, error: e?.message || String(e) });
  }
});

app.get("/api/service/participation", async (_req, res) => {
  try {
    const missedResp = await promQuery("validator_missed_blocks_total");
    const proposerResp = await promQuery("validator_proposer_rank");
    const missed = missedResp?.data?.result || [];
    const proposer = proposerResp?.data?.result || [];
    res.json({
      ok: true,
      status: "beta",
      missed,
      proposer
    });
  } catch (e) {
    res.json({ ok: true, status: "beta", missed: [], proposer: [], error: e?.message || String(e) });
  }
});

app.get("/api/service/slashes", async (_req, res) => {
  // Placeholder model until slash events are emitted; empty list keeps API stable.
  const slashEvents = [];
  res.json({ ok: true, status: "plan", slashEvents });
});

app.post("/api/manage/restart", requireRole("Ops"), async (req, res) => {
  const service = req.body?.service;
  const allow = [
    "ghostl2",
    "ghostl3",
    "ghost-guard",
    "ghost-relayer",
    "ghost-rollup-proposer-l2",
    "ghost-rollup-proposer-l3",
    "ghost-rollup-challenger-l2",
    "ghost-rollup-challenger-l3",
    "ai-monitor",
    "prometheus",
    "grafana",
    "anvil"
  ];
  if (!allow.includes(service)) return res.status(400).json({ ok: false, error: "invalid_service" });
  try {
    await runCompose(["restart", service]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "restart_failed" });
  }
});

app.post("/api/manage/logs", requireRole("Ops"), async (req, res) => {
  const service = req.body?.service;
  const lines = Math.max(10, Math.min(1000, Number(req.body?.lines || 200)));
  const allow = [
    "ghostl2",
    "ghostl3",
    "ghost-guard",
    "ghost-relayer",
    "ghost-rollup-proposer-l2",
    "ghost-rollup-proposer-l3",
    "ghost-rollup-challenger-l2",
    "ghost-rollup-challenger-l3",
    "ai-monitor"
  ];
  if (!allow.includes(service)) return res.status(400).json({ ok: false, error: "invalid_service" });
  try {
    const out = await runCompose(["logs", "--tail", String(lines), service]);
    res.json({ ok: true, logs: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "logs_failed" });
  }
});

app.post("/api/manage/guard", requireRole("Ops"), async (req, res) => {
  const mode = req.body?.mode;
  const threshold = req.body?.threshold;
  const delaySeconds = req.body?.delaySeconds;
  const guardUrl = process.env.GUARD_URL || "http://localhost:7070";
  const adminToken =
    process.env.GUARD_ADMIN_TOKEN ||
    readEnvValue(path.join(ROOT_DIR, "services/ghost-guard/.env"), "ADMIN_TOKEN") ||
    "";
  const headers = { "content-type": "application/json" };
  if (adminToken) headers["x-admin-token"] = adminToken;
  const results = {};
  const post = async (pathSuffix, body) => {
    const resp = await fetch(`${guardUrl}${pathSuffix}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    return resp.json().catch(() => ({}));
  };
  try {
    if (mode !== undefined) {
      await post("/policy/mode", { mode });
      results.mode = mode;
    }
    if (threshold !== undefined) {
      await post("/policy/threshold", { threshold });
      results.threshold = threshold;
    }
    if (delaySeconds !== undefined) {
      await post("/policy/delay", { seconds: delaySeconds });
      results.delaySeconds = delaySeconds;
    }
    res.json({ ok: true, updated: results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "guard_update_failed" });
  }
});

app.post("/api/manage/challenger", requireRole("Ops"), async (req, res) => {
  const layer = (req.body?.layer || "").toLowerCase();
  const batchId = req.body?.batchId;
  const url =
    layer === "l3"
      ? "http://localhost:7383/trigger"
      : layer === "l2"
      ? "http://localhost:7282/trigger"
      : null;
  if (!url) return res.status(400).json({ ok: false, error: "invalid_layer" });
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchId !== undefined ? { batchId } : {})
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(body.error || `status ${resp.status}`);
    res.json({ ok: true, result: body });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "trigger_failed" });
  }
});

app.get("/auth/me", async (req, res) => {
  const user = req.session.user || { role: "Viewer" };
  let keys = [];
  if (hasRole(req, "Ops")) {
    const core = await coreKeyProxy("GET", null);
    keys = core?.keys || readKeys();
  }
  res.json({ ok: true, user: { ...user, apiKeys: keys }, safes: SAFE_CONTRACTS });
});

// AuthService: wallet signature + SSO tokens are already handled via SIWE and OIDC flows above.
// RBACService: expose role → permissions matrix.
app.get("/api/rbac", (_req, res) => {
  res.json({
    ok: true,
    roles: roleOrder.map((name) => ({ id: name.toLowerCase(), name })),
    permissions: [
      { role: "Admin", permissions: ["*"] },
      { role: "Ops", permissions: ["read", "write:ops", "restart", "logs", "policy"] },
      { role: "Validator", permissions: ["read", "vote"] },
      { role: "Viewer", permissions: ["read"] }
    ]
  });
});

// AuditLogService: immutable view of audit log file if present.
const auditLogPath = path.join(ROOT_DIR, "dashboard", "data", "audit.log");
app.get("/api/audit", requireRole("Ops"), (req, res) => {
  try {
    const raw = fs.readFileSync(auditLogPath, "utf-8");
    const lines = raw.trim().split("\n").slice(-500);
    res.json({ ok: true, entries: lines });
  } catch {
    res.json({ ok: true, entries: [] });
  }
});

// User model exposure
app.get("/api/users/me", (req, res) => {
  const user = req.session.user || { role: "Viewer" };
  res.json({
    ok: true,
    user: {
      id: user.oidc?.sub || user.wallet?.address || "anon",
      email: user.oidc?.email || null,
      wallets: user.wallet ? [user.wallet.address] : [],
      roles: [user.role || "Viewer"]
    }
  });
});

// ApiKey model exposure
app.get("/api/keys/list", requireRole("Ops"), async (_req, res) => {
  const core = await coreKeyProxy("GET", null);
  const keys = core?.keys || readKeys();
  const normalized = keys.map((k) => ({
    id: k.id || k.key,
    name: k.label || "api-key",
    scopes: k.scopes || ["read"],
    lastUsedAt: k.lastUsedAt || null
  }));
  res.json({ ok: true, apiKeys: normalized });
});

// Session model exposure
app.get("/api/session", (req, res) => {
  res.json({
    ok: true,
    session: {
      id: req.sessionID,
      userId: req.session.user?.oidc?.sub || req.session.user?.wallet?.address || "anon",
      createdAt: new Date(req.session.cookie?._expires || Date.now()).toISOString(),
      ip: req.ip
    }
  });
});

app.post("/auth/role", (req, res) => {
  const role = req.body?.role;
  if (!roleOrder.includes(role)) {
    return res.status(400).json({ ok: false, error: "invalid_role" });
  }
  if (role === "Admin" && !hasRole(req, "Admin")) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  req.session.user.role = role;
  res.json({ ok: true, user: req.session.user });
});

app.get("/auth/siwe/nonce", (req, res) => {
  const nonce = generators.nonce();
  req.session.siweNonce = nonce;
  res.json({ nonce });
});

app.post("/auth/siwe/verify", async (req, res) => {
  const { message, signature } = req.body || {};
  if (!req.session.siweNonce) return res.status(400).json({ ok: false, error: "missing_nonce" });
  try {
    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({ signature, nonce: req.session.siweNonce, domain: req.get("host") });
    req.session.siweNonce = null;
    req.session.user.wallet = { address: result.data.address, chainId: siweMessage.chainId };
    req.session.user.role = req.session.user.role || "Viewer";
    res.json({ ok: true, wallet: req.session.user.wallet });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || "siwe_failed" });
  }
});

app.get("/auth/oidc/login", async (req, res) => {
  try {
    const client = await getOidcClient();
    const state = generators.state();
    const nonce = generators.nonce();
    req.session.oidcState = state;
    req.session.oidcNonce = nonce;
    const url = client.authorizationUrl({
      scope: "openid profile email",
      redirect_uri: OIDC_REDIRECT_URI,
      state,
      nonce
    });
    res.redirect(url);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || "oidc_failed" });
  }
});

app.get("/auth/oidc/callback", async (req, res) => {
  try {
    const client = await getOidcClient();
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(OIDC_REDIRECT_URI, params, {
      state: req.session.oidcState,
      nonce: req.session.oidcNonce
    });
    const claims = tokenSet.claims();
    req.session.user.oidc = {
      sub: claims.sub,
      email: claims.email,
      name: claims.name || claims.preferred_username
    };
    req.session.user.role = req.session.user.role || "Viewer";
    req.session.oidcState = null;
    req.session.oidcNonce = null;
    res.redirect("/");
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || "oidc_callback_failed" });
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/keys", requireRole("Ops"), async (_req, res) => {
  const core = await coreKeyProxy("GET", null);
  if (core?.keys) return res.json({ ok: true, keys: core.keys });
  res.json({ ok: true, keys: readKeys() });
});

app.post("/api/keys", requireRole("Ops"), async (req, res) => {
  const label = req.body?.label || "api-key";
  const core = await coreKeyProxy("POST", { label });
  if (core?.key) return res.json({ ok: true, key: core.key });
  const keys = readKeys();
  const record = {
    id: uuidv4(),
    label,
    key: `gsk_${uuidv4().replace(/-/g, "").slice(0, 24)}`,
    owner: req.session.user.wallet?.address || req.session.user.oidc?.email || "unknown",
    created: new Date().toISOString()
  };
  keys.unshift(record);
  writeKeys(keys);
  res.json({ ok: true, key: record });
});

app.delete("/api/keys/:id", requireRole("Ops"), async (req, res) => {
  const id = req.params.id;
  const core = await coreKeyProxy("DELETE", null, `/${id}`);
  if (core?.ok) return res.json({ ok: true });

  const keys = readKeys();
  const filtered = keys.filter((k) => k.id !== id);
  if (filtered.length === keys.length) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }
  writeKeys(filtered);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`ghostl-stack dashboard running on http://localhost:${PORT}`);
});
