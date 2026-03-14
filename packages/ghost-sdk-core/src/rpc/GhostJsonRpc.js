"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostJsonRpc = void 0;
const GhostRpcTransport_1 = require("./GhostRpcTransport");
const errors_1 = require("../errors");
class GhostJsonRpc {
    id = 1;
    transport;
    constructor(url, options = {}) {
        this.transport = new GhostRpcTransport_1.GhostRpcTransport(url, options);
    }
    async request(method, params = []) {
        const payload = {
            jsonrpc: "2.0",
            id: this.id++,
            method,
            params
        };
        const res = (await this.transport.send(payload));
        if (res.error) {
            throw new errors_1.GhostRpcError(res.error.code, res.error.message, res.error.data);
        }
        return res.result;
    }
}
exports.GhostJsonRpc = GhostJsonRpc;
