import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const ingestTicks = new client.Counter({
  name: 'pil_ingest_ticks_total',
  help: 'Total ingest ticks',
  registers: [register]
});

export const rpcErrors = new client.Counter({
  name: 'pil_rpc_errors_total',
  help: 'RPC errors by chain and method',
  labelNames: ['chain', 'method'],
  registers: [register]
});

export const blocksIngested = new client.Counter({
  name: 'pil_blocks_ingested_total',
  help: 'Blocks ingested',
  labelNames: ['chain'],
  registers: [register]
});

export const txsIngested = new client.Counter({
  name: 'pil_txs_ingested_total',
  help: 'Transactions ingested',
  labelNames: ['chain'],
  registers: [register]
});

export const receiptsIngested = new client.Counter({
  name: 'pil_receipts_ingested_total',
  help: 'Receipts ingested',
  labelNames: ['chain'],
  registers: [register]
});

export const tracesIngested = new client.Counter({
  name: 'pil_traces_ingested_total',
  help: 'Traces ingested',
  labelNames: ['chain'],
  registers: [register]
});

export const chainHead = new client.Gauge({
  name: 'pil_chain_head',
  help: 'Latest chain head observed',
  labelNames: ['chain'],
  registers: [register]
});

export const complianceDecisions = new client.Counter({
  name: 'pil_compliance_decisions_total',
  help: 'Compliance decisions emitted',
  labelNames: ['decision', 'jurisdiction'],
  registers: [register]
});

export const attestationsRegistered = new client.Counter({
  name: 'pil_attestations_total',
  help: 'Compliance attestations registered',
  labelNames: ['status'],
  registers: [register]
});

export const metricsHandler = async () => register.metrics();
