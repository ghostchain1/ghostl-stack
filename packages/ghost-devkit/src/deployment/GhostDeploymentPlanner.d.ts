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
export declare class GhostDeploymentPlanner {
    /** Topological sort of contracts by dependency order. */
    plan(contracts: ContractNode[]): DeploymentPlan;
    /** Simple helper — wrap string names with no deps. */
    from(names: string[]): DeploymentPlan;
}
//# sourceMappingURL=GhostDeploymentPlanner.d.ts.map