import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ManagedUnit,
  RuntimeEnvironment,
  UnitManifestDocument,
  UnitManifestEntry,
} from "./types.js";

const DEFAULT_CONFIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../config");

const VALID_ENVIRONMENTS = new Set<RuntimeEnvironment>(["devnet", "testnet", "mainnet"]);

export function parseRuntimeEnvironment(raw: string | undefined): RuntimeEnvironment {
  if (raw === "testnet" || raw === "mainnet") return raw;
  return "devnet";
}

function isManifestEntry(value: unknown): value is UnitManifestEntry {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<UnitManifestEntry>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.kind === "string" &&
    typeof candidate.layer === "string" &&
    typeof candidate.env === "string" &&
    typeof candidate.desiredState === "string" &&
    Array.isArray(candidate.dependencies) &&
    !!candidate.governance &&
    typeof candidate.governance.actionClass === "string"
  );
}

function materializeUnit(entry: UnitManifestEntry): ManagedUnit {
  const awaitingHealth = entry.desiredState === "maintenance"
    ? "maintenance window active"
    : entry.checks?.rpcUrl
      ? "awaiting ghost RPC probe"
      : "no RPC probe configured";

  return {
    ...entry,
    actualState: entry.desiredState === "maintenance"
      ? "maintenance"
      : entry.desiredState === "stopped"
        ? "stopped"
        : "degraded",
    health: {
      status: entry.desiredState === "maintenance" ? "warn" : "warn",
      rpc: null,
      lastCheckAt: null,
      detail: awaitingHealth,
    },
  };
}

export async function loadManagedUnits(
  env: RuntimeEnvironment,
  configDir = process.env.ORCH_CONFIG_DIR ?? DEFAULT_CONFIG_DIR,
): Promise<{ manifest: UnitManifestDocument; manifestPath: string; units: ManagedUnit[] }> {
  const manifestPath = path.join(configDir, `units.${env}.json`);
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<UnitManifestDocument>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`invalid orchestrator manifest: ${manifestPath}`);
  }
  if (!parsed.env || !VALID_ENVIRONMENTS.has(parsed.env)) {
    throw new Error(`orchestrator manifest has invalid env: ${manifestPath}`);
  }
  if (parsed.env !== env) {
    throw new Error(`orchestrator manifest env mismatch: expected ${env}, received ${parsed.env}`);
  }
  if (!Array.isArray(parsed.units) || !parsed.units.every(isManifestEntry)) {
    throw new Error(`orchestrator manifest units are invalid: ${manifestPath}`);
  }

  const manifest: UnitManifestDocument = {
    env: parsed.env,
    generatedBy: parsed.generatedBy ?? "services/ghost-orchestrator",
    units: parsed.units,
  };

  return {
    manifest,
    manifestPath,
    units: manifest.units.map(materializeUnit),
  };
}
