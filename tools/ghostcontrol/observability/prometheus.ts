import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface PrometheusJob {
  jobName: string;
  targets: string[];
  labels?: Record<string, string>;
}

function toYamlJobs(jobs: PrometheusJob[]): string {
  const lines: string[] = [];
  for (const job of jobs) {
    lines.push(`  - job_name: '${job.jobName}'`);
    lines.push("    static_configs:");
    lines.push("      - targets:");
    for (const target of job.targets) {
      lines.push(`          - '${target}'`);
    }
    if (job.labels && Object.keys(job.labels).length > 0) {
      lines.push("        labels:");
      for (const [key, value] of Object.entries(job.labels)) {
        lines.push(`          ${key}: '${value}'`);
      }
    }
  }
  return lines.join("\n");
}

export function buildPrometheusConfig(
  jobs: PrometheusJob[],
  scrapeInterval = "15s",
): string {
  return [
    "global:",
    `  scrape_interval: ${scrapeInterval}`,
    "scrape_configs:",
    toYamlJobs(jobs),
    "",
  ].join("\n");
}

export async function writePrometheusConfig(
  filePath: string,
  jobs: PrometheusJob[],
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buildPrometheusConfig(jobs), "utf8");
}

export function requiredGhostcontrolJobs(): string[] {
  return [
    "ghostcontrol-api",
    "ghostcontrol-policy",
    "ghostcontrol-ingest",
    "ghostcontrol-planner",
    "ghostcontrol-runner",
  ];
}

