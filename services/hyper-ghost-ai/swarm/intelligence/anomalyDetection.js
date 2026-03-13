/**
 * @file swarm/intelligence/anomalyDetection.js
 * @description GhostStack AI Swarm — Anomaly detection engine.
 *
 * Polls infrastructure and chain endpoints on a configurable interval.
 * Emits specific anomaly events on swarmBus so agents can react.
 * Also emits the generic `swarm:event` for the ring buffer in swarmController.
 *
 * Polled sources:
 *   - GAIS containers   → anomaly:container
 *   - GAIS VMs          → anomaly:vm
 *   - AI service health → anomaly:node_offline
 *   - L1/L2/L3 blocks   → anomaly:chain_stale
 *   - Cosmos validators → anomaly:validator_jailed
 *   - Compliance API    → anomaly:compliance_violation
 *
 * Governance: this module ONLY emits events — no proposals, no direct actions.
 */

import https from 'node:https';
import http  from 'node:http';
import { swarmBus } from '../messaging/eventBus.js';

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_MS              = parseInt(process.env.ANOMALY_POLL_MS       ?? '30000', 10);
const GAIS_URL             = process.env.GAIS_URL                       ?? 'http://localhost:9100';
const INFRA_CTRL_URL       = process.env.INFRA_CONTROLLER_URL           ?? 'http://localhost:7940';
const COSMOS_LCD_URL       = process.env.COSMOS_LCD_URL                 ?? 'http://localhost:1317';
const COMPLIANCE_URL       = process.env.COMPLIANCE_SERVICE_URL         ?? 'http://localhost:8090';
const CHAIN_L1             = process.env.L1_RPC_URL                     ?? 'http://localhost:18545';
const CHAIN_L2             = process.env.L2_RPC_URL                     ?? 'http://localhost:29545';
const CHAIN_L3             = process.env.L3_RPC_URL                     ?? 'http://localhost:39545';
const BLOCK_STALE_MS       = parseInt(process.env.BLOCK_STALE_MS        ?? '120000', 10);
const CPU_THRESHOLD        = parseFloat(process.env.ANOMALY_CPU_PCT     ?? '90');
const RAM_THRESHOLD        = parseFloat(process.env.ANOMALY_RAM_PCT     ?? '92');

// AI service ports to health-check
const AI_SERVICES = [
  { name: 'ghostbrain-core',     port: 7900 },
  { name: 'signing-relay',       port: 7910 },
  { name: 'governance-ai',       port: 7920 },
  { name: 'infra-controller',    port: 7940 },
  { name: 'ghost-noc-ai',        port: 7960 },
  { name: 'hyper-ghost-ai',      port: 7741 },
];

// ── State ─────────────────────────────────────────────────────────────────────
const _lastBlockTs = { l1: 0, l2: 0, l3: 0 };  // last seen block timestamp per chain
const _lastBlock   = { l1: 0n, l2: 0n, l3: 0n };

