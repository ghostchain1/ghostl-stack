import { NextResponse } from "next/server";
import { apiBaseUrl, extractNetworkErrorCode, fetchWithRetry } from "../../../lib/api-client";

export async function POST(req: Request) {
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
  let res: Response;
  try {
    res = await fetchWithRetry(
      `${apiBaseUrl().replace(/\/+$/, "")}/actions/request`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-ghostcontrol-token": token } : {}),
        },
        body: JSON.stringify(payload),
      },
      // Keep request submission idempotency-safe: no automatic retries for POST.
      { attempts: 1 },
    );
  } catch (error) {
    const code = extractNetworkErrorCode(error);
    return NextResponse.json(
      { ok: false, status: 503, body: code ? `NETWORK_${code}` : "NETWORK_FETCH_FAILED" },
      { status: 503 },
    );
  }

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, status: res.status, body: text },
      { status: 500 },
    );
  }

  return NextResponse.redirect(new URL("/incidents", req.url));
}
