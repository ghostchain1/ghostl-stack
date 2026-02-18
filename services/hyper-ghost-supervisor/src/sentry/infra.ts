import os from 'node:os';

export type InfraSnapshot = {
  ok: boolean;
  ts: number;
  hostname: string;
  loadavg: number[];
  uptime_sec: number;
  mem: { total: number; free: number };
  note?: string;
};

export function snapshotInfra(): InfraSnapshot {
  const ts = Math.floor(Date.now() / 1000);
  return {
    ok: true,
    ts,
    hostname: os.hostname(),
    loadavg: os.loadavg(),
    uptime_sec: Math.floor(os.uptime()),
    mem: { total: os.totalmem(), free: os.freemem() },
    note: 'Best-effort host snapshot (container values if running in Docker).'
  };
}

