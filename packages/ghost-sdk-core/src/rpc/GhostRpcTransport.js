"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostRpcTransport = void 0;
const errors_1 = require("../errors");
class GhostRpcTransport {
    url;
    timeout;
    constructor(url, options = {}) {
        this.url = url;
        this.timeout = options.timeoutMs ?? 30_000;
    }
    async send(payload) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
            const res = await fetch(this.url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            if (!res.ok) {
                throw new errors_1.GhostNetworkError(`HTTP ${res.status}: ${res.statusText}`);
            }
            return res.json();
        }
        catch (err) {
            if (err.name === "AbortError") {
                throw new errors_1.GhostNetworkError(`RPC request timed out after ${this.timeout}ms`);
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.GhostRpcTransport = GhostRpcTransport;
