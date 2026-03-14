import { Logger } from "../utils/Logger.js";

const log = Logger.create("DeploymentPlanner");

export interface ContractNode {
  name: string;
  /** Names of other contracts this one depends on */
  deps?: string[];
}

export interface DeploymentPlan {
  ordered: string[];
  /** Contracts with unresolved deps */
  missing: string[];
}

export class GhostDeploymentPlanner {
  /** Topological sort of contracts by dependency order. */
  plan(contracts: ContractNode[]): DeploymentPlan {
    const byName = new Map(contracts.map((c) => [c.name, c]));
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const ordered: string[] = [];
    const missing: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (inStack.has(name)) {
        log.warn(`Cycle detected at ${name} — breaking`);
        return;
      }
      const node = byName.get(name);
      if (!node) {
        if (!missing.includes(name)) missing.push(name);
        return;
      }
      inStack.add(name);
      for (const dep of node.deps ?? []) visit(dep);
      inStack.delete(name);
      visited.add(name);
      ordered.push(name);
    };

    for (const c of contracts) visit(c.name);

    log.info(`Plan: [${ordered.join(" → ")}]`);
    if (missing.length > 0) log.warn(`Missing deps: ${missing.join(", ")}`);
    return { ordered, missing };
  }

  /** Simple helper — wrap string names with no deps. */
  from(names: string[]): DeploymentPlan {
    return this.plan(names.map((n) => ({ name: n })));
  }
}
