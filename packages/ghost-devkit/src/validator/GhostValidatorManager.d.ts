export type ValidatorStatus = "running" | "repairing" | "stopped" | "unknown";
export interface ValidatorInfo {
    status: ValidatorStatus;
    block?: bigint;
    peers?: number;
    syncing?: boolean;
    healthy?: boolean;
}
export declare class GhostValidatorManager {
    private readonly rpcUrl;
    private readonly _autoRepairRunner;
    private readonly health;
    private _status;
    constructor(rpcUrl: string);
    static create(): Promise<GhostValidatorManager>;
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    status(): Promise<ValidatorInfo>;
    autoRepair(): Promise<void>;
}
//# sourceMappingURL=GhostValidatorManager.d.ts.map