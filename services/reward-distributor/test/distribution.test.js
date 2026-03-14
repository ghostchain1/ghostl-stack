import test from "node:test";
import assert from "node:assert/strict";

const splitRewards = ({ netYieldWei, reserveBps, validatorBps, ecosystemBps, l2l3Bps }) => {
  const totalBps = reserveBps + validatorBps + ecosystemBps + l2l3Bps;
  if (totalBps > 10_000) {
    throw new Error("distribution_bps_exceeds_10000");
  }

  const reserveWei = (netYieldWei * BigInt(reserveBps)) / 10_000n;
  const validatorWei = (netYieldWei * BigInt(validatorBps)) / 10_000n;
  const ecosystemWei = (netYieldWei * BigInt(ecosystemBps)) / 10_000n;
  const l2l3Wei = (netYieldWei * BigInt(l2l3Bps)) / 10_000n;

  const distributed = reserveWei + validatorWei + ecosystemWei + l2l3Wei;
  if (distributed > netYieldWei) {
    throw new Error("distribution_exceeds_net_yield");
  }

  return distributed;
};

const normalizeMemberPools = (rawPools) => {
  if (rawPools == null) return [];
  if (!Array.isArray(rawPools)) throw new Error("member_pools_must_be_array");
  const pools = rawPools.map((entry) => {
    const memberId = String(entry?.memberId || "").trim();
    const memberBps = Number(entry?.memberBps ?? 0);
    const compliant = entry?.compliant !== false;
    if (!memberId) throw new Error("member_id_required");
    if (!Number.isFinite(memberBps) || memberBps < 0 || memberBps > 10_000) throw new Error("invalid_member_bps");
    if (!compliant) throw new Error(`member_non_compliant:${memberId}`);
    return { memberId, memberBps: Math.floor(memberBps), compliant: true };
  });
  const total = pools.reduce((sum, entry) => sum + entry.memberBps, 0);
  if (total > 10_000) throw new Error("member_pool_bps_exceeds_10000");
  return pools;
};

test("distribution never exceeds net yield", () => {
  const distributed = splitRewards({
    netYieldWei: 1_000_000n,
    reserveBps: 2000,
    validatorBps: 3000,
    ecosystemBps: 3000,
    l2l3Bps: 2000
  });
  assert.ok(distributed <= 1_000_000n);
});

test("invalid bps rejected", () => {
  assert.throws(
    () =>
      splitRewards({
        netYieldWei: 1_000n,
        reserveBps: 5000,
        validatorBps: 5000,
        ecosystemBps: 500,
        l2l3Bps: 0
      }),
    /distribution_bps_exceeds_10000/
  );
});

test("member pools require compliant members", () => {
  assert.throws(
    () =>
      normalizeMemberPools([
        { memberId: "region-a", memberBps: 3000, compliant: true },
        { memberId: "region-b", memberBps: 2000, compliant: false }
      ]),
    /member_non_compliant:region-b/
  );
});