let _runCount  = 0;
let _errorCount = 0;
let _started   = false;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, module: 'anomaly-detection', msg, ...extra }) + '\n'
  );
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function fetchJson(rawUrl, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const url       = new URL(rawUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const options   = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'GET',
      headers:  { 'User-Agent': 'hyper-ghost-ai-anomaly/1.0' },
      timeout:  timeoutMs,
    };
    const req = transport.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function rpcBlockNumber(rpcUrl) {
  return new Promise((resolve, reject) => {
    const body      = JSON.stringify({ jsonrpc: '2.0', method: 'ghost_blockNumber', params: [], id: 1 });
    const url       = new URL(rpcUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const options   = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname || '/',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'hyper-ghost-ai-anomaly/1.0',
      },
      timeout: 5000,
    };
    const req = transport.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(BigInt(parsed.result));
        } catch { reject(new Error('invalid rpc response')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function emit(eventName, payload) {
  swarmBus.emit(eventName, payload);
  swarmBus.emit('swarm:event', { type: eventName, payload, ts: Date.now() });
}

// ── Detection passes ──────────────────────────────────────────────────────────

async function checkContainers() {
  try {
    const { status, data } = await fetchJson(`${GAIS_URL}/containers`);
    if (status !== 200 || !Array.isArray(data?.containers)) return;
    for (const c of data.containers) {
      const state = c.state ?? c.status ?? '';
      if (['exited', 'dead', 'paused'].includes(state.toLowerCase())) {
        emit('anomaly:container', { name: c.name, containerId: c.id, state });
      }
    }
  } catch (err) {
    log('debug', 'check-containers-error', { error: err.message });
  }
}

async function checkVMs() {
  try {
    const { status, data } = await fetchJson(`${INFRA_CTRL_URL}/api/v1/vms`);
    if (status !== 200 || !Array.isArray(data?.vms)) return;
    for (const vm of data.vms) {
      const state = vm.state ?? '';
      if (['crashed', 'error', 'paused'].includes(state.toLowerCase())) {
        emit('anomaly:vm', { name: vm.name, state });
      } else {
        const cpu = parseFloat(vm.cpuPercent ?? vm.cpu_percent ?? 0);
        const ram = parseFloat(vm.ramPercent ?? vm.ram_percent ?? 0);
        if (cpu > CPU_THRESHOLD || ram > RAM_THRESHOLD) {
          emit('anomaly:vm', { name: vm.name, cpuPercent: cpu, ramPercent: ram });
        }
      }
    }
  } catch (err) {
    log('debug', 'check-vms-error', { error: err.message });
  }
}

async function checkAIServices() {
  for (const svc of AI_SERVICES) {
    try {
      const { status } = await fetchJson(`http://127.0.0.1:${svc.port}/health`, 3000);
      if (status !== 200) {
        emit('anomaly:node_offline', { serviceName: svc.name, port: svc.port });
      }
    } catch {
      emit('anomaly:node_offline', { serviceName: svc.name, port: svc.port });
    }
  }
}

async function checkChains() {
  const chains = [
    { key: 'l1', url: CHAIN_L1 },
    { key: 'l2', url: CHAIN_L2 },
    { key: 'l3', url: CHAIN_L3 },
  ];
  for (const { key, url } of chains) {
    try {
      const blockNum = await rpcBlockNumber(url);
      const now = Date.now();
      if (blockNum > _lastBlock[key]) {
        _lastBlock[key]   = blockNum;
        _lastBlockTs[key] = now;
      } else if (_lastBlockTs[key] > 0 && now - _lastBlockTs[key] > BLOCK_STALE_MS) {
        emit('anomaly:chain_stale', { chain: key, lastBlock: blockNum.toString(), staleMs: now - _lastBlockTs[key] });
      }
    } catch (err) {
      log('debug', `check-chain-${key}-error`, { error: err.message });
    }
  }
}

async function checkValidators() {
  try {
    const { status, data } = await fetchJson(`${COSMOS_LCD_URL}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_UNBONDING&pagination.limit=100`);
    if (status !== 200 || !Array.isArray(data?.validators)) return;
    const jailed = data.validators.filter(v => v.jailed === true);
    if (jailed.length > 0) {
      // Get total count
      let total = jailed.length;
      try {
        const tot = await fetchJson(`${COSMOS_LCD_URL}/cosmos/staking/v1beta1/validators?pagination.limit=1`);
        total = parseInt(tot.data?.pagination?.total ?? jailed.length, 10);
      } catch { /* fallback to jailed count */ }

      for (const v of jailed) {
        emit('anomaly:validator_jailed', {
          operatorAddress: v.operator_address,
          moniker:         v.description?.moniker ?? '',
          jailedCount:     jailed.length,
          totalValidators: total,
        });
      }
    }
  } catch (err) {
    log('debug', 'check-validators-error', { error: err.message });
  }
}

async function checkCompliance() {
  try {
    const { status, data } = await fetchJson(`${COMPLIANCE_URL}/api/security/summary`);
    if (status !== 200 || !data) return;
    const violations = Array.isArray(data.violations) ? data.violations : [];
    for (const v of violations) {
      if (v.severity === 'high' || v.severity === 'critical') {
        emit('anomaly:compliance_violation', {
          ruleId:      v.ruleId ?? v.rule_id ?? 'unknown',
          description: v.description ?? '',
          entityId:    v.entityId ?? v.entity_id ?? '',
        });
      }
    }
  } catch (err) {
    log('debug', 'check-compliance-error', { error: err.message });
  }
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function runDetection() {
  _runCount++;
  const start = Date.now();
  try {
    await Promise.allSettled([
      checkContainers(),
      checkVMs(),
      checkAIServices(),
      checkChains(),
      checkValidators(),
      checkCompliance(),
    ]);
    log('debug', 'detection-cycle-done', { run: _runCount, ms: Date.now() - start });
  } catch (err) {
    _errorCount++;
    log('error', 'detection-cycle-error', { run: _runCount, error: err.message });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startAnomalyDetection() {
  if (_started) return;
  _started = true;
  log('info', 'anomaly-detection-started', { pollMs: POLL_MS });
  // First pass immediately, then on interval
  setImmediate(runDetection);
  setInterval(runDetection, POLL_MS).unref();
}

export function getAnomalyStats() {
  return { runs: _runCount, errors: _errorCount, pollMs: POLL_MS, started: _started };
}
