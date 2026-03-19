import { describe, expect, it } from "vitest";
import { buildGhostRoutePath, decideGhostRoute } from "../src/core/routeDecision.js";

describe("routeDecision", () => {
  it("defaults to same-layer routing when no target layer is provided", () => {
    const decision = decideGhostRoute({ from: "L2", to: "0x1234" });

    expect(decision.plan.targetLayer).toBe("L2");
    expect(decision.plan.path).toEqual(["L2"]);
    expect(decision.plan.executeOn).toBe("L2");
    expect(decision.plan.requiresMessaging).toBe(false);
  });

  it("builds the canonical multi-hop path for L3 to L1", () => {
    const decision = decideGhostRoute({ from: "L3", targetLayer: "L1", intent: "bridge" });

    expect(decision.plan.targetLayer).toBe("L1");
    expect(decision.plan.path).toEqual(["L3", "L2", "L1"]);
    expect(decision.plan.executeOn).toBe("L3");
    expect(decision.plan.requiresMessaging).toBe(true);
  });

  it("routes external egress through L1", () => {
    const decision = decideGhostRoute({ from: "L2", targetLayer: "EXTERNAL" });

    expect(decision.plan.targetLayer).toBe("EXTERNAL");
    expect(decision.plan.path).toEqual(["L2", "L1"]);
    expect(decision.plan.requiresMessaging).toBe(true);
  });

  it("accepts legacy layer-like to values as the target layer", () => {
    const decision = decideGhostRoute({ from: "L3", to: "L2" });

    expect(decision.plan.targetLayer).toBe("L2");
    expect(decision.plan.path).toEqual(["L3", "L2"]);
  });

  it("rejects downward routing jumps", () => {
    expect(() => buildGhostRoutePath("L1", "L2")).toThrow(/Policy jump blocked/);
  });
});
