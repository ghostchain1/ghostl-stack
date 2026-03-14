/**
 * GhostBrain Agent — Node Metrics
 *
 * Reads CPU / memory / disk I/O / network stats from Linux /proc filesystem.
 * Maintains previous sample state to compute rates (CPU %, kbps, etc.).
 *
 * Falls back gracefully when /proc is unavailable (non-Linux or restricted container).
 */

import { readFile } from "node:fs/promises";
import { hostname } from "node:os";

export const NODE_ID = process.env.AGENT_NODE_ID ?? hostname();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CpuMetrics {
  usagePercent: number;
  iowaitPercent: number;
  cores: number;
}

export interface MemMetrics {
  totalMb: number;
  usedMb: number;
  usagePercent: number;
  swapTotalMb: number;
  swapUsedMb: number;
}

export interface DiskMetrics {
  readKbps: number;
  writeKbps: number;
  ioSaturationPercent: number;
}

export interface NetMetrics {
  rxKbps: number;
  txKbps: number;
  errors: number;
}

export interface NodeMetrics {
  nodeId: string;
  timestamp: number;
  cpu: CpuMetrics;
  memory: MemMetrics;
  disk: DiskMetrics;
  network: NetMetrics;
}

// ── CPU ───────────────────────────────────────────────────────────────────────

interface CpuRaw {
  active: number;
  idle: number;
  iowait: number;
  total: number;
}

let _prevCpu: CpuRaw | null = null;

async function getCpuMetrics(): Promise<CpuMetrics> {
  try {
    const text = await readFile("/proc/stat", "utf8");
    const lines = text.split("\n");
    const cpuLine = lines[0] ?? "";
    const parts = cpuLine.trim().split(/\s+/).slice(1).map(Number);
    const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = parts;
    const active = user + nice + system + irq + softirq + steal;
    const total  = active + idle + iowait;
    const curr: CpuRaw = { active, idle, iowait, total };

    let usagePercent  = 0;
    let iowaitPercent = 0;

    if (_prevCpu !== null) {
      const dt = curr.total - _prevCpu.total;
      if (dt > 0) {
        usagePercent  = ((curr.active - _prevCpu.active) / dt) * 100;
        iowaitPercent = ((curr.iowait - _prevCpu.iowait) / dt) * 100;
      }
    }
    _prevCpu = curr;

    const cores = lines.filter(l => /^cpu\d/.test(l)).length || 1;
    return {
      usagePercent:  Math.max(0, Math.min(100, usagePercent)),
      iowaitPercent: Math.max(0, Math.min(100, iowaitPercent)),
      cores,
    };
  } catch {
    return { usagePercent: 0, iowaitPercent: 0, cores: 1 };
  }
}

// ── Memory ────────────────────────────────────────────────────────────────────

async function getMemMetrics(): Promise<MemMetrics> {
  try {
    const text = await readFile("/proc/meminfo", "utf8");
    const get = (key: string): number => {
      const m = text.match(new RegExp(`${key}:\\s+(\\d+)`));
      return m ? parseInt(m[1]!, 10) : 0;
    };
    const totalKb    = get("MemTotal");
    const availKb    = get("MemAvailable");
    const swapTotalKb = get("SwapTotal");
    const swapFreeKb  = get("SwapFree");
    const usedKb     = totalKb - availKb;
    return {
      totalMb: Math.round(totalKb / 1024),
      usedMb:  Math.round(usedKb / 1024),
      usagePercent: totalKb > 0 ? (usedKb / totalKb) * 100 : 0,
      swapTotalMb: Math.round(swapTotalKb / 1024),
      swapUsedMb:  Math.round((swapTotalKb - swapFreeKb) / 1024),
    };
  } catch {
    return { totalMb: 0, usedMb: 0, usagePercent: 0, swapTotalMb: 0, swapUsedMb: 0 };
  }
}

// ── Disk I/O ──────────────────────────────────────────────────────────────────

interface DiskRaw { readSectors: number; writeSectors: number; ioTicks: number; }
let _prevDisk: { raw: DiskRaw; ts: number } | null = null;

