"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const api_client_1 = require("../../../lib/api-client");
async function POST(req) {
    const form = await req.formData();
    const service = String(form.get("service") ?? "");
    const reason = String(form.get("reason") ?? "");
    const payload = {
        requestedBy: "ui",
        reason: reason || undefined,
        riskMode: "SAFE",
        scope: {
            workspaceRoot: "/workspace",
            services: [service],
        },
        requestedActions: [
            {
                kind: "docker.restart_service",
                params: { service },
            },
        ],
    };
    const token = process.env.GHOSTCONTROL_TOKEN;
    let res;
    try {
        res = await (0, api_client_1.fetchWithRetry)(`${(0, api_client_1.apiBaseUrl)().replace(/\/+$/, "")}/actions/request`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(token ? { "x-ghostcontrol-token": token } : {}),
            },
            body: JSON.stringify(payload),
        }, 
        // Keep request submission idempotency-safe: no automatic retries for POST.
        { attempts: 1 });
    }
    catch (error) {
        const code = (0, api_client_1.extractNetworkErrorCode)(error);
        return server_1.NextResponse.json({ ok: false, status: 503, body: code ? `NETWORK_${code}` : "NETWORK_FETCH_FAILED" }, { status: 503 });
    }
    if (!res.ok) {
        const text = await res.text();
        return server_1.NextResponse.json({ ok: false, status: res.status, body: text }, { status: 500 });
    }
    return server_1.NextResponse.redirect(new URL("/incidents", req.url));
}
