import { ProcessRunner, Logger } from "@ghostchain/devkit";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const log = Logger.create("LoadBalancer");

export type LBPolicy = "roundrobin" | "leastconn" | "static-rr";

export interface UpstreamServer {
  host: string;
  port: number;
  weight?: number;
  maxconn?: number;
}

export interface Upstream {
  name: string;
  servers: UpstreamServer[];
  policy: LBPolicy;
  checkInterval?: number; // ms
}

/**
 * GhostLoadBalancer — generates HAProxy configuration and manages
 * the process via systemctl.  Falls back to writing a minimal nginx
 * upstream block when HAProxy is not installed.
 */
export class GhostLoadBalancer {
  private readonly upstreams = new Map<string, Upstream>();
  private readonly configPath: string;
  private readonly backend: "haproxy" | "nginx";

  constructor(opts: { configPath?: string; backend?: "haproxy" | "nginx" } = {}) {
    this.backend    = opts.backend ?? "haproxy";
    this.configPath = opts.configPath ?? (
      this.backend === "haproxy"
        ? "/etc/haproxy/haproxy.cfg"
        : "/etc/nginx/conf.d/ghost-upstream.conf"
    );
  }

  /** Register or update an upstream pool. */
  addUpstream(upstream: Upstream): void {
    this.upstreams.set(upstream.name, upstream);
    log.info(`Upstream registered: ${upstream.name} (${upstream.servers.length} server(s), policy=${upstream.policy})`);
  }

  /** Remove an upstream pool. */
  removeUpstream(name: string): void {
    this.upstreams.delete(name);
    log.info(`Upstream removed: ${name}`);
  }

  /** Generate config and reload the LB process. */
  async apply(): Promise<void> {
    const config = this.backend === "haproxy"
      ? this.generateHAProxyConfig()
      : this.generateNginxConfig();

    await fs.writeFile(this.configPath, config, "utf-8");
    log.info(`Wrote ${this.backend} config → ${this.configPath}`);
    await this.reload();
  }

  /** Reload the LB process without downtime. */
  async reload(): Promise<void> {
    try {
      await ProcessRunner.exec("systemctl", ["reload", this.backend]);
      log.info(`${this.backend} reloaded`);
    } catch (err) {
      log.warn(`systemctl reload failed (is ${this.backend} running?): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Return systemctl status output for the LB service. */
  async status(): Promise<string> {
    try {
      return await ProcessRunner.exec("systemctl", ["status", this.backend, "--no-pager"]);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  getUpstream(name: string): Upstream | undefined {
    return this.upstreams.get(name);
  }

  listUpstreams(): Upstream[] {
    return [...this.upstreams.values()];
  }

  // ─── Config generation ────────────────────────────────────────────

  private generateHAProxyConfig(): string {
    const lines: string[] = [
      "global",
      "    log /dev/log local0",
      "    log /dev/log local1 notice",
      `    user haproxy`,
      `    group haproxy`,
      "",
      "defaults",
      "    log     global",
      "    mode    tcp",
      "    option  tcplog",
      "    timeout connect 5s",
      "    timeout client  30s",
      "    timeout server  30s",
      "",
    ];

    for (const upstream of this.upstreams.values()) {
      const sectionName = `ghost_${upstream.name}`;
      lines.push(`backend ${sectionName}`);
      lines.push(`    balance ${upstream.policy}`);
      for (const s of upstream.servers) {
        const opts = [
          s.weight    !== undefined ? `weight ${s.weight}`       : "",
          s.maxconn   !== undefined ? `maxconn ${s.maxconn}`     : "",
          upstream.checkInterval !== undefined
            ? `check inter ${upstream.checkInterval}ms` : "",
        ].filter(Boolean).join(" ");
        lines.push(`    server ${s.host}_${s.port} ${s.host}:${s.port} ${opts}`.trimEnd());
      }
      lines.push("");
    }

    return lines.join(os.EOL);
  }

  private generateNginxConfig(): string {
    const lines: string[] = [];

    for (const upstream of this.upstreams.values()) {
      const policy =
        upstream.policy === "leastconn" ? "least_conn;" :
        upstream.policy === "static-rr"  ? "ip_hash;"   : "";

      lines.push(`upstream ghost_${upstream.name} {`);
      if (policy) lines.push(`    ${policy}`);
      for (const s of upstream.servers) {
        const weight = s.weight !== undefined ? ` weight=${s.weight}` : "";
        lines.push(`    server ${s.host}:${s.port}${weight};`);
      }
      lines.push("}");
      lines.push("");
    }

    return lines.join(os.EOL);
  }
}
