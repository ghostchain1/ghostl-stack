import { ProcessRunner, Logger } from "@ghostchain/devkit";

const log = Logger.create("NetworkController");

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  ipam?: { subnet?: string; gateway?: string };
}

export interface PortForwardRule {
  hostPort: number;
  containerIp: string;
  containerPort: number;
  protocol?: "tcp" | "udp";
}

/**
 * GhostNetworkController — manages Docker networks and host-level
 * bridge/iptables rules for GhostChain node connectivity.
 */
export class GhostNetworkController {
  /** List all Docker networks. */
  async list(): Promise<NetworkInfo[]> {
    const out = await ProcessRunner.exec("docker", [
      "network", "ls",
      "--format", "{{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}",
    ]);
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, name, driver, scope] = line.split("\t") as [string, string, string, string];
        return { id, name, driver, scope, internal: false };
      });
  }

  /** Inspect a Docker network by name, returning IPAM info. */
  async inspect(name: string): Promise<NetworkInfo | null> {
    try {
      const out = await ProcessRunner.exec("docker", [
        "network", "inspect", name,
        "--format",
        "{{.Id}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}\t{{.Internal}}\t{{range .IPAM.Config}}{{.Subnet}}\t{{.Gateway}}{{end}}",
      ]);
      const parts = out.trim().split("\t");
      return {
        id:       parts[0] ?? "",
        name:     parts[1] ?? name,
        driver:   parts[2] ?? "bridge",
        scope:    parts[3] ?? "local",
        internal: parts[4] === "true",
        ipam: {
          subnet:  parts[5],
          gateway: parts[6],
        },
      };
    } catch {
      return null;
    }
  }

  /** Create a Docker network if it does not already exist. */
  async ensure(name: string, driver = "bridge", subnet?: string): Promise<void> {
    const existing = await this.inspect(name);
    if (existing) {
      log.info(`Network already exists: ${name}`);
      return;
    }
    const args = ["network", "create", "--driver", driver];
    if (subnet) args.push("--subnet", subnet);
    args.push(name);
    await ProcessRunner.exec("docker", args);
    log.info(`Created network: ${name} (${driver}${subnet ? ` subnet=${subnet}` : ""})`);
  }

  /** Remove a Docker network. */
  async remove(name: string): Promise<void> {
    await ProcessRunner.exec("docker", ["network", "rm", name]);
    log.info(`Removed network: ${name}`);
  }

  /** Connect a container to a network. */
  async connect(network: string, container: string, alias?: string): Promise<void> {
    const args = ["network", "connect"];
    if (alias) args.push("--alias", alias);
    args.push(network, container);
    await ProcessRunner.exec("docker", args);
  }

  /** Disconnect a container from a network. */
  async disconnect(network: string, container: string): Promise<void> {
    await ProcessRunner.exec("docker", ["network", "disconnect", network, container]);
  }

  // ─── Host bridge management via `ip` CLI ──────────────────────────

  /** Create a Linux bridge interface (requires root). */
  async createBridge(bridgeName: string): Promise<void> {
    await ProcessRunner.exec("ip", ["link", "add", bridgeName, "type", "bridge"]);
    await ProcessRunner.exec("ip", ["link", "set", bridgeName, "up"]);
    log.info(`Created bridge: ${bridgeName}`);
  }

  /** Assign an IP to a bridge interface. */
  async setBridgeIp(bridgeName: string, cidr: string): Promise<void> {
    await ProcessRunner.exec("ip", ["addr", "add", cidr, "dev", bridgeName]);
  }

  /** Delete a Linux bridge interface. */
  async deleteBridge(bridgeName: string): Promise<void> {
    await ProcessRunner.exec("ip", ["link", "delete", bridgeName]);
    log.info(`Deleted bridge: ${bridgeName}`);
  }

  // ─── iptables port-forward rules ──────────────────────────────────

  /** Add a DNAT port-forward rule via iptables. */
  async addPortForward(rule: PortForwardRule): Promise<void> {
    const proto = rule.protocol ?? "tcp";
    await ProcessRunner.exec("iptables", [
      "-t", "nat", "-A", "PREROUTING",
      "-p", proto, "--dport", String(rule.hostPort),
      "-j", "DNAT", "--to-destination",
      `${rule.containerIp}:${rule.containerPort}`,
    ]);
    log.info(`Port forward: *:${rule.hostPort} → ${rule.containerIp}:${rule.containerPort} (${proto})`);
  }

  /** Remove a previously added DNAT port-forward rule. */
  async removePortForward(rule: PortForwardRule): Promise<void> {
    const proto = rule.protocol ?? "tcp";
    await ProcessRunner.exec("iptables", [
      "-t", "nat", "-D", "PREROUTING",
      "-p", proto, "--dport", String(rule.hostPort),
      "-j", "DNAT", "--to-destination",
      `${rule.containerIp}:${rule.containerPort}`,
    ]);
  }
}
