import crypto from "node:crypto";
import { buildMerkleRoot, stableStringify } from "../merkle.js";

const toBig = (value, fallback = "0") => {
  try {
    return BigInt(String(value ?? fallback));
  } catch {
    return BigInt(fallback);
  }
};

const hashHex = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function snapshotAssets({ treasury, memberExposure = [], externalAssets = [] }) {
  const entries = [];
  entries.push({
    id: "treasury_total_value",
    type: "treasury_balance",
    amountWei: String(treasury.totalValueWei || "0")
  });
  entries.push({
    id: "treasury_available_balance",
    type: "treasury_available",
    amountWei: String(treasury.availableWei || "0")
  });
  for (const member of memberExposure) {
    entries.push({
      id: `member_exposure:${member.memberId}`,
      type: "member_exposure",
      memberId: member.memberId,
      policyVersion: member.policyVersion,
      amountWei: String(member.exposureWei || "0")
    });
  }
  for (const entry of externalAssets) {
    entries.push({
      id: String(entry.id || `external_asset_${entries.length}`),
      type: String(entry.type || "external_asset"),
      amountWei: String(entry.amountWei || "0")
    });
  }

  const totalWei = entries.reduce((sum, entry) => sum + toBig(entry.amountWei), 0n);
  const merkle = buildMerkleRoot(entries);
  return {
    entries,
    totalWei,
    root: merkle.root || hashHex(stableStringify(entries))
  };
}

export function snapshotLiabilities({ treasury, pendingRewardsWei = "0", externalLiabilities = [] }) {
  const entries = [];
  entries.push({
    id: "deployed_capital_obligation",
    type: "deployed_capital",
    amountWei: String(treasury.deployedCapitalWei || "0")
  });
  entries.push({
    id: "pending_rewards",
    type: "pending_rewards",
    amountWei: String(pendingRewardsWei || "0")
  });
  for (const entry of externalLiabilities) {
    entries.push({
      id: String(entry.id || `external_liability_${entries.length}`),
      type: String(entry.type || "external_liability"),
      amountWei: String(entry.amountWei || "0")
    });
  }

  const totalWei = entries.reduce((sum, entry) => sum + toBig(entry.amountWei), 0n);
  const merkle = buildMerkleRoot(entries);
  return {
    entries,
    totalWei,
    root: merkle.root || hashHex(stableStringify(entries))
  };
}

export function computeNetPositionRoot({ assetsRoot, liabilitiesRoot, assetsTotalWei, liabilitiesTotalWei, epoch }) {
  const payload = stableStringify({
    epoch,
    assetsRoot,
    liabilitiesRoot,
    assetsTotalWei: assetsTotalWei.toString(),
    liabilitiesTotalWei: liabilitiesTotalWei.toString()
  });
  return hashHex(payload);
}
