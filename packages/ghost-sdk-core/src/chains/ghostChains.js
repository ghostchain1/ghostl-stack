"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostChains = void 0;
exports.GhostChains = {
    L1: {
        name: "GhostChain",
        chainId: 14000101,
        rpc: "http://localhost:18545",
        fallbackRpcs: []
    },
    L2: {
        name: "GhostL2",
        chainId: 901,
        rpc: "http://localhost:29547",
        fallbackRpcs: []
    },
    L3: {
        name: "GhostL3",
        chainId: 903,
        rpc: "http://localhost:39545",
        fallbackRpcs: []
    }
};
