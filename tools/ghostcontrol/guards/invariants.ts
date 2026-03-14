import { readFile } from "node:fs/promises";

export type Layer = "l1" | "l2" | "l3" | "external";
export type VmTarget = "devnet" | "testnet" | "mainnet";
export type ViolationSeverity = "critical" | "high" | "medium";

export interface ChainIdentity {
  chainId: number;
  name: string;
  layer: "l1" | "l2" | "l3";
}

const MAINCHAIN_ALLOWLIST: ReadonlyArray<ChainIdentity> = [
  { chainId: 14000101, name: "GhostChain", layer: "l1" },
  { chainId: 901,      name: "GhostL2",    layer: "l2" },
  { chainId: 903,      name: "GhostL3",    layer: "l3" },
];

const MAINCHAIN_IDS: ReadonlySet<number> = new Set(
  MAINCHAIN_ALLOWLIST.map((c) => c.chainId),
);

export interface LayerRoute {
  from: "l2" | "l3";
  to: Layer;
  integration: string;
  via?: "l2" | "direct";
}

export interface ContainerSecurityState {
  name: string;
  user?: string;
  privileged?: boolean;
  healthcheck?: boolean;
  readOnlyRootFs?: boolean;
}

export interface GovernanceGate {
  target: VmTarget;
  proposalApproved: boolean;
  proposalId?: string;
  constitutionalGateEnabled?: boolean;
}

export interface InvariantConfig {
  routes: LayerRoute[];
  containers: ContainerSecurityState[];
  governance: GovernanceGate;
  chains?: { allowlist: ChainIdentity[] };
}

export interface InvariantViolation {
  code: string;
  severity: ViolationSeverity;
  message: string;
  context?: Record<string, unknown>;
}

export interface InvariantResult {
  ok: boolean;
  violations: InvariantViolation[];
}

function normalizeContainerName(name: string): string {
  return name.trim().toLowerCase().replace(/^\/+/, "");
}

function isRootUser(value?: string): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "0" || normalized === "0:0" || normalized === "root";
}

function pushViolation(
  list: InvariantViolation[],
  violation: InvariantViolation,
): InvariantViolation[] {
  list.push(violation);
  return list;
}

