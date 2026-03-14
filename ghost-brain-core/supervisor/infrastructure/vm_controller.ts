/**
 * VM Controller
 *
 * Monitors libvirt VMs via the `virsh` CLI and restarts offline VMs.
 *
 * Security:
 * - Uses execFile() with argument arrays — NEVER passes VM names through a
 *   shell string to prevent command injection.
 * - All VM names extracted from virsh output are validated against
 *   SAFE_NAME_RE before being passed as arguments.
 * - Only VMs present in the configured allowlist are managed automatically.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { IController } from "../brain/supervisor_core.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

/** Only alphanumeric, hyphens, underscores, and dots. 1–128 chars. */
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,127}$/;

function assertSafeName(name: string): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(`Unsafe VM name rejected: ${JSON.stringify(name)}`);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VMState = "running" | "shut off" | "paused" | "crashed" | "unknown";

export interface VMInfo {
  id:    string;    // virsh domain id or "-"
  name:  string;
  state: VMState;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VIRSH_BIN = process.env["VIRSH_BIN"] ?? "/usr/bin/virsh";

/**
 * Comma-separated allowlist of VM names the supervisor is permitted to manage.
 * If empty, no VMs are auto-restarted (safe default).
 */
const VM_ALLOWLIST: ReadonlySet<string> = new Set(
  (process.env["VM_ALLOWLIST"] ?? "").split(",").map(s => s.trim()).filter(Boolean)
);

// ---------------------------------------------------------------------------
// VMController
// ---------------------------------------------------------------------------

export class VMController implements IController {
  readonly name = "VMController";

  private lastScan: VMInfo[] = [];

  async check(): Promise<void> {
    let vms: VMInfo[];
    try {
      vms = await this.listVMs();
    } catch (err) {
      // virsh not available (e.g. bare-metal without libvirt) — skip quietly.
      console.warn(`[VMController] virsh unavailable: ${err}`);
      return;
    }

    this.lastScan = vms;

    for (const vm of vms) {
      if (vm.state === "shut off" || vm.state === "crashed") {
        if (!VM_ALLOWLIST.has(vm.name)) {
          console.log(`[VMController] VM "${vm.name}" is ${vm.state} — not in allowlist, skipping.`);
          continue;
        }
        console.log(`[VMController] VM "${vm.name}" is ${vm.state} — attempting start.`);
        try {
          await this.startVm(vm.name);
          console.log(`[VMController] VM "${vm.name}" start command issued.`);
        } catch (err) {
          console.error(`[VMController] Failed to start VM "${vm.name}":`, err);
        }
      }
    }
  }

  /** Returns the last VM list without issuing a new virsh call. */
  getLastScan(): VMInfo[] {
    return [...this.lastScan];
  }

  // ---------------------------------------------------------------------------
  // Public actions (safe)
  // ---------------------------------------------------------------------------

  async listVMs(): Promise<VMInfo[]> {
    const { stdout } = await execFileAsync(VIRSH_BIN, ["list", "--all"], {
      timeout: 10_000,
    });
    return this.parse(stdout);
  }

  /** Start a shut-off VM by name. Name must pass SAFE_NAME_RE. */
  async startVm(name: string): Promise<void> {
    assertSafeName(name);
    await execFileAsync(VIRSH_BIN, ["start", name], { timeout: 30_000 });
  }

  /** Reboot a running VM by name. Name must pass SAFE_NAME_RE. */
  async rebootVm(name: string): Promise<void> {
    assertSafeName(name);
    await execFileAsync(VIRSH_BIN, ["reboot", name], { timeout: 30_000 });
  }

  /** Graceful shutdown. Name must pass SAFE_NAME_RE. */
  async shutdownVm(name: string): Promise<void> {
    assertSafeName(name);
    await execFileAsync(VIRSH_BIN, ["shutdown", name], { timeout: 30_000 });
  }

  // ---------------------------------------------------------------------------
  // Parse
  // ---------------------------------------------------------------------------

  /**
   * Parse `virsh list --all` output.
   *
   * Example output:
   *  Id   Name                State
   * ----------------------------------
   *   1   ghostchain-devnet   running
   *   -   vm-stopped          shut off
   */
  private parse(output: string): VMInfo[] {
    const lines = output.split("\n");
    const results: VMInfo[] = [];

    for (const line of lines) {
      // Skip header and divider lines.
      if (!line.trim() || line.includes("---") || line.toLowerCase().includes("name")) {
        continue;
      }
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;

      const [id, name, ...stateParts] = parts;
      if (!id || !name) continue;

      const stateRaw = stateParts.join(" ").toLowerCase();
      let state: VMState = "unknown";
      if (stateRaw.includes("running"))  state = "running";
      else if (stateRaw.includes("shut off")) state = "shut off";
      else if (stateRaw.includes("paused"))   state = "paused";
      else if (stateRaw.includes("crashed"))  state = "crashed";

      // Only include names that pass the safety regex (prevents storing malformed names).
      if (!SAFE_NAME_RE.test(name)) continue;

      results.push({ id, name, state });
    }

    return results;
  }
}
