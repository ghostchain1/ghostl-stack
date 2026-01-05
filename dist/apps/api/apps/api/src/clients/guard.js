"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuardClient = void 0;
const undici_1 = require("undici");
class GuardClient {
    constructor(baseUrl, adminToken) {
        this.baseUrl = baseUrl;
        this.adminToken = adminToken;
    }
    headers() {
        const headers = { 'content-type': 'application/json' };
        if (this.adminToken)
            headers['x-admin-token'] = this.adminToken;
        return headers;
    }
    async listAlerts() {
        const res = await (0, undici_1.fetch)(`${this.baseUrl}/alerts`);
        if (!res.ok)
            throw new Error(`Guard alerts failed: ${res.status}`);
        return res.json();
    }
    async getPolicy() {
        const res = await (0, undici_1.fetch)(`${this.baseUrl}/policy`);
        if (!res.ok)
            throw new Error(`Guard policy failed: ${res.status}`);
        return res.json();
    }
    async setPolicy(path, body) {
        const res = await (0, undici_1.fetch)(`${this.baseUrl}/policy/${path}`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body)
        });
        if (!res.ok)
            throw new Error(`Guard policy write failed: ${res.status}`);
        return res.json();
    }
    async listPolicies() {
        const res = await (0, undici_1.fetch)(`${this.baseUrl}/policy`, { headers: this.headers() });
        if (!res.ok)
            throw new Error(`Guard policy read failed: ${res.status}`);
        return res.json();
    }
}
exports.GuardClient = GuardClient;