export function evaluateInvariants(config: InvariantConfig): InvariantResult {
  const violations: InvariantViolation[] = [];

  // ── Chain allowlist: only GhostChain / GhostL2 / GhostL3 are permitted ──
  const configuredChains = config.chains?.allowlist ?? [];
  for (const chain of configuredChains) {
    if (!MAINCHAIN_IDS.has(chain.chainId)) {
      pushViolation(violations, {
        code: "CHAIN_NOT_IN_MAINCHAIN_ALLOWLIST",
        severity: "critical",
        message: `Chain ${chain.name} (chainId=${chain.chainId}) is not a recognised GhostChain mainchain.`,
        context: chain as unknown as Record<string, unknown>,
      });
    }
  }

  // Ensure at minimum the three canonical chains are declared
  if (configuredChains.length === 0) {
    pushViolation(violations, {
      code: "MAINCHAIN_ALLOWLIST_MISSING",
      severity: "high",
      message: "No chain allowlist declared. GhostChain (L1/L2/L3) chains must be explicitly listed.",
    });
  } else {
    const declaredIds = new Set(configuredChains.map((c) => c.chainId));
    for (const canonical of MAINCHAIN_ALLOWLIST) {
      if (!declaredIds.has(canonical.chainId)) {
        pushViolation(violations, {
          code: "MAINCHAIN_CHAIN_UNDECLARED",
          severity: "high",
          message: `Canonical chain ${canonical.name} (chainId=${canonical.chainId}) is missing from the chain allowlist.`,
          context: canonical as unknown as Record<string, unknown>,
        });
      }
    }
  }

  for (const route of config.routes) {
    if (route.from === "l2" && route.to === "external") {
      pushViolation(violations, {
        code: "L2_DIRECT_EXTERNAL_BRIDGE_BLOCKED",
        severity: "critical",
        message: "GhostL2 may not transact directly with external chains.",
        context: route as unknown as Record<string, unknown>,
      });
    }

    if (route.from === "l3" && route.to === "external") {
      pushViolation(violations, {
        code: "L3_DIRECT_EXTERNAL_BRIDGE_BLOCKED",
        severity: "critical",
        message: "GhostL3 may not transact directly with external chains.",
        context: route as unknown as Record<string, unknown>,
      });
    }

    if (route.from === "l3" && route.to === "l1" && route.via !== "l2") {
      pushViolation(violations, {
        code: "L3_TO_L1_MUST_ROUTE_VIA_L2",
        severity: "critical",
        message: "GhostL3 -> GhostChain traffic must route through GhostL2.",
        context: route as unknown as Record<string, unknown>,
      });
    }

    if (route.from === "l2" && !["l1", "l2"].includes(route.to)) {
      pushViolation(violations, {
        code: "L2_ROUTE_OUTSIDE_GHOSTCHAIN_POLICY",
        severity: "high",
        message: "GhostL2 routes are restricted to GhostChain and internal L2 services.",
        context: route as unknown as Record<string, unknown>,
      });
    }
  }

  for (const container of config.containers) {
    if (container.privileged) {
      pushViolation(violations, {
        code: "CONTAINER_PRIVILEGED_MODE",
        severity: "high",
        message: `Container ${container.name} is running privileged.`,
        context: container as unknown as Record<string, unknown>,
      });
    }

    if (isRootUser(container.user)) {
      pushViolation(violations, {
        code: "CONTAINER_ROOT_USER",
        severity: "medium",
        message: `Container ${container.name} should not run as root.`,
        context: container as unknown as Record<string, unknown>,
      });
    }

    if (container.healthcheck === false) {
      pushViolation(violations, {
        code: "CONTAINER_HEALTHCHECK_MISSING",
        severity: "medium",
        message: `Container ${container.name} does not declare a healthcheck.`,
        context: container as unknown as Record<string, unknown>,
      });
    }
  }

  if (config.governance.target === "mainnet") {
    if (!config.governance.proposalApproved) {
      pushViolation(violations, {
        code: "MAINNET_GOVERNANCE_APPROVAL_REQUIRED",
        severity: "critical",
        message: "Mainnet-affecting changes require approved governance.",
      });
    }
    if (!config.governance.proposalId) {
      pushViolation(violations, {
        code: "MAINNET_PROPOSAL_ID_REQUIRED",
        severity: "high",
        message: "Mainnet change is missing governance proposal ID.",
      });
    }
    if (config.governance.constitutionalGateEnabled === false) {
      pushViolation(violations, {
        code: "MAINNET_CONSTITUTIONAL_GATE_DISABLED",
        severity: "high",
        message: "Constitutional deploy gate must be enabled on mainnet changes.",
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function mergeRuntimeContainerStates(
  configured: ContainerSecurityState[],
  runtime: ContainerSecurityState[],
): ContainerSecurityState[] {
  const configuredNames = new Set(configured.map((container) => normalizeContainerName(container.name)));
  const runtimeByName = new Map(
    runtime.map((container) => [normalizeContainerName(container.name), container] as const),
  );

  const merged = configured.map((container) => {
    const runtimeState = runtimeByName.get(normalizeContainerName(container.name));
    if (!runtimeState) return container;
    return {
      ...container,
      user: runtimeState.user ?? container.user,
      privileged:
        typeof runtimeState.privileged === "boolean"
          ? runtimeState.privileged
          : container.privileged,
      healthcheck:
        typeof runtimeState.healthcheck === "boolean"
          ? runtimeState.healthcheck
          : container.healthcheck,
      readOnlyRootFs:
        typeof runtimeState.readOnlyRootFs === "boolean"
          ? runtimeState.readOnlyRootFs
          : container.readOnlyRootFs,
    };
  });

  for (const container of runtime) {
    if (!configuredNames.has(normalizeContainerName(container.name))) {
      merged.push(container);
    }
  }

  return merged;
}

export function runtimeInspectionWarningsToViolations(
  warnings: string[],
): InvariantViolation[] {
  return warnings.map((warning) => ({
    code: "CONTAINER_RUNTIME_INSPECTION_DEGRADED",
    severity: "high",
    message: warning,
    context: { warning },
  }));
}

export function assertChainAllowed(chainId: number): ChainIdentity {
  const found = MAINCHAIN_ALLOWLIST.find((c) => c.chainId === chainId);
  if (!found) {
    throw new Error(
      `invariant_chain_blocked:${chainId} — only GhostChain (14000101), GhostL2 (901), GhostL3 (903) are permitted`,
    );
  }
  return found;
}

export async function loadInvariantConfig(configPath: string): Promise<InvariantConfig> {
  const raw = JSON.parse(await readFile(configPath, "utf8")) as InvariantConfig;
  return {
    routes: raw.routes ?? [],
    containers: raw.containers ?? [],
    governance: raw.governance,
  };
}

export function hasStopShipRisk(result: InvariantResult): boolean {
  return result.violations.some((violation) => violation.severity === "critical");
}
