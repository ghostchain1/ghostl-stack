const statusEl = document.getElementById("status");
const guardHealthEl = document.getElementById("guardHealth");
const relayerHealthEl = document.getElementById("relayerHealth");
const listsEl = document.getElementById("lists");
const eventsEl = document.getElementById("events");
const alertsEl = document.getElementById("alerts");
const guardMetricsEl = document.getElementById("guardMetrics");
const relayerMetricsEl = document.getElementById("relayerMetrics");
const guardLogsEl = document.getElementById("guardLogs");
const relayerLogsEl = document.getElementById("relayerLogs");

const tokenInput = document.getElementById("adminToken");
const saveTokenBtn = document.getElementById("saveToken");

const refreshBtn = document.getElementById("refresh");
const reloadListsBtn = document.getElementById("reloadLists");

const modeSel = document.getElementById("mode");
const thresholdInput = document.getElementById("threshold");
const delayInput = document.getElementById("delay");
const setModeBtn = document.getElementById("setMode");
const setThresholdBtn = document.getElementById("setThreshold");
const setDelayBtn = document.getElementById("setDelay");

const listAddressInput = document.getElementById("listAddress");
const allowBtn = document.getElementById("allow");
const blockBtn = document.getElementById("block");
const removeBtn = document.getElementById("remove");

function getToken() {
  return localStorage.getItem("ghost_guard_admin_token") || "";
}

function setToken(token) {
  localStorage.setItem("ghost_guard_admin_token", token);
}

tokenInput.value = getToken();

saveTokenBtn.addEventListener("click", () => {
  setToken(tokenInput.value.trim());
  statusEl.textContent = "Token saved";
});

async function api(path, { method = "GET", body } = {}) {
  const headers = { "content-type": "application/json" };
  const token = getToken();
  if (token) headers["x-admin-token"] = token;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json;
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

async function refreshAll() {
  statusEl.textContent = "Refreshing...";
  try {
    const guard = await api("/health");
    guardHealthEl.textContent = pretty(guard);

    const relayer = await api("/proxy/relayer-health");
    relayerHealthEl.textContent = pretty(relayer);

    const events = await api("/events");
    eventsEl.textContent = pretty(events);

    const alerts = await api("/alerts");
    alertsEl.textContent = pretty(alerts);

    const guardMetrics = await api("/metrics");
    guardMetricsEl.textContent = pretty(guardMetrics);

    const relayerMetrics = await api("/proxy/relayer-metrics");
    relayerMetricsEl.textContent = pretty(relayerMetrics);

    const guardLogs = await api("/logs");
    guardLogsEl.textContent = pretty(guardLogs);

    const relayerLogs = await api("/proxy/relayer-logs");
    relayerLogsEl.textContent = pretty(relayerLogs);

    const lists = await api("/lists");
    listsEl.textContent = pretty(lists);

    if (typeof guard?.riskThreshold === "number") thresholdInput.value = String(guard.riskThreshold);
    if (typeof guard?.delaySeconds === "number") delayInput.value = String(guard.delaySeconds);
    if (typeof guard?.policyMode === "number") modeSel.value = String(guard.policyMode);

    statusEl.textContent = "OK";
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
}

refreshBtn.addEventListener("click", refreshAll);
reloadListsBtn.addEventListener("click", refreshAll);

setModeBtn.addEventListener("click", async () => {
  statusEl.textContent = "Setting mode...";
  try {
    await api("/policy/mode", { method: "POST", body: { mode: Number(modeSel.value) } });
    await refreshAll();
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
});

setThresholdBtn.addEventListener("click", async () => {
  statusEl.textContent = "Setting threshold...";
  try {
    await api("/policy/threshold", { method: "POST", body: { threshold: Number(thresholdInput.value) } });
    await refreshAll();
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
});

setDelayBtn.addEventListener("click", async () => {
  statusEl.textContent = "Setting delay...";
  try {
    await api("/policy/delay", { method: "POST", body: { seconds: Number(delayInput.value) } });
    await refreshAll();
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
});

async function listAction(path) {
  statusEl.textContent = "Updating list...";
  const address = listAddressInput.value.trim();
  if (!address) {
    statusEl.textContent = "Enter address";
    return;
  }
  try {
    await api(path, { method: "POST", body: { address } });
    await refreshAll();
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
}

allowBtn.addEventListener("click", () => listAction("/lists/allow"));
blockBtn.addEventListener("click", () => listAction("/lists/block"));
removeBtn.addEventListener("click", () => listAction("/lists/remove"));

refreshAll();
