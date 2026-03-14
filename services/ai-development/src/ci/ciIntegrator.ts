/**
 * CI Integrator — simulates GitHub Actions CI/CD pipelines for Ghost repositories.
 */

import { v4 as uuid }       from "uuid";
import { deployService }    from "../deployment/deploymentEngine";
import logger               from "../utils/logger";

export type PipelineStatus = "queued" | "running" | "passed" | "failed" | "cancelled";
export type StageStatus    = "pending" | "running" | "passed" | "failed" | "skipped";

export interface PipelineStage {
  name:       string;
  status:     StageStatus;
  duration?:  number;   // ms
  logs?:      string;
}

export interface CIPipeline {
  id:           string;
  repo:         string;
  branch:       string;
  commit:       string;
  status:       PipelineStatus;
  stages:       PipelineStage[];
  triggeredAt:  number;
  completedAt?: number;
  duration?:    number;  // ms
  triggeredBy:  string;
}

const MAX_PIPELINES = 200;
const store: CIPipeline[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function hexStr(len: number) { return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join(""); }

const REPOS = [
  "ghostchain-node", "ghostl2-node", "ghostl3-node", "ghostl-stack",
  "ai-marketing", "ai-growth", "ai-adoption", "ai-expansion",
  "ai-economy", "ai-infrastructure", "ai-security", "ai-intelligence",
  "ai-governance", "ai-interchain", "ai-agents", "ai-development",
];

const BRANCHES = ["main", "develop", "release/v2", "feature/perf-boost", "hotfix/gas-fix"];

const STAGE_NAMES = [
  "checkout", "install", "lint", "unit-test", "security-scan",
  "build", "docker-build", "push", "deploy",
];

const STAGE_LOGS: Record<string, string> = {
  checkout:    "Cloning repository... done (0.8s)",
  install:     "npm ci — 342 packages installed",
  lint:        "ESLint: 0 errors, 2 warnings",
  "unit-test": "Tests: 48 passed, 0 failed (coverage: 91%)",
  "security-scan": "No critical vulnerabilities detected",
  build:       "tsc — compiled 38 files in 4.2s",
  "docker-build": "Successfully built adb4f9c2",
  push:        "Pushed to registry: ghostchain/{{repo}}:latest",
  deploy:      "Service restarted. Health check passed.",
};

function makeStages(success: boolean, failAt?: number): PipelineStage[] {
  return STAGE_NAMES.map((name, i) => {
    if (failAt !== undefined && i === failAt) {
      return { name, status: "failed",  duration: rand(500, 8000), logs: `Error: ${name} failed` };
    }
    if (failAt !== undefined && i > failAt) {
      return { name, status: "skipped" };
    }
    return { name, status: "passed", duration: rand(500, name === "docker-build" ? 45000 : 12000), logs: STAGE_LOGS[name] };
  });
}

function buildPipeline(repo: string, branch: string, hoursAgo: number): CIPipeline {
  const success = Math.random() > 0.18;
  const failAt  = success ? undefined : rand(2, STAGE_NAMES.length - 1);
  const stages  = makeStages(success, failAt);
  const dur     = stages.reduce((s, st) => s + (st.duration ?? 0), 0);
  const t       = Date.now() - hoursAgo * 3_600_000;
  return {
    id:          uuid(),
    repo,
    branch,
    commit:      hexStr(8),
    status:      success ? "passed" : "failed",
    stages,
    triggeredAt: t,
    completedAt: t + dur,
    duration:    dur,
    triggeredBy: "ADE/autonomous",
  };
}

function seed() {
  for (let i = 0; i < 10; i++) {
    const pipeline = buildPipeline(pick(REPOS), pick(BRANCHES), rand(1, 168));
    store.push(pipeline);
  }
  logger.info(`[CIIntegrator] Seeded ${store.length} CI pipelines`);
}

export function triggerPipeline(repo: string, branch: string = "main"): CIPipeline {
  const success = Math.random() > 0.15;
  const failAt  = success ? undefined : rand(2, STAGE_NAMES.length - 1);
  const stages  = makeStages(success, failAt);
  const dur     = stages.reduce((s, st) => s + (st.duration ?? 0), 0);
  const now     = Date.now();
  const pipeline: CIPipeline = {
    id:          uuid(),
    repo,
    branch,
    commit:      hexStr(8),
    status:      success ? "passed" : "failed",
    stages,
    triggeredAt: now,
    completedAt: now + dur,
    duration:    dur,
    triggeredBy: "ADE/autonomous",
  };
  if (success) {
    const svc = REPOS.includes(repo) ? repo : undefined;
    if (svc) deployService(svc);
  }
  logger.info(`[CIIntegrator] Pipeline ${repo}@${branch} — ${pipeline.status} (${Math.round(dur / 1000)}s)`);
  store.unshift(pipeline);
  if (store.length > MAX_PIPELINES) store.pop();
  return pipeline;
}

export function getPipelines(opts: {
  repo?: string; branch?: string; status?: PipelineStatus; limit?: number;
} = {}): CIPipeline[] {
  let pipes = [...store];
  if (opts.repo)   pipes = pipes.filter(p => p.repo   === opts.repo);
  if (opts.branch) pipes = pipes.filter(p => p.branch === opts.branch);
  if (opts.status) pipes = pipes.filter(p => p.status === opts.status);
  return pipes.slice(0, opts.limit ?? 50);
}

export function getCIStats() {
  const total    = store.length;
  const passed   = store.filter(p => p.status === "passed").length;
  const failed   = store.filter(p => p.status === "failed").length;
  const avgDur   = total ? Math.round(store.reduce((s, p) => s + (p.duration ?? 0), 0) / total) : 0;
  const passRate = total ? Math.round((passed / total) * 100) : 0;
  return { total, passed, failed, passRate, avgDuration_ms: avgDur };
}

seed();
