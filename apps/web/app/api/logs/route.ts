import { NextRequest, NextResponse } from 'next/server';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'AUDIT';

export type LogEntry = {
  id: string;
  ts: string;
  level: LogLevel;
  service: string;
  msg: string;
  trace?: string;
};

const LOG_ENTRIES: LogEntry[] = [
  { id: 'e001', ts: '2026-03-01T14:22:04.312Z', level: 'WARN',  service: 'l3-prover',       msg: 'Proof generation exceeded 1s threshold (1.82s) · proof_id=0xA4b…',            trace: 'prover-03' },
  { id: 'e002', ts: '2026-03-01T14:21:58.001Z', level: 'INFO',  service: 'l2-bridge-relay', msg: 'L3→L2 batch submitted · batch_id=B-29814 · 44 txs' },
  { id: 'e003', ts: '2026-03-01T14:20:33.788Z', level: 'AUDIT', service: 'ghostcontract',    msg: 'GhostPolicyGate.commit() called · caller=0x9E8f…1B2C · policy_hash=0xDEAD…', trace: 'block 3847188' },
  { id: 'e004', ts: '2026-03-01T14:19:12.450Z', level: 'INFO',  service: 'l1-consensus',     msg: 'Block 2847392 finalised · validators=21/21 · gas_used=4,821,224' },
  { id: 'e005', ts: '2026-03-01T14:18:55.102Z', level: 'WARN',  service: 'api-gateway',      msg: 'Rate limit headers missing on response · route=/v1/audit · request_id=req_7fa2' },
  { id: 'e006', ts: '2026-03-01T14:17:44.299Z', level: 'INFO',  service: 'treasury-ai',      msg: 'Yield allocation cycle complete · pool=LP-07 · amount=1,284.42 GST' },
  { id: 'e007', ts: '2026-03-01T14:16:39.888Z', level: 'DEBUG', service: 'l3-sequencer',     msg: 'Mempool flush · 240 txs · fee_base=0.00001 GST · duration=412ms' },
  { id: 'e008', ts: '2026-03-01T14:15:31.540Z', level: 'AUDIT', service: 'kyc-service',      msg: 'KYC submission received · sub_id=KYC-0482 · doc_type=Passport · risk=low' },
  { id: 'e009', ts: '2026-03-01T14:14:22.003Z', level: 'ERROR', service: 'l3-prover',        msg: 'Prover-03 OOM (heap 95%) — memory rebalance triggered',                       trace: 'prover-03 node' },
  { id: 'e010', ts: '2026-03-01T14:13:05.771Z', level: 'INFO',  service: 'l2-liquidity',     msg: 'LP utilisation reached 84% warning threshold · pool=GHOST/USDC' },
  { id: 'e011', ts: '2026-03-01T14:12:01.420Z', level: 'INFO',  service: 'ghostsentinel',    msg: 'Threat scan complete — 0 HIGH findings · scanned 182 contracts' },
  { id: 'e012', ts: '2026-03-01T14:11:44.190Z', level: 'AUDIT', service: 'governance',       msg: 'GIP-0017 vote cast · voter=0x1F3a…F3a · weight=12,400' },
  { id: 'e013', ts: '2026-03-01T14:10:33.001Z', level: 'DEBUG', service: 'l3-batcher',       msg: 'Batch compression ratio 4.3× · raw=1.8MB compressed=418KB' },
  { id: 'e014', ts: '2026-03-01T14:09:17.552Z', level: 'INFO',  service: 'ghostchain-rpc',   msg: 'eth_getLogs request served · 3 topics · 14ms' },
  { id: 'e015', ts: '2026-03-01T14:08:09.001Z', level: 'WARN',  service: 'ghostsentinel',    msg: 'Contract 0xB3e9…A112 flagged for manual review · pattern: reentrancy hint' },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const level   = searchParams.get('level')?.toUpperCase() as LogLevel | null;
  const service = searchParams.get('service');
  const q       = searchParams.get('q')?.toLowerCase();
  const limit   = Math.min(Number(searchParams.get('limit') ?? 50), 200);

  let data = LOG_ENTRIES;
  if (level)   data = data.filter(e => e.level === level);
  if (service) data = data.filter(e => e.service === service);
  if (q)       data = data.filter(e => e.msg.toLowerCase().includes(q) || (e.trace ?? '').toLowerCase().includes(q));

  const services = [...new Set(LOG_ENTRIES.map(e => e.service))];

  return NextResponse.json({
    logs: data.slice(0, limit),
    total: data.length,
    services,
    levels: ['INFO', 'WARN', 'ERROR', 'DEBUG', 'AUDIT'] satisfies LogLevel[],
  });
}
