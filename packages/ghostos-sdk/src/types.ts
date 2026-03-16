// GhostOS SDK — Shared Types

export interface GhostOSConfig {
  /** GhostBrain control endpoint */
  controlEndpoint?: string;
  /** Dry-run mode — log actions but do not execute */
  dryRun?: boolean;
  /** Authentication token for secure operations */
  authToken?: string;
}

export interface ResourceSpec {
  cpu: number;           // vCPU count
  memory: string;        // e.g. "8GB"
  disk?: string;         // e.g. "200GB"
  network?: string;      // interface name
}

export interface HealthStatus {
  healthy: boolean;
  uptime: number;        // seconds
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  message?: string;
}

export interface GhostOSResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
