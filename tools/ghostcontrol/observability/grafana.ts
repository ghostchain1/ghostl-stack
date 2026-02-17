import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface DashboardService {
  name: string;
  healthMetric: string;
  latencyMetric: string;
}

export interface GrafanaDashboard {
  uid: string;
  title: string;
  schemaVersion: number;
  version: number;
  refresh: string;
  panels: Array<Record<string, unknown>>;
}

export function buildGhostcontrolDashboard(services: DashboardService[]): GrafanaDashboard {
  const panels = services.flatMap((service, idx) => {
    const row = Math.floor(idx / 2);
    const column = idx % 2;
    const y = row * 8;
    const x = column * 12;

    return [
      {
        type: "stat",
        title: `${service.name} health`,
        id: idx * 2 + 1,
        gridPos: { h: 8, w: 12, x, y },
        targets: [{ expr: service.healthMetric, legendFormat: service.name }],
      },
      {
        type: "timeseries",
        title: `${service.name} latency`,
        id: idx * 2 + 2,
        gridPos: { h: 8, w: 12, x, y: y + 8 },
        targets: [{ expr: service.latencyMetric, legendFormat: service.name }],
      },
    ];
  });

  return {
    uid: "ghostcontrol-main",
    title: "GhostControl Runtime",
    schemaVersion: 39,
    version: 1,
    refresh: "15s",
    panels,
  };
}

export async function writeGrafanaDashboard(
  filePath: string,
  services: DashboardService[],
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const dashboard = buildGhostcontrolDashboard(services);
  await writeFile(filePath, JSON.stringify(dashboard, null, 2), "utf8");
}

