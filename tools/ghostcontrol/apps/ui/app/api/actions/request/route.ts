import { NextResponse } from "next/server";

function apiBaseUrl(): string {
  return (
    process.env.GHOSTCONTROL_API_URL ??
    process.env.NEXT_PUBLIC_GHOSTCONTROL_API ??
    "http://localhost:7401"
  );
}

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
  const res = await fetch(`${apiBaseUrl().replace(/\\/+$/, "")}/actions/request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-ghostcontrol-token": token } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, status: res.status, body: text },
      { status: 500 },
    );
  }

  return NextResponse.redirect(new URL("/incidents", req.url));
}

