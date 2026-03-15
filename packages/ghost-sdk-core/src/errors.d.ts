export declare class GhostRpcError extends Error {
    code: number;
    data?: unknown | undefined;
    constructor(code: number, message: string, data?: unknown | undefined);
}
export declare class GhostNetworkError extends Error {
    cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
export declare class GhostTransactionError extends Error {
    txHash?: string | undefined;
    constructor(message: string, txHash?: string | undefined);
}
export declare class GhostABIError extends Error {
    constructor(message: string);
}
export declare class GhostWalletError extends Error {
    constructor(message: string);
}
export declare class GhostPolicyViolationError extends Error {
    ruleId: string;
    constructor(message: string, ruleId: string);
}
export declare class GhostBridgeError extends Error {
    layer: "L1" | "L2" | "L3";
    constructor(message: string, layer: "L1" | "L2" | "L3");
}
export declare class GhostFailoverExhaustedError extends Error {
    attempts: number;
    constructor(attempts: number);
}
