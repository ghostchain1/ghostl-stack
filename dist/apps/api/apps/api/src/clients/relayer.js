"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayerClient = void 0;
const undici_1 = require("undici");
class RelayerClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async health() {
        const res = await (0, undici_1.fetch)(`${this.baseUrl}/health`);
        if (!res.ok)
            throw new Error(`Relayer health failed: ${res.status}`);
        return res.json();
    }
}
exports.RelayerClient = RelayerClient;
