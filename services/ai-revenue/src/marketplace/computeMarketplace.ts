import { v4 as uuidv4 } from "uuid";

export type JobType  = "ai-training" | "inference" | "zkp-proof" | "data-indexing" | "smart-contract-audit" | "model-serving";
export type JobState = "queued" | "processing" | "complete" | "failed" | "cancelled";

export interface ComputeJob {
  id: string;
  type: JobType;
  client: string;
  costGST: number;
  computeUnits: number;
  gpuCount: number;
  state: JobState;
  progress: number;   // 0-100
  startedAt: number | null;
  completedAt: number | null;
  submittedAt: number;
}

function job(type: JobType, client: string, costGST: number, cu: number,
             gpu: number, state: JobState, progress: number, agoH: number): ComputeJob {
  const submittedAt = Date.now() - agoH * 3_600_000;
  return {
    id: uuidv4(), type, client, costGST, computeUnits: cu, gpuCount: gpu, state, progress,
    startedAt:   state !== "queued"   ? submittedAt + 60_000 : null,
    completedAt: state === "complete" || state === "failed" ? submittedAt + agoH * 3_500_000 : null,
    submittedAt,
  };
}

const jobs: ComputeJob[] = [
  job("ai-training",          "GhostBrain Labs",       1_400, 512, 8,  "complete",  100, 24),
  job("model-serving",        "QuantumVault Corp",        210,  64, 1,  "processing",  67,  2),
  job("zkp-proof",            "ZeroKnowledge Systems",    480, 128, 2,  "processing",  43,  1),
  job("inference",            "AetherChain Analytics",     85,  32, 1,  "processing",  88,  0.5),
  job("ai-training",          "NebulaMind AI",           2_800, 1024, 16, "processing", 22, 6),
  job("data-indexing",        "ChainVault Technologies",  320,  96, 0,  "processing",  54,  3),
  job("smart-contract-audit", "SecureDefi Protocol",      650, 256, 2,  "queued",        0,  0.5),
  job("inference",            "OracleStack Inc",           90,  32, 1,  "queued",        0,  0.2),
  job("ai-training",          "Phantom AI Research",    3_200, 2048, 32, "queued",       0,  1),
  job("model-serving",        "DawnChain Corp",            180,  48, 1,  "queued",       0,  0.1),
  job("zkp-proof",            "PrivacyNet Protocol",       520, 160, 2,  "complete",  100, 48),
  job("data-indexing",        "GhostAnalytics Co",         280,  80, 0,  "complete",  100, 72),
  job("ai-training",          "SyntheticMind Labs",      1_900, 640, 12, "complete",  100, 96),
  job("smart-contract-audit", "Fortress Security DAO",    580, 192, 2,  "failed",      78, 36),
  job("inference",            "Vortex Hedge Fund",          105,  32, 1,  "complete",  100, 12),
];

const stats = {
  totalJobsProcessed: 1_847,
  totalRevenueGST:    248_300,
  totalComputeUnits:  8_420_000,
};

function jitter(base: number, pct = 0.1): number {
  return base * (1 + (Math.random() - 0.5) * pct * 2);
}

export function getJobs(opts?: { state?: JobState; type?: JobType }): ComputeJob[] {
  return jobs.filter((j) =>
    (!opts?.state || j.state === opts.state) &&
    (!opts?.type  || j.type  === opts.type)
  );
}

export function getJob(id: string): ComputeJob | undefined {
  return jobs.find((j) => j.id === id);
}

export function getMarketplaceStats() {
  const processing = jobs.filter((j) => j.state === "processing");
  const complete   = jobs.filter((j) => j.state === "complete");
  return {
    activeJobs:            processing.length,
    queuedJobs:            jobs.filter((j) => j.state === "queued").length,
    completedJobs:         complete.length,
    totalRevenueGST:       stats.totalRevenueGST + jobs.filter((j) => j.state === "complete").reduce((s, j) => s + j.costGST, 0),
    totalJobsAllTime:      stats.totalJobsProcessed,
    totalGpuAllocated:     processing.reduce((s, j) => s + j.gpuCount, 0),
    totalComputeUnitsUsed: stats.totalComputeUnits,
    avgJobCostGST:         jobs.reduce((s, j) => s + j.costGST, 0) / (jobs.length || 1),
  };
}

export async function allocateCompute(task: { type: JobType; client: string; computeUnits: number; gpuCount?: number }): Promise<{ task: string; cost: string; status: string; jobId: string }> {
  const gpuCount   = task.gpuCount ?? Math.ceil(task.computeUnits / 64);
  const costGST    = +(task.computeUnits * 0.8 + gpuCount * 10).toFixed(2);
  const newJob: ComputeJob = {
    id: uuidv4(), type: task.type, client: task.client ?? "unknown",
    costGST, computeUnits: task.computeUnits, gpuCount: gpuCount,
    state: "queued", progress: 0,
    startedAt: null, completedAt: null, submittedAt: Date.now(),
  };
  jobs.push(newJob);
  setTimeout(() => {
    newJob.state     = "processing";
    newJob.startedAt = Date.now();
    scheduleProgress(newJob);
  }, 2_000);
  return { task: task.type, cost: `${costGST} GST`, status: "queued", jobId: newJob.id };
}

function scheduleProgress(j: ComputeJob): void {
  const tick = setInterval(() => {
    if (j.state !== "processing") { clearInterval(tick); return; }
    j.progress = Math.min(100, j.progress + Math.floor(Math.random() * 8) + 2);
    if (j.progress >= 100) {
      j.state       = "complete";
      j.completedAt = Date.now();
      stats.totalJobsProcessed++;
      stats.totalRevenueGST     += j.costGST;
      stats.totalComputeUnits   += j.computeUnits;
      clearInterval(tick);
    }
  }, 5_000);
}

export function tickCompute(): void {
  for (const j of jobs) {
    if (j.state !== "processing") continue;
    j.progress = Math.min(100, j.progress + Math.floor(Math.random() * 3) + 1);
    if (j.progress >= 100) {
      j.state       = "complete";
      j.completedAt = Date.now();
      stats.totalJobsProcessed++;
      stats.totalRevenueGST   += j.costGST;
    }
    const queued = jobs.filter((x) => x.state === "queued");
    if (queued.length > 0 && jobs.filter((x) => x.state === "processing").length < 6) {
      const next       = queued[0];
      next.state       = "processing";
      next.startedAt   = Date.now();
    }
  }
}
