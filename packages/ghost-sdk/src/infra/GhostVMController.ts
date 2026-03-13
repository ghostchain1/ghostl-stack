/**
 * GhostVMController — secure libvirt VM lifecycle manager.
 *
 * All virsh operations use `execFile` (never `exec`) so VM names are never
 * interpreted by a shell, eliminating command-injection risk (OWASP A03).
 * VM names are validated against a strict regex and an optional allowlist
 * before any operation is performed.
 *
 * Compatible with the GhostStack hypervisor environment described in
 * AGENTS.md — ghostchain-mainnet-l1, ghost-mainnet-validator, ghostl2-mainnet, etc.
 *
 * Usage:
 *   const vmc = new GhostVMController({
 *     allowlist: [
 *       "ghostchain-mainnet-l1",
 *       "ghost-mainnet-validator",
 *       "ghostl2-mainnet",
 *       "ghostl3-mainnet",
 *     ],
 *   });
 *
 *   await vmc.start("ghostl3-mainnet");
 *   await vmc.reboot("ghost-mainnet-validator");
 *   const status = await vmc.status("ghostchain-mainnet-l1");
 */

import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(_execFile);

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * libvirt domain (VM) names: alphanumeric, hyphens, dots, underscores.
 * No slashes, no spaces, max 64 chars.
 */
const VM_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,63}$/;

function assertVmName(name: string): void {
  if (!VM_NAME_RE.test(name)) {
    throw new TypeError(
      `GhostVMController: invalid VM name "${name}". ` +
      `Names must match /^[a-zA-Z0-9][a-zA-Z0-9_.\\/-]{0,63}$/`
    );
  }
}

// ── Configuration ──────────────────────────────────────────────────────────────

export interface GhostVMControllerConfig {
  /**
   * Optional allowlist of VM names that may be controlled.
   * Recommended in production — prevents controlling arbitrary VMs.
   */
  allowlist?: string[];

  /** Command timeout in milliseconds. Default: 30 000 ms. */
  timeoutMs?: number;

  /**
   * libvirt connect URI.  Default: uses system libvirt socket.
   * Example: "qemu:///system" or "qemu+ssh://user@host/system"
   */
  connectUri?: string;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type VMState =
  | "running"
  | "shut off"
  | "paused"
  | "suspended"
  | "crashed"
  | "unknown";

export interface VMStatus {
  name:  string;
  state: VMState;
  id:    number | null;
}

// ── GhostVMController ─────────────────────────────────────────────────────────

export class GhostVMController {
  private readonly _allowlist:   Set<string> | null;
  private readonly _timeoutMs:   number;
  private readonly _connectArgs: string[];

  constructor(config: GhostVMControllerConfig = {}) {
    this._allowlist = config.allowlist
      ? new Set(config.allowlist.map(n => { assertVmName(n); return n; }))
      : null;
    this._timeoutMs   = config.timeoutMs ?? 30_000;
    this._connectArgs = config.connectUri ? ["-c", config.connectUri] : [];
  }

  // ── VM operations ──────────────────────────────────────────────────────────────

  /** Start (boot) a shut-off VM. */
  async start(name: string): Promise<void> {
    this._validate(name);
    await this._virsh(["start", name]);
  }

  /** Gracefully shut down a running VM (sends ACPI power signal). */
  async shutdown(name: string): Promise<void> {
    this._validate(name);
    await this._virsh(["shutdown", name]);
  }

  /** Forcefully power off a VM (equivalent to pulling the power cord). */
  async destroy(name: string): Promise<void> {
    this._validate(name);
    await this._virsh(["destroy", name]);
  }

  /** Reboot a running VM (graceful: sends ACPI reboot signal). */
  async reboot(name: string): Promise<void> {
    this._validate(name);
    await this._virsh(["reboot", name]);
  }

  /** Force-reset a VM (hard reboot, no ACPI signal). */
  async reset(name: string): Promise<void> {
    this._validate(name);
    await this._virsh(["reset", name]);
  }

  /** Suspend (pause) a running VM. */
  async suspend(name: string): Promise<void> {
    this._validate(name);
    await this._virsh(["suspend", name]);
  }

  /** Resume a suspended VM. */
  async resume(name: string): Promise<void> {
    this._validate(name);
    await this._virsh(["resume", name]);
  }

  /**
   * Query the current state of a VM.
   * Returns `null` if the VM does not exist.
   */
  async status(name: string): Promise<VMStatus | null> {
    this._validate(name);
    try {
      const { stdout } = await this._virsh(["domstate", name]);
      const raw = stdout.trim().toLowerCase() as VMState;
      const { stdout: idOut } = await this._virsh(["domid", name]).catch(() => ({ stdout: "-1" }));
      const id = parseInt(idOut.trim(), 10);
      return { name, state: raw, id: isNaN(id) || id < 0 ? null : id };
    } catch {
      return null;
    }
  }

  /**
   * List all VMs.  If an allowlist is configured only allowlisted VMs
   * are returned.
   */
  async list(): Promise<VMStatus[]> {
    const { stdout } = await this._virsh(["list", "--all", "--name"]);
    const names = stdout
      .split("\n")
      .map(n => n.trim())
      .filter(Boolean);

    const visible = this._allowlist
      ? names.filter(n => this._allowlist!.has(n))
      : names;

    const statuses = await Promise.allSettled(visible.map(n => this.status(n)));
    return statuses
      .filter((r): r is PromiseFulfilledResult<VMStatus | null> => r.status === "fulfilled")
      .map(r => r.value)
      .filter((s): s is VMStatus => s !== null);
  }

  /**
   * Take a snapshot of a VM (useful before hard-restart / reboot).
   * Snapshot name defaults to `<vm>-snap-<epoch>`.
   */
  async snapshot(vmName: string, snapshotName?: string): Promise<void> {
    this._validate(vmName);
    const snapName = snapshotName ?? `${vmName}-snap-${Date.now()}`;
    // snapshotName goes through virsh --name — validate it too.
    assertVmName(snapName);
    await this._virsh(["snapshot-create-as", vmName, "--name", snapName]);
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private _validate(name: string): void {
    assertVmName(name);
    if (this._allowlist && !this._allowlist.has(name)) {
      throw new Error(
        `GhostVMController: VM "${name}" is not in the allowlist.`
      );
    }
  }

  /**
   * Execute a virsh sub-command with the given argument list.
   * Uses `execFile` so arguments are never shell-interpreted.
   */
  private async _virsh(args: string[]): Promise<{ stdout: string; stderr: string }> {
    // Prepend connect args if configured (e.g. ["-c", "qemu:///system"])
    return execFile("virsh", [...this._connectArgs, ...args], { timeout: this._timeoutMs });
  }
}
