import { Interface, type TransactionRequest } from "@ghostchain/sdk";
import type { GhostLayer } from "../config.js";
import type { GhostTargetLayer, RoutedTxPlan, TxRouteDecision } from "./Types.js";

const DEFAULT_ROUTING_PATH: readonly GhostLayer[] = ["L3", "L2", "L1"];
const DEFAULT_RELAY_GAS_LIMIT = 200_000;
const MAX_UINT32 = 0xffff_ffffn;
const RELAY_GATEWAY_INTERFACE = new Interface([
  "function sendMessage(address target, bytes message, uint32 minGasLimit)",
]);

function isLayer(value: unknown): value is GhostLayer {
  return value === "L1" || value === "L2" || value === "L3";
}

function isTargetLayer(value: unknown): value is GhostTargetLayer {
  return isLayer(value) || value === "EXTERNAL";
}

export function buildDeterministicRoutePlan(params: {
  from: GhostLayer;
  targetLayer?: GhostTargetLayer;
  routingPath?: readonly GhostLayer[];
  reason?: string;
}): RoutedTxPlan {
  const { from, reason } = params;
  const targetLayer = params.targetLayer ?? from;
  const routingPath = params.routingPath ?? DEFAULT_ROUTING_PATH;
  const terminalLayer: GhostLayer = targetLayer === "EXTERNAL" ? "L1" : targetLayer;
  const fromIdx = routingPath.indexOf(from);
  const terminalIdx = routingPath.indexOf(terminalLayer);

  if (fromIdx === -1 || terminalIdx === -1) {
    throw new Error(`Unknown routing layer mapping (${from} -> ${targetLayer})`);
  }

  if (fromIdx > terminalIdx) {
    throw new Error(`Routing jump not allowed: ${from} → ${targetLayer}`);
  }

  const path = routingPath.slice(fromIdx, terminalIdx + 1) as GhostLayer[];

  return {
    path,
    executeOn: from,
    targetLayer,
    requiresMessaging: path.length > 1,
    reason: reason
      ?? (targetLayer === from
        ? "Fallback same-layer routing"
        : targetLayer === "EXTERNAL"
          ? "Fallback external egress routing"
          : "Fallback canonical hop routing"),
  };
}

export function normalizeRouteDecision(
  decision: Partial<TxRouteDecision> | null | undefined,
  fallbackPlan: RoutedTxPlan,
): TxRouteDecision {
  const plan = decision?.plan;
  const path = Array.isArray(plan?.path) && plan.path.length > 0
    ? plan.path as GhostLayer[]
    : fallbackPlan.path;

  return {
    plan: {
      path,
      executeOn: isLayer(plan?.executeOn) ? plan.executeOn : fallbackPlan.executeOn,
      targetLayer: isTargetLayer(plan?.targetLayer) ? plan.targetLayer : fallbackPlan.targetLayer,
      requiresMessaging: typeof plan?.requiresMessaging === "boolean"
        ? plan.requiresMessaging
        : path.length > 1,
      reason: typeof plan?.reason === "string" && plan.reason.length > 0
        ? plan.reason
        : fallbackPlan.reason,
    },
    riskScore: typeof decision?.riskScore === "number"
      ? decision.riskScore
      : (fallbackPlan.requiresMessaging ? 0.25 : 0.05),
    notes: Array.isArray(decision?.notes) ? decision.notes : [],
  };
}

function envTrim(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

export function resolveRelayGatewayForHop(from: GhostLayer, to: GhostLayer): string | undefined {
  if (from === "L3" && to === "L2") {
    return envTrim("L3_TO_L2_GATEWAY_ADDRESS")
      ?? envTrim("L3_TO_L2_MESSENGER_ADDRESS")
      ?? envTrim("L3_CROSS_DOMAIN_MESSENGER_ADDRESS");
  }

  if (from === "L2" && to === "L1") {
    return envTrim("L2_TO_L1_GATEWAY_ADDRESS")
      ?? envTrim("L2_TO_L1_MESSENGER_ADDRESS")
      ?? envTrim("L2_CROSS_DOMAIN_MESSENGER_ADDRESS");
  }

  return undefined;
}

function normalizeRelayGasLimit(gasLimit?: bigint | null): number {
  const envValue = process.env.HOP_EXECUTOR_RELAY_GAS_LIMIT
    ?? process.env.HOP_EXECUTOR_GAS_LIMIT;
  const fallback = envValue ? BigInt(envValue) : BigInt(DEFAULT_RELAY_GAS_LIMIT);
  const resolved = gasLimit ?? fallback;

  if (resolved < 0n || resolved > MAX_UINT32) {
    throw new Error(`Relay gas limit ${resolved.toString()} is outside uint32 bounds`);
  }

  return Number(resolved);
}

function missingGatewayError(from: GhostLayer, to: GhostLayer): Error {
  const envHint = from === "L3"
    ? "L3_TO_L2_GATEWAY_ADDRESS"
    : "L2_TO_L1_GATEWAY_ADDRESS";
  return new Error(`Missing relay gateway for ${from} -> ${to}; set ${envHint} (or legacy messenger alias)`);
}

export function buildRelayTransaction(
  plan: RoutedTxPlan,
  tx: TransactionRequest,
): TransactionRequest {
  if (plan.path.length <= 1) return tx;

  if (!tx.to || typeof tx.to !== "string") {
    throw new Error("crossLayerSend requires a target contract address");
  }

  const value = tx.value == null ? 0n : BigInt(tx.value);
  if (value !== 0n) {
    throw new Error("crossLayerSend does not support nonzero value across relay gateways");
  }

  const minGasLimit = normalizeRelayGasLimit(
    tx.gasLimit == null ? undefined : BigInt(tx.gasLimit),
  );

  let currentTarget = tx.to;
  let currentMessage = typeof tx.data === "string" ? tx.data : "0x";

  for (let i = plan.path.length - 2; i >= 0; i--) {
    const from = plan.path[i]!;
    const to = plan.path[i + 1]!;
    const gateway = resolveRelayGatewayForHop(from, to);
    if (!gateway) throw missingGatewayError(from, to);

    currentMessage = RELAY_GATEWAY_INTERFACE.encodeFunctionData("sendMessage", [
      currentTarget,
      currentMessage,
      minGasLimit,
    ]);
    currentTarget = gateway;
  }

  return {
    ...tx,
    to: currentTarget,
    data: currentMessage,
    value: 0n,
    gasLimit: tx.gasLimit ?? BigInt(minGasLimit),
  };
}
