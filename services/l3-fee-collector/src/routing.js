const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const FEE_SOURCES = new Set(["gas", "deployment", "sdk", "commission"]);

export function assertEvmAddress(value, label) {
  const text = String(value || "").trim();
  if (!ADDRESS_REGEX.test(text)) {
    throw new Error(`${label}_must_be_0x_address`);
  }
  return text;
}

export function normalizeFeeSource(value) {
  const source = String(value || "").trim().toLowerCase();
  if (!FEE_SOURCES.has(source)) {
    throw new Error("invalid_fee_source");
  }
  return source;
}

export function toWeiString(value) {
  const raw = typeof value === "bigint" ? value : BigInt(String(value || "0"));
  if (raw <= 0n) {
    throw new Error("amount_must_be_positive");
  }
  return raw.toString();
}

export function assertL3ToL2Route({
  destinationLayer,
  destinationChainId,
  destinationBridgeAddress,
  expectedL2ChainId,
  expectedBridgeAddress
}) {
  const layer = String(destinationLayer || "").trim().toUpperCase();
  if (layer !== "L2") {
    throw new Error("routing_violation_l3_must_route_to_l2");
  }

  const chainId = Number(destinationChainId);
  if (!Number.isFinite(chainId) || chainId !== Number(expectedL2ChainId)) {
    throw new Error("routing_violation_wrong_l2_chain");
  }

  const bridge = assertEvmAddress(destinationBridgeAddress, "destination_bridge_address");
  if (bridge.toLowerCase() !== String(expectedBridgeAddress || "").trim().toLowerCase()) {
    throw new Error("routing_violation_bridge_mismatch");
  }

  return { layer, chainId, bridge };
}

export function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const inner = entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",");
    return `{${inner}}`;
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  return JSON.stringify(value);
}
