import { randomUUID, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { GhostProvider } = require("../../../packages/ghost-sdk-core/src/provider/GhostProvider.js");

export const CHAIN_IDS = Object.freeze({
  L1: 14000101,
  L2: 901,
  L3: 903
});

const TERMINAL_STATUSES = new Set(["failed", "sent"]);

export function normalizeLayer(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "L1" || normalized === "1") return "L1";
  if (normalized === "L2" || normalized === "2") return "L2";
  if (normalized === "L3" || normalized === "3") return "L3";
  return "";
}

export function hashRawTransaction(rawTransaction) {
  return createHash("sha256").update(String(rawTransaction)).digest("hex");
}

export function nextBackoffMs(baseMs, attempt, maxMs) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  return Math.min(baseMs * 2 ** (safeAttempt - 1), maxMs);
}

export function sanitizeJob(job, { includeRaw = false } = {}) {
  if (!job) return null;
  const snapshot = structuredClone(job);
  if (!includeRaw) {
    delete snapshot.rawTransaction;
  }
  return snapshot;
}

function sortByUpdatedAtAsc(left, right) {
  const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? "") || 0;
  const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? "") || 0;
  return leftTime - rightTime;
}

export class TxEngine {
  constructor(config) {
    this.config = config;
    this.providers = {
      L1: new GhostProvider(config.rpcUrls.L1, { timeoutMs: config.requestTimeoutMs }),
      L2: new GhostProvider(config.rpcUrls.L2, { timeoutMs: config.requestTimeoutMs }),
      L3: new GhostProvider(config.rpcUrls.L3, { timeoutMs: config.requestTimeoutMs })
    };
    this.jobs = new Map();
    this.idempotency = new Map();
    this.inFlightByLayer = { L1: 0, L2: 0, L3: 0 };
    this.metrics = {
      enqueuedTotal: 0,
      sentTotal: 0,
      failedTotal: 0,
      retriedTotal: 0,
      recoveredTotal: 0,
      compactionsTotal: 0
    };
    this.eventLog = [];
    this.#writeChain = Promise.resolve();
    this.#drainRunning = false;
    this.#compacting = false;
    this.#loopHandle = null;
    this.#initialized = false;
    this.#updateCount = 0;
  }

  #writeChain;
  #drainRunning;
  #compacting;
  #loopHandle;
  #initialized;
  #updateCount;

  get initialized() {
    return this.#initialized;
  }

  async init() {
    await fs.mkdir(path.dirname(this.config.journalPath), { recursive: true });
    await this.#loadJournal();
    this.#initialized = true;
  }

