const FEE_TYPES = new Set(["gas", "deployment", "sdk", "commission", "trading", "lp", "bridge", "launchpad"]);

export function normalizeFeeType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!FEE_TYPES.has(text)) {
    throw new Error("invalid_fee_type");
  }
  return text;
}

export function toWeiString(value) {
  const amount = BigInt(String(value || "0"));
  if (amount <= 0n) {
    throw new Error("amount_must_be_positive");
  }
  return amount.toString();
}

export function assertInboundRoute(payload, ids) {
  const sourceLayer = String(payload?.sourceLayer || "").trim().toUpperCase();
  const targetLayer = String(payload?.targetLayer || "").trim().toUpperCase();
  const sourceChainId = Number(payload?.sourceChainId);
  const targetChainId = Number(payload?.targetChainId);

  if (!["L2", "L3"].includes(sourceLayer)) {
    throw new Error("routing_violation_invalid_source_layer");
  }

  if (sourceLayer === "L3") {
    if (targetLayer !== "L2") {
      throw new Error("routing_violation_l3_must_pass_through_l2");
    }
    if (sourceChainId !== ids.l3) {
      throw new Error("routing_violation_invalid_l3_chain");
    }
    if (targetChainId !== ids.l2) {
      throw new Error("routing_violation_l3_target_not_l2");
    }
  }

  if (sourceLayer === "L2") {
    if (targetLayer !== "L1") {
      throw new Error("routing_violation_l2_must_target_l1");
    }
    if (sourceChainId !== ids.l2) {
      throw new Error("routing_violation_invalid_l2_chain");
    }
    if (targetChainId !== ids.l1) {
      throw new Error("routing_violation_l2_external_destination_forbidden");
    }
  }

  return {
    sourceLayer,
    targetLayer,
    sourceChainId,
    targetChainId
  };
}

export function assertOutboundRoute(destinationChainId, expectedL1ChainId) {
  if (Number(destinationChainId) !== Number(expectedL1ChainId)) {
    throw new Error("routing_violation_l2_outbound_must_be_l1");
  }
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
    const text = entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",");
    return `{${text}}`;
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  return JSON.stringify(value);
}
