/**
 * GhostBrain Kernel — Shared Types
 *
 * Extracted to break the circular dependency between command_bus.ts and
 * safety_guard.ts.  Both modules import from here instead of from each other.
 */

export interface KernelCommand {
  /** Auto-generated UUID if omitted. */
  id?:         string;
  /** Target subsystem. */
  type:        "docker" | "vm" | "system" | "resource";
  /** Action within the subsystem — validated by SafetyGuard. */
  action:      string;
  /** Container name, VM name, or resource ID.  Validated by SafetyGuard. */
  target?:     string;
  /** Action-specific parameters (safe, structured — never concatenated to a shell). */
  params?:     Record<string, unknown>;
  /**
   * Identity of the requester for the audit log.
   * e.g. "resource_controller" | "hypercore" | "cognitive" | "api"
   */
  requestedBy: string;
  /** When true the handler performs a read-only simulation and notes what it would do. */
  dryRun?:     boolean;
}

export interface KernelResult {
  commandId:  string;
  ok:         boolean;
  detail?:    string;
  executedAt: number;
  durationMs: number;
  dryRun:     boolean;
}

export interface KernelHandler {
  canHandle(cmd: KernelCommand): boolean;
  execute(cmd: KernelCommand): Promise<KernelResult>;
}