  start() {
    if (this.#loopHandle) return;
    this.#loopHandle = setInterval(() => {
      void this.drain();
    }, this.config.pollIntervalMs);
    this.#loopHandle.unref();
  }

  stop() {
    if (this.#loopHandle) {
      clearInterval(this.#loopHandle);
      this.#loopHandle = null;
    }
  }

  summary() {
    const jobs = [...this.jobs.values()];
    const byStatus = jobs.reduce((accumulator, job) => {
      accumulator[job.status] = (accumulator[job.status] ?? 0) + 1;
      return accumulator;
    }, {});
    return {
      totalTrackedJobs: jobs.length,
      byStatus,
      inFlightByLayer: { ...this.inFlightByLayer },
      metrics: { ...this.metrics },
      journalPath: this.config.journalPath
    };
  }

  list({ status = "", limit = 100, includeRaw = false } = {}) {
    const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    return [...this.jobs.values()]
      .filter((job) => (!status ? true : job.status === status))
      .sort((left, right) => sortByUpdatedAtAsc(right, left))
      .slice(0, normalizedLimit)
      .map((job) => sanitizeJob(job, { includeRaw }));
  }

  get(id, options) {
    return sanitizeJob(this.jobs.get(id), options);
  }

  async enqueue(payload) {
    const layer = normalizeLayer(payload?.layer);
    if (!layer) {
      throw new Error("invalid_layer");
    }
    const rawTransaction = String(payload?.rawTransaction ?? "").trim();
    if (!/^0x[0-9a-fA-F]+$/.test(rawTransaction)) {
      throw new Error("raw_transaction_must_be_hex");
    }

    const rawTransactionDigest = hashRawTransaction(rawTransaction);
    const idempotencyKey = String(payload?.idempotencyKey ?? rawTransactionDigest);
    const idempotencyScope = `${layer}:${idempotencyKey}`;
    const existingId = this.idempotency.get(idempotencyScope);
    if (existingId && this.jobs.has(existingId)) {
      return {
        created: false,
        job: sanitizeJob(this.jobs.get(existingId))
      };
    }

    const now = new Date().toISOString();
    const job = {
      id: randomUUID(),
      layer,
      chainId: CHAIN_IDS[layer],
      status: "queued",
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      idempotencyKey,
      rawTransaction,
      rawTransactionDigest,
      txHash: "",
      error: "",
      createdAt: now,
      updatedAt: now,
      lastAttemptAt: "",
      sentAt: "",
      nextAttemptAt: Date.now(),
      metadata: payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : null
    };

    this.jobs.set(job.id, job);
    this.idempotency.set(idempotencyScope, job.id);
    this.metrics.enqueuedTotal += 1;
    this.#recordEvent("queued", job);
    await this.#persistSnapshot(job);
    this.#trimJobs();
    void this.drain();
    return {
      created: true,
      job: sanitizeJob(job)
    };
  }

  async retry(id) {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error("job_not_found");
    }
    if (job.status !== "failed") {
      throw new Error("job_not_retryable");
    }
    job.status = "queued";
    job.error = "";
    job.updatedAt = new Date().toISOString();
    job.nextAttemptAt = Date.now();
    this.#recordEvent("requeued", job);
    await this.#persistSnapshot(job);
    void this.drain();
    return sanitizeJob(job);
  }

  async drain() {
    if (this.#drainRunning) return;
    this.#drainRunning = true;
    try {
      while (true) {
        const job = this.#pickNextJob();
        if (!job) break;
        await this.#reserveJob(job);
        void this.#executeReservedJob(job);
      }
    } finally {
      this.#drainRunning = false;
    }
  }

  async #loadJournal() {
    let content = "";
    try {
      content = await fs.readFile(this.config.journalPath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      const job = JSON.parse(line);
      if (!job?.id) continue;
      this.jobs.set(job.id, job);
      if (job.idempotencyKey) {
        this.idempotency.set(`${job.layer}:${job.idempotencyKey}`, job.id);
      }
    }

    let recovered = false;
    for (const job of this.jobs.values()) {
      if (!TERMINAL_STATUSES.has(job.status)) {
        job.status = "queued";
        job.updatedAt = new Date().toISOString();
        job.error = job.error || "recovered_after_restart";
        job.nextAttemptAt = Date.now();
        this.metrics.recoveredTotal += 1;
        recovered = true;
      }
    }

    if (recovered) {
      this.#recordEvent("recovered", { recoveredJobs: this.metrics.recoveredTotal });
      await this.#compactJournal();
    }
    this.#trimJobs();
  }

  async #reserveJob(job) {
    this.inFlightByLayer[job.layer] += 1;
    job.status = "processing";
    job.attempts += 1;
    job.lastAttemptAt = new Date().toISOString();
    job.updatedAt = job.lastAttemptAt;
    job.error = "";
    await this.#persistSnapshot(job);
  }

  async #executeReservedJob(job) {
    try {
      const provider = this.providers[job.layer];
      const txHash = await provider.ghost_sendRawTransaction(job.rawTransaction);
      job.status = "sent";
      job.txHash = txHash;
      job.sentAt = new Date().toISOString();
      job.updatedAt = job.sentAt;
      this.metrics.sentTotal += 1;
      this.#recordEvent("sent", job);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      job.updatedAt = new Date().toISOString();
      job.error = errorMessage;
      if (job.attempts < job.maxAttempts) {
        job.status = "retrying";
        job.nextAttemptAt = Date.now() + nextBackoffMs(
          this.config.retryBaseMs,
          job.attempts,
          this.config.retryMaxMs
        );
        this.metrics.retriedTotal += 1;
        this.#recordEvent("retrying", job);
      } else {
        job.status = "failed";
        this.metrics.failedTotal += 1;
        this.#recordEvent("failed", job);
      }
    } finally {
      this.inFlightByLayer[job.layer] = Math.max(0, this.inFlightByLayer[job.layer] - 1);
      await this.#persistSnapshot(job);
      this.#trimJobs();
      void this.drain();
    }
  }

  #pickNextJob() {
    const now = Date.now();
    return [...this.jobs.values()]
      .filter((job) => {
        if (!(job.status === "queued" || job.status === "retrying")) return false;
        if ((job.nextAttemptAt ?? 0) > now) return false;
        return this.inFlightByLayer[job.layer] < this.config.concurrencyByLayer[job.layer];
      })
      .sort((left, right) => {
        const nextDelta = (left.nextAttemptAt ?? 0) - (right.nextAttemptAt ?? 0);
        if (nextDelta !== 0) return nextDelta;
        return sortByUpdatedAtAsc(left, right);
      })[0];
  }

  async #persistSnapshot(job) {
    this.#updateCount += 1;
    const line = `${JSON.stringify(job)}\n`;
    this.#writeChain = this.#writeChain.then(() => fs.appendFile(this.config.journalPath, line, "utf8"));
    await this.#writeChain;
    if (this.config.compactEvery > 0 && this.#updateCount % this.config.compactEvery === 0) {
      await this.#compactJournal();
    }
  }

  async #compactJournal() {
    if (this.#compacting) return;
    this.#compacting = true;
    try {
      await this.#writeChain;
      const tempPath = `${this.config.journalPath}.tmp`;
      const snapshots = [...this.jobs.values()]
        .sort(sortByUpdatedAtAsc)
        .map((job) => JSON.stringify(job))
        .join("\n");
      await fs.writeFile(tempPath, snapshots ? `${snapshots}\n` : "", "utf8");
      await fs.rename(tempPath, this.config.journalPath);
      this.metrics.compactionsTotal += 1;
    } finally {
      this.#compacting = false;
    }
  }

  #trimJobs() {
    if (this.jobs.size <= this.config.maxTrackedJobs) return;
    const evictable = [...this.jobs.values()]
      .filter((job) => TERMINAL_STATUSES.has(job.status))
      .sort(sortByUpdatedAtAsc);
    while (this.jobs.size > this.config.maxTrackedJobs && evictable.length > 0) {
      const job = evictable.shift();
      this.jobs.delete(job.id);
      if (job.idempotencyKey) {
        this.idempotency.delete(`${job.layer}:${job.idempotencyKey}`);
      }
    }
  }

  #recordEvent(type, payload) {
    this.eventLog.push({
      type,
      at: new Date().toISOString(),
      payload: sanitizeJob(payload, { includeRaw: false }) ?? payload
    });
    if (this.eventLog.length > 100) {
      this.eventLog.splice(0, this.eventLog.length - 100);
    }
  }
}
