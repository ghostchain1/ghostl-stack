/**
 * GhostBrain Core — Network Controller
 *
 * Reads network interface statistics from /proc/net/dev and the host
 * Docker network list (bridge, overlay). Provides isolation capability
 * for misbehaving containers via Docker network disconnect.
 */

import { readFile }      from "node:fs/promises";
import { request }       from "undici";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NetInterface {
  iface:        string;
  rxBytesTotal: number;
  txBytesTotal: number;
  rxErrors:     number;
  txErrors:     number;
  rxDropped:    number;
  txDropped:    number;
}

export interface DockerNetwork {
  id:     string;
  name:   string;
  driver: string;
  scope:  string;
}

export interface NetworkTopology {
  hostInterfaces: NetInterface[];
  dockerNetworks: DockerNetwork[];
  ts:             number;
}

export interface IsolateResult {
  ok:          boolean;
  containerId: string;
  networkId:   string;
  error?:      string;
}

// ── /proc/net/dev parser ──────────────────────────────────────────────────────

export async function readHostInterfaces(): Promise<NetInterface[]> {
  try {
    const text  = await readFile("/proc/net/dev", "utf8");
    const lines = text.split("\n").slice(2); // skip 2 header lines
    const result: NetInterface[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx < 0) continue;
      const iface = trimmed.slice(0, colonIdx).trim();
      const nums  = trimmed.slice(colonIdx + 1).trim().split(/\s+/).map(Number);
      if (nums.length < 16) continue;
      result.push({
        iface,
        rxBytesTotal: nums[0]  ?? 0,
        rxErrors:     nums[2]  ?? 0,
        rxDropped:    nums[3]  ?? 0,
        txBytesTotal: nums[8]  ?? 0,
        txErrors:     nums[10] ?? 0,
        txDropped:    nums[11] ?? 0,
      });
    }
    return result.filter(i => i.iface !== "lo");
  } catch {
    return [];
  }
}

// ── Docker helpers ────────────────────────────────────────────────────────────

function dockerUrl(path: string): string {
  if (DOCKER_SOCKET.startsWith("unix://")) return `unix://${DOCKER_SOCKET.slice(7)}${path}`;
  if (DOCKER_SOCKET.startsWith("/"))        return `unix://${DOCKER_SOCKET}${path}`;
  return `${DOCKER_SOCKET}${path}`;
}

export async function listDockerNetworks(): Promise<DockerNetwork[]> {
  try {
    const res  = await request(dockerUrl("/networks"), { method: "GET", bodyTimeout: 5_000 });
    const raw  = await res.body.json() as { Id: string; Name: string; Driver: string; Scope: string }[];
    return raw.map(n => ({ id: n.Id, name: n.Name, driver: n.Driver, scope: n.Scope }));
  } catch {
    return [];
  }
}

/** Full topology snapshot — host interfaces + Docker networks. */
export async function getNetworkTopology(): Promise<NetworkTopology> {
  const [hostInterfaces, dockerNetworks] = await Promise.all([
    readHostInterfaces(),
    listDockerNetworks(),
  ]);
  return { hostInterfaces, dockerNetworks, ts: Date.now() };
}

/**
 * Disconnect a container from a network (isolation).
 * Requires the Docker daemon socket to be mounted.
 */
export async function isolateContainer(containerId: string, networkId: string): Promise<IsolateResult> {
  try {
    const res = await request(
      dockerUrl(`/networks/${networkId}/disconnect`),
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ Container: containerId, Force: false }),
        bodyTimeout: 6_000,
      },
    );
    return {
      ok:          res.statusCode === 200,
      containerId,
      networkId,
    };
  } catch (e) {
    return { ok: false, containerId, networkId, error: e instanceof Error ? e.message : String(e) };
  }
}
