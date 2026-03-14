import { ProcessRunner, Logger } from "@ghostchain/devkit";

const log = Logger.create("DockerManager");

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  ports?: string;
}

export interface ContainerStats {
  id: string;
  name: string;
  cpuPercent: number;
  memUsageMiB: number;
  memLimitMiB: number;
  netRxMB: number;
  netTxMB: number;
}

export interface RunOptions {
  image: string;
  name?: string;
  ports?: string[];       // ["8545:8545"]
  env?: Record<string, string>;
  volumes?: string[];     // ["/host:/container"]
  network?: string;
  restart?: "no" | "always" | "unless-stopped" | "on-failure";
  detach?: boolean;
  command?: string[];
}

/**
 * GhostDockerManager — full container lifecycle via the Docker CLI.
 */
export class GhostDockerManager {
  /** List all containers (running + stopped). */
  async list(all = true): Promise<ContainerInfo[]> {
    const fmt = "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}";
    const args = ["ps", "--format", fmt];
    if (all) args.push("--all");
    const raw = await ProcessRunner.exec("docker", args);
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, name, image, status] = line.split("\t");
        return {
          id:      id ?? "",
          name:    name ?? "",
          image:   image ?? "",
          status:  status ?? "",
          running: (status ?? "").toLowerCase().startsWith("up"),
        };
      });
  }

  /** Start a container by name or ID. */
  async start(nameOrId: string): Promise<void> {
    log.info(`Starting container: ${nameOrId}`);
    await ProcessRunner.exec("docker", ["start", nameOrId]);
  }

  /** Stop a container. */
  async stop(nameOrId: string, timeoutSec = 10): Promise<void> {
    log.info(`Stopping container: ${nameOrId}`);
    await ProcessRunner.exec("docker", ["stop", "-t", String(timeoutSec), nameOrId]);
  }

  /** Restart a container. */
  async restart(nameOrId: string, timeoutSec = 10): Promise<void> {
    log.info(`Restarting container: ${nameOrId}`);
    await ProcessRunner.exec("docker", ["restart", "-t", String(timeoutSec), nameOrId]);
  }

  /** Remove a container (must be stopped). */
  async remove(nameOrId: string, force = false): Promise<void> {
    log.warn(`Removing container: ${nameOrId}`);
    const args = ["rm", nameOrId];
    if (force) args.splice(1, 0, "-f");
    await ProcessRunner.exec("docker", args);
  }

  /** Run a new container. */
  async run(opts: RunOptions): Promise<string> {
    const args = ["run"];
    if (opts.detach ?? true) args.push("-d");
    if (opts.name)    args.push("--name", opts.name);
    if (opts.network) args.push("--network", opts.network);
    if (opts.restart) args.push("--restart", opts.restart);

    for (const p of opts.ports   ?? []) args.push("-p", p);
    for (const v of opts.volumes ?? []) args.push("-v", v);
    for (const [k, val] of Object.entries(opts.env ?? {})) args.push("-e", `${k}=${val}`);

    args.push(opts.image);
    if (opts.command) args.push(...opts.command);

    const id = await ProcessRunner.exec("docker", args);
    log.info(`Container started: ${id.trim().slice(0, 12)}`);
    return id.trim();
  }

  /** Get live resource stats for a container. */
  async stats(nameOrId: string): Promise<ContainerStats> {
    const fmt = "{{.ID}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}";
    const raw = await ProcessRunner.exec("docker", [
      "stats", "--no-stream", "--format", fmt, nameOrId,
    ]);
    const [id, name, cpuRaw, memRaw, netRaw] = raw.trim().split("\t");
    return {
      id:          id ?? "",
      name:        name ?? "",
      cpuPercent:  parseFloat((cpuRaw ?? "0").replace("%", "")),
      memUsageMiB: this.parseMiB((memRaw ?? "0 / 0").split(" / ")[0] ?? "0"),
      memLimitMiB: this.parseMiB((memRaw ?? "0 / 0").split(" / ")[1] ?? "0"),
      netRxMB:     this.parseMiB((netRaw ?? "0 / 0").split(" / ")[0] ?? "0"),
      netTxMB:     this.parseMiB((netRaw ?? "0 / 0").split(" / ")[1] ?? "0"),
    };
  }

  /** Fetch container logs. */
  async logs(nameOrId: string, tail = 100): Promise<string> {
    return ProcessRunner.exec("docker", ["logs", "--tail", String(tail), nameOrId]);
  }

  /** Execute a command inside a running container. */
  async exec(nameOrId: string, cmd: string[]): Promise<string> {
    return ProcessRunner.exec("docker", ["exec", nameOrId, ...cmd]);
  }

  /** Pull a Docker image. */
  async pull(image: string): Promise<void> {
    log.info(`Pulling image: ${image}`);
    await ProcessRunner.exec("docker", ["pull", image], { stream: true });
  }

  /** Build an image from a Dockerfile. */
  async build(contextPath: string, tag: string, file?: string): Promise<void> {
    log.info(`Building image ${tag} from ${contextPath}`);
    const args = ["build", "-t", tag];
    if (file) args.push("-f", file);
    args.push(contextPath);
    await ProcessRunner.exec("docker", args, { stream: true });
  }

  /** Create a Docker network if it doesn't exist. */
  async ensureNetwork(name: string, driver = "bridge"): Promise<void> {
    try {
      await ProcessRunner.exec("docker", ["network", "inspect", name]);
    } catch {
      log.info(`Creating network: ${name}`);
      await ProcessRunner.exec("docker", ["network", "create", "--driver", driver, name]);
    }
  }

  private parseMiB(raw: string): number {
    const v = parseFloat(raw);
    if (raw.toUpperCase().endsWith("GIB") || raw.toUpperCase().endsWith("GB")) return v * 1024;
    if (raw.toUpperCase().endsWith("KIB") || raw.toUpperCase().endsWith("KB")) return v / 1024;
    return v; // assume MiB
  }
}
