"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Ghost SDK Core – Custom Error Classes
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostFailoverExhaustedError = exports.GhostBridgeError = exports.GhostPolicyViolationError = exports.GhostWalletError = exports.GhostABIError = exports.GhostTransactionError = exports.GhostNetworkError = exports.GhostRpcError = void 0;
class GhostRpcError extends Error {
    code;
    data;
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
        this.name = "GhostRpcError";
    }
}
exports.GhostRpcError = GhostRpcError;
class GhostNetworkError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = "GhostNetworkError";
    }
}
exports.GhostNetworkError = GhostNetworkError;
class GhostTransactionError extends Error {
    txHash;
    constructor(message, txHash) {
        super(message);
        this.txHash = txHash;
        this.name = "GhostTransactionError";
    }
}
exports.GhostTransactionError = GhostTransactionError;
class GhostABIError extends Error {
    constructor(message) {
        super(message);
        this.name = "GhostABIError";
    }
}
exports.GhostABIError = GhostABIError;
class GhostWalletError extends Error {
    constructor(message) {
        super(message);
        this.name = "GhostWalletError";
    }
}
exports.GhostWalletError = GhostWalletError;
class GhostPolicyViolationError extends Error {
    ruleId;
    constructor(message, ruleId) {
        super(message);
        this.ruleId = ruleId;
        this.name = "GhostPolicyViolationError";
    }
}
exports.GhostPolicyViolationError = GhostPolicyViolationError;
class GhostBridgeError extends Error {
    layer;
    constructor(message, layer) {
        super(message);
        this.layer = layer;
        this.name = "GhostBridgeError";
    }
}
exports.GhostBridgeError = GhostBridgeError;
class GhostFailoverExhaustedError extends Error {
    attempts;
    constructor(attempts) {
        super(`All ${attempts} RPC endpoints exhausted`);
        this.attempts = attempts;
        this.name = "GhostFailoverExhaustedError";
    }
}
exports.GhostFailoverExhaustedError = GhostFailoverExhaustedError;
