import { ProcessRunner, Logger } from "@ghostchain/devkit";

const log = Logger.create("HypervisorController");

export type VMState = "running" | "stopped" | "paused" | "creating" | "unknown";

export interface VMInfo {
  name: string;
  state: VMState;
  id?: string;
  cpuCount?: number;
  memoryMiB?: number;
  disk?: string;
}

export interface VMCreateOptions {
  name: string;
  cpuCount?: number;
  memoryMiB?: number;
  diskGiB?: number;
  osVariant?: string;
  cdrom?: string;
  network?: string;
}

/**
 * GhostHypervisorController — controls KVM/libvirt VMs via virsh.
 * Requires libvirt-client (virsh) on the host.
 */
export class GhostHypervisorController {
  constructor(private readonly uri = process.env["LIBVIRT_URI"] ?? "qemu:///system") {}

  /** List all VMs and their states. */
  async list(): Promise<VMInfo[]> {
    const raw = await ProcessRunner.exec("virsh", [
      "--connect", this.uri,
      "list", "--all", "--name",
    ]);
    const names = raw.trim().split("\n").map((s) => s.trim()).filter(Boolean);
    const infos = await Promise.all(names.map((n) => this.info(n)));
    return infos;
  }

  /** Get info about a single VM. */
  async info(name: string): Promise<VMInfo> {
    try {
      const raw = await ProcessRunner.exec("virsh", [
        "--connect", this.uri, "dominfo", name,
      ]);
      const lines = Object.fromEntries(
        raw.split("\n")
           .map((l) => l.split(":").map((s) => s.trim()) as [string, string])
           .filter(([k]) => k),
      ) as Record<string, string>;
      const state = this.parseState(lines["State"] ?? "");
      return {
        name,
        state,
        id:        lines["Id"],
        cpuCount:  parseInt(lines["CPU(s)"] ?? "0"),
        memoryMiB: Math.round(parseInt(lines["Used memory"] ?? "0") / 1024),
      };
    } catch {
      return { name, state: "unknown" };
    }
  }

  /** Start a VM. */
  async start(name: string): Promise<void> {
    log.info(`Starting VM: ${name}`);
    await ProcessRunner.exec("virsh", ["--connect", this.uri, "start", name]);
  }

  /** Stop (shutdown) a VM gracefully. */
  async stop(name: string, force = false): Promise<void> {
    const cmd = force ? "destroy" : "shutdown";
    log.info(`${force ? "Destroying" : "Stopping"} VM: ${name}`);
    await ProcessRunner.exec("virsh", ["--connect", this.uri, cmd, name]);
  }

  /** Pause VM execution. */
  async pause(name: string): Promise<void> {
    log.info(`Pausing VM: ${name}`);
    await ProcessRunner.exec("virsh", ["--connect", this.uri, "suspend", name]);
  }

  /** Resume paused VM. */
  async resume(name: string): Promise<void> {
    log.info(`Resuming VM: ${name}`);
    await ProcessRunner.exec("virsh", ["--connect", this.uri, "resume", name]);
  }

  /** Reboot a VM. */
  async reboot(name: string): Promise<void> {
    log.info(`Rebooting VM: ${name}`);
    await ProcessRunner.exec("virsh", ["--connect", this.uri, "reboot", name]);
  }

  /** Take a snapshot. */
  async snapshot(name: string, snapName?: string): Promise<string> {
    const snName = snapName ?? `snap-${Date.now()}`;
    log.info(`Snapshot ${name} → ${snName}`);
    await ProcessRunner.exec("virsh", [
      "--connect", this.uri, "snapshot-create-as",
      name, snName, "--atomic",
    ]);
    return snName;
  }

  /** Revert to a snapshot. */
  async revertSnapshot(name: string, snapName: string): Promise<void> {
    log.info(`Reverting ${name} to ${snapName}`);
    await ProcessRunner.exec("virsh", [
      "--connect", this.uri, "snapshot-revert", name, snapName, "--running",
    ]);
  }

  /** Create a new VM using virt-install. */
  async create(opts: VMCreateOptions): Promise<void> {
    log.info(`Creating VM: ${opts.name}`);
    const args = [
      "--connect",    this.uri,
      "--name",       opts.name,
      "--vcpus",      String(opts.cpuCount ?? 2),
      "--memory",     String(opts.memoryMiB ?? 2048),
      "--disk",       `size=${opts.diskGiB ?? 20}`,
      "--os-variant", opts.osVariant ?? "ubuntu22.04",
      "--network",    opts.network   ?? "default",
      "--graphics",   "none",
      "--noautoconsole",
    ];
    if (opts.cdrom) args.push("--cdrom", opts.cdrom);
    await ProcessRunner.exec("virt-install", args, { stream: true });
  }

  /** Delete a VM (must be stopped first). */
  async delete(name: string, removeStorage = false): Promise<void> {
    log.warn(`Deleting VM: ${name}`);
    const args = ["--connect", this.uri, "undefine", name];
    if (removeStorage) args.push("--remove-all-storage");
    await ProcessRunner.exec("virsh", args);
  }

  private parseState(raw: string): VMState {
    const s = raw.toLowerCase().trim();
    if (s.includes("running")) return "running";
    if (s.includes("paused"))  return "paused";
    if (s.includes("shut off") || s.includes("stopped")) return "stopped";
    return "unknown";
  }
}
