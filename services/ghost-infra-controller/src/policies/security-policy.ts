/**
 * Security Policy
 *
 * Rules:
 *   - Only containers whose image name starts with "ghost" are managed.
 *   - Container/VM names must match SAFE_NAME_RE before any exec call.
 *   - Only allowlisted virsh domains may be started/stopped by the controller.
 */
import { SAFE_NAME_RE } from "../types.js";

/** Allowlisted image prefixes. Only "ghost"-prefixed images are touched. */
const ALLOWED_IMAGE_PREFIXES: readonly string[] = ["ghost"];

/** Allowlisted VM domain names the controller is permitted to manage.
 *  Populated from MANAGED_VM_NAMES env (comma-separated). Empty = manage all ghost-prefixed VMs. */
const MANAGED_VM_ALLOWLIST: Set<string> = new Set(
  (process.env.MANAGED_VM_NAMES ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

/** Max restart attempts per container per cycle before suppressing further actions. */
export const MAX_RESTART_ATTEMPTS_PER_CYCLE = 3;

/** Minimum node sync lag (blocks) that triggers a restart proposal. */
export const NODE_SYNC_LAG_THRESHOLD = parseInt(process.env.NODE_SYNC_LAG_THRESHOLD ?? "50", 10);

/** Maximum network latency (ms) before a reroute proposal is raised. */
export const MAX_LATENCY_MS = parseInt(process.env.MAX_LATENCY_MS ?? "200", 10);

/** Minimum free disk bytes below which a storage-expand proposal is raised (default 10 GiB). */
export const MIN_FREE_DISK_BYTES = parseInt(
  process.env.MIN_FREE_DISK_BYTES ?? String(10 * 1024 * 1024 * 1024),
  10
);

/**
 * Returns true if the given container image is allowed to be managed.
 * SECURITY: prevents the controller from touching unrelated workloads.
 */
export function isAllowedImage(image: string): boolean {
  const imageName = image.split(":")[0] ?? image; // strip tag
  return ALLOWED_IMAGE_PREFIXES.some(p => imageName.startsWith(p));
}

/**
 * Returns true if the VM domain may be managed.
 * If MANAGED_VM_ALLOWLIST is empty, any VM name that starts with "ghost" is allowed.
 */
export function isAllowedVM(vmName: string): boolean {
  if (!SAFE_NAME_RE.test(vmName)) return false;
  if (MANAGED_VM_ALLOWLIST.size > 0) return MANAGED_VM_ALLOWLIST.has(vmName);
  return vmName.startsWith("ghost");
}

/**
 * Returns true if the container name is allowed for management.
 * Must also pass isAllowedImage check on its image separately.
 */
export function isAllowedContainer(containerName: string): boolean {
  return SAFE_NAME_RE.test(containerName);
}
