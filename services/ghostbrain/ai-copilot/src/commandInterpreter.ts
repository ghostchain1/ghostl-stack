/**
 * commandInterpreter.ts
 *
 * Stage 1 of the Copilot pipeline.
 * Normalises raw human-language input and extracts named entities
 * (region, service, count, target) for use by the intent classifier.
 */

export interface ParsedCommand {
  raw:        string;
  normalized: string;
  tokens:     string[];
  isQuery:    boolean;
  entities:   CommandEntities;
}

export interface CommandEntities {
  region?:  string;
  service?: string;
  count?:   number;
  layer?:   "L1" | "L2" | "L3";
  target?:  string;
}

// ── Entity dictionaries ───────────────────────────────────────────────────────

const REGIONS = [
  "europe", "eu",
  "asia", "ap",
  "usa", "us", "america",
  "global", "all",
  "east", "west", "north", "south",
];

const SERVICE_KEYWORDS: Record<string, string> = {
  validator:     "validator-fabric",
  validators:    "validator-fabric",
  rpc:           "aim",
  node:          "aim",
  nodes:         "aim",
  chain:         "multichain",
  ghostchain:    "multichain",
  kernel:        "kernel",
  governance:    "governance",
  security:      "tds",
  threat:        "tds",
  economic:      "economic",
  economy:       "economic",
  liquidity:     "economic",
  treasury:      "economic",
  compliance:    "acge",
  telemetry:     "data-mesh",
  data:          "data-mesh",
  evolution:     "evolution",
  evolution_engine: "evolution",
  intelligence:  "gin",
  swarm:         "gin",
  orchestrator:  "uo",
  uo:            "uo",
};

const QUERY_SIGNALS = [
  "how many", "how much", "what is", "what's", "what are",
  "which", "show me", "show", "tell me", "list",
  "status of", "status", "report", "summary",
  "is there", "are there", "do we have",
];

// ── Main interpreter ──────────────────────────────────────────────────────────

export function interpret(raw: string): ParsedCommand {
  const normalized = raw.toLowerCase().replace(/[?!.,;:]+$/, "").trim();
  const tokens     = normalized.split(/\s+/).filter(Boolean);

  // Region detection
  const region = REGIONS.find((r) => tokens.includes(r) || normalized.includes(r));

  // Service / target detection — longest match first
  const sortedKeys = Object.keys(SERVICE_KEYWORDS).sort((a, b) => b.length - a.length);
  const svcKey     = sortedKeys.find((k) => normalized.includes(k));
  const service    = svcKey ? SERVICE_KEYWORDS[svcKey] : undefined;

  // Numeric count extraction
  const numMatch = normalized.match(/\b(\d+)\b/);
  const count    = numMatch ? parseInt(numMatch[1], 10) : undefined;

  // Layer detection (l1, l2, l3)
  const layerMatch = normalized.match(/\bl([123])\b/);
  const layer      = layerMatch ? (`L${layerMatch[1]}` as "L1" | "L2" | "L3") : undefined;

  // Query vs command detection
  const isQuery = QUERY_SIGNALS.some((sig) => normalized.includes(sig));

  return {
    raw,
    normalized,
    tokens,
    isQuery,
    entities: { region, service, count, layer },
  };
}