async function getDiskMetrics(): Promise<DiskMetrics> {
  try {
    const text = await readFile("/proc/diskstats", "utf8");
    // Only aggregate physical disks (sda/sdb/nvme0n1 etc.), skip partitions
    const diskRe = /^\s*\d+\s+0\s+(sd[a-z]|nvme\d+n\d+|vd[a-z]|xvd[a-z])\s+(\d+)\s+\d+\s+(\d+)\s+\d+\s+(\d+)\s+\d+\s+(\d+)\s+\d+\s+(\d+)\s/;
    let readSectors = 0;
    let writeSectors = 0;
    let ioTicks = 0;
    for (const line of text.split("\n")) {
      const m = line.match(diskRe);
      if (m) {
        readSectors  += parseInt(m[3]!, 10);
        writeSectors += parseInt(m[5]!, 10);
        ioTicks      += parseInt(m[6]!, 10);
      }
    }
    const now = Date.now();
    const curr: DiskRaw = { readSectors, writeSectors, ioTicks };

    let readKbps  = 0;
    let writeKbps = 0;
    let ioSaturationPercent = 0;

    if (_prevDisk !== null) {
      const dtMs = now - _prevDisk.ts;
      if (dtMs > 0) {
        const dtSec = dtMs / 1000;
        // 1 sector = 512 bytes
        readKbps  = ((curr.readSectors  - _prevDisk.raw.readSectors)  * 512) / 1024 / dtSec;
        writeKbps = ((curr.writeSectors - _prevDisk.raw.writeSectors) * 512) / 1024 / dtSec;
        // ioTicks is in ms; saturation = ioTicks delta / elapsed ms * 100
        ioSaturationPercent = Math.min(100, ((curr.ioTicks - _prevDisk.raw.ioTicks) / dtMs) * 100);
      }
    }
    _prevDisk = { raw: curr, ts: now };
    return {
      readKbps:  Math.max(0, readKbps),
      writeKbps: Math.max(0, writeKbps),
      ioSaturationPercent: Math.max(0, ioSaturationPercent),
    };
  } catch {
    return { readKbps: 0, writeKbps: 0, ioSaturationPercent: 0 };
  }
}

// ── Network ───────────────────────────────────────────────────────────────────

interface NetRaw { rxBytes: number; txBytes: number; rxErrors: number; txErrors: number; }
let _prevNet: { raw: NetRaw; ts: number } | null = null;

async function getNetMetrics(): Promise<NetMetrics> {
  try {
    const text = await readFile("/proc/net/dev", "utf8");
    let rxBytes = 0; let txBytes = 0; let rxErrors = 0; let txErrors = 0;
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*(\w+):\s+(\d+)\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+\d+\s+(\d+)/);
      if (!m || m[1] === "lo") continue; // skip loopback
      rxBytes  += parseInt(m[2]!, 10);
      rxErrors += parseInt(m[3]!, 10);
      txBytes  += parseInt(m[4]!, 10);
      txErrors += parseInt(m[5]!, 10);
    }
    const now = Date.now();
    const curr: NetRaw = { rxBytes, txBytes, rxErrors, txErrors };

    let rxKbps = 0;
    let txKbps = 0;

    if (_prevNet !== null) {
      const dtSec = (now - _prevNet.ts) / 1000;
      if (dtSec > 0) {
        rxKbps = ((curr.rxBytes - _prevNet.raw.rxBytes) / 1024) / dtSec;
        txKbps = ((curr.txBytes - _prevNet.raw.txBytes) / 1024) / dtSec;
      }
    }
    _prevNet = { raw: curr, ts: now };
    return {
      rxKbps:  Math.max(0, rxKbps),
      txKbps:  Math.max(0, txKbps),
      errors: rxErrors + txErrors,
    };
  } catch {
    return { rxKbps: 0, txKbps: 0, errors: 0 };
  }
}

// ── Public ────────────────────────────────────────────────────────────────────

export async function readNodeMetrics(): Promise<NodeMetrics> {
  const [cpu, memory, disk, network] = await Promise.all([
    getCpuMetrics(),
    getMemMetrics(),
    getDiskMetrics(),
    getNetMetrics(),
  ]);
  return { nodeId: NODE_ID, timestamp: Date.now(), cpu, memory, disk, network };
}
