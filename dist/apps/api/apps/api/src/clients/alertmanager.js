"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertmanagerClient = void 0;
const undici_1 = require("undici");
class AlertmanagerClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async send(alert) {
        const res = await (0, undici_1.fetch)(`${this.baseUrl}/api/v1/alerts`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify([alert])
        });
        if (!res.ok)
            throw new Error(`Alertmanager send failed: ${res.status}`);
        return res.json();
    }
}
exports.AlertmanagerClient = AlertmanagerClient;
