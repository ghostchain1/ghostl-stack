/**
 * GhostBrain Kernel — VM Manager
 *
 * KernelHandler for libvirt VM lifecycle operations.
 * Calls the libvirt REST bridge (LIBVIRT_REST_URL) — never shell exec
 * (virsh) — to eliminate command injection risk in the AI control path.
 *
 * The VM name supplied in KernelCommand.target has already been validated
 * by SafetyGuard before this handler is reached.  It is additionally
 * passed through encodeURIComponent before being placed in the URL path.
 *
 * Falls back to a safe no-op (logged as unavailable) when LIBVIRT_REST_URL
 * is not configured.
 *
 * Supported actions:
 *   start    POST /domains/{name}/start
 *   stop     POST /domains/{name}/stop
 *   reboot   POST /domains/{name}/reboot
 *   suspend  POST /domains/{name}/suspend
 *   resume   POST /domains/{name}/resume
 *
 * Env vars:
 *   LIBVIRT_REST_URL   e.g. http://localhost:8080  (libvirt REST bridge)
 */

import { request } from "undici";
import type { KernelCommand, KernelResult, KernelHandler } from "./kernel_types.js";
import { log } from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const LIBVIRT_REST_URL = process.env.LIBVIRT_REST_URL ?? "";

// Fixed suffix per action — no user data interpolated into these strings.
const ACTION_SUFFIXES: Readonly<Record<string, string>> = {
  start:   "/start",
  stop:    "/stop",
  reboot:  "/reboot",
  suspend: "/suspend",
  resume:  "/resume",
};

// ── libvirt REST helpers ──────────────────────────────────────────────────────

async function libvirtPost(
  vmName: string,
  action: string,
  dryRun: boolean,
): Promise<{ ok: boolean; detail: string }> {
  if (dryRun) {
    const suffix = ACTION_SUFFIXES[action] ?? `/${action}`;
    return { ok: true, detail: `dry-run: POST ${LIBVIRT_REST_URL}/domains/${vmName}${suffix} skipped` };
  }

  if (!LIBVIRT_REST_URL) {
    return {
      ok:     false,
      detail: "LIBVIRT_REST_URL is not configured — VM control unavailable; set env var to enable",
    };
  }

  const suffix = ACTION_SUFFIXES[action];
  if (!suffix) return { ok: false, detail: `unknown vm action: "${action}"` };

  const url = `${LIBVIRT_REST_URL}/domains/${encodeURIComponent(vmName)}${suffix}`;
  try {
    const res = await request(url, {
      method:      "POST",
      headers:     { "Content-Type": "application/json", "Content-Length": "0" },
      bodyTimeout: 20_000,
    });
    await res.body.dump();
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    if (!ok) log.warn("vm_manager: non_2xx", `${action} ${vmName} → HTTP ${res.statusCode}`);
    return { ok, detail: `HTTP ${res.statusCode}` };
  } catch (err) {
    log.warn("vm_manager: api_error", `${action} ${vmName} → ${String(err)}`);
    return { ok: false, detail: String(err) };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

let _commandCount = 0;
let _successCount = 0;

export class VMManager implements KernelHandler {
  canHandle(cmd: KernelCommand): boolean {
    return cmd.type === "vm";
  }

  async execute(cmd: KernelCommand): Promise<KernelResult> {
    const start = Date.now();
    _commandCount++;

    const vmName = cmd.target ?? "";
    if (!vmName) {
      return {
        commandId:  cmd.id!,
        ok:         false,
        detail:     "missing target: VM name required",
        executedAt: start,
        durationMs: 0,
        dryRun:     !!cmd.dryRun,
      };
    }

    const { ok, detail } = await libvirtPost(vmName, cmd.action, !!cmd.dryRun);
    if (ok) _successCount++;

    return {
      commandId:  cmd.id!,
      ok,
      detail,
      executedAt: start,
      durationMs: Date.now() - start,
      dryRun:     !!cmd.dryRun,
    };
  }
}

export const vmManager = new VMManager();

export function vmManagerStats(): { commands: number; successes: number } {
  return { commands: _commandCount, successes: _successCount };
}
