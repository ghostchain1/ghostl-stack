/**
 * DNS Manager
 *
 * Reloads Bind9 zone configuration via `rndc reload` when called.
 * Auto-executable (non-destructive) when ALLOW_AUTO_EXEC=true.
 *
 * SECURITY: execFile with fixed arguments — no user input in command.
 * rndc must be reachable as the controller process user. Configure
 * /etc/rndc.key with appropriate permissions.
 *
 * Used for: ghostchain node DNS, API endpoint routing, gateway records.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify }              from "node:util";
import type { InfraAction }       from "../types.js";
import { ALLOW_AUTO_EXEC }        from "../state.js";

const execFile = promisify(execFileCb);

/** Only reload DNS if the last reload was more than MIN_RELOAD_INTERVAL_MS ago. */
const MIN_RELOAD_INTERVAL_MS = 60_000;
let lastReloadAt = 0;

async function rndcReload(): Promise<{ ok: boolean; error?: string }> {
  try {
    await execFile("rndc", ["reload"], { timeout: 10_000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function manageDNS(): Promise<InfraAction[]> {
  const now = Date.now();

  // Rate-limit DNS reloads to prevent thundering herd on rapid cycles
  if (now - lastReloadAt < MIN_RELOAD_INTERVAL_MS) {
    return [];
  }

  const action: InfraAction = {
    id:          crypto.randomUUID(),
    type:        "dns_reload",
    target:      "bind9",
    description: "Scheduled Bind9 DNS reload to sync latest ghost-node and API endpoint records.",
    params:      { rndcCommand: "reload" },
    timestamp:   now,
    risk:        "low",
    autoExecute: ALLOW_AUTO_EXEC,
  };

  if (action.autoExecute) {
    lastReloadAt = now;
    const result = await rndcReload();
    action.params["executed"] = result.ok;
    if (!result.ok) action.params["execError"] = result.error;
  }

  return [action];
}
