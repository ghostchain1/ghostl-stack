import { ProcessRunner, Logger } from "@ghostchain/devkit";
import { GhostDockerManager } from "./GhostDockerManager.js";
import type { ContainerInfo } from "./GhostDockerManager.js";

const log = Logger.create("ContainerOrchestrator");

export interface ServiceSpec {
  name: string;
  image: string;
  composeFile?: string;
  minInstances?: number;
  maxInstances?: number;
  healthEndpoint?: string;
}

export interface ScaleAction {
  service: string;
  action: "scale-up" | "scale-down" | "restart";
  reason: string;
}

/**
 * GhostContainerOrchestrator — manages ghost-stack services across
 * Docker Compose stacks with auto-scaling and self-heal.
 */
export class GhostContainerOrchestrator {
  private readonly docker  = new GhostDockerManager();
  private readonly services = new Map<string, ServiceSpec>();
  private readonly cwd: string;

  constructor(cwd = process.env["GHOST_STACK_ROOT"] ?? "/home/ghost/ghostl-stack") {
    this.cwd = cwd;
  }

  registerService(spec: ServiceSpec): void {
    this.services.set(spec.name, spec);
    log.info(`Registered service: ${spec.name}`);
  }

  /** Bring up all registered services via docker compose. */
  async up(service?: string): Promise<void> {
    const args = ["compose", "up", "-d", "--build"];
    if (service) args.push(service);
    log.info(`Bringing up: ${service ?? "all services"}`);
    await ProcessRunner.exec("docker", args, { cwd: this.cwd, stream: true });
  }

  /** Bring down services. */
  async down(removeVolumes = false): Promise<void> {
    const args = ["compose", "down"];
    if (removeVolumes) args.push("--volumes");
    await ProcessRunner.exec("docker", args, { cwd: this.cwd, stream: true });
  }

  /** Scale a compose service to N replicas. */
  async scale(service: string, replicas: number): Promise<void> {
    log.info(`Scaling ${service} → ${replicas} replica(s)`);
    await ProcessRunner.exec("docker", [
      "compose", "up", "-d", "--scale", `${service}=${replicas}`, "--no-recreate",
    ], { cwd: this.cwd });
  }

  /** Evaluate all registered services and emit scale suggestions. */
  async evaluate(): Promise<ScaleAction[]> {
    const actions: ScaleAction[] = [];
    const running = await this.docker.list(false);
    const byName  = new Map(running.map((c) => [c.name.replace(/^\//, ""), c]));

    for (const spec of this.services.values()) {
      const container = byName.get(spec.name);

      if (!container) {
        actions.push({ service: spec.name, action: "scale-up", reason: "service not running" });
        continue;
      }

      if (!container.running) {
        actions.push({ service: spec.name, action: "restart", reason: `status: ${container.status}` });
        continue;
      }

      // Check health endpoint
      if (spec.healthEndpoint) {
        const healthy = await this.probeHealth(spec.healthEndpoint);
        if (!healthy) {
          actions.push({ service: spec.name, action: "restart", reason: "health endpoint failing" });
        }
      }
    }

    return actions;
  }

  /** Apply all suggested scale actions. */
  async applyActions(actions: ScaleAction[]): Promise<void> {
    for (const action of actions) {
      log.warn(`Action: ${action.action} on ${action.service} — ${action.reason}`);
      try {
        if (action.action === "restart") {
          await ProcessRunner.exec("docker", ["compose", "restart", action.service], { cwd: this.cwd });
        } else if (action.action === "scale-up") {
          const spec = this.services.get(action.service);
          const current = spec?.minInstances ?? 1;
          await this.scale(action.service, current + 1);
        } else if (action.action === "scale-down") {
          const spec = this.services.get(action.service);
          const current = spec?.minInstances ?? 1;
          if (current > 1) await this.scale(action.service, current - 1);
        }
      } catch (err) {
        log.error(`Action failed for ${action.service}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async probeHealth(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  listServices(): ServiceSpec[] {
    return [...this.services.values()];
  }

  get dockerManager(): GhostDockerManager {
    return this.docker;
  }
}
