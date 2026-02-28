import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.ECON_INDEXER_URL || process.env.NEXT_PUBLIC_ECON_INDEXER_URL || "http://localhost:7603";

async function proxy(req: NextRequest, params: { path?: string[] }, method: "GET" | "POST") {
  const targetPath = `/${(params.path || []).join("/")}`;
  const url = `${BASE}${targetPath}`;

  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
    cache: "no-store"
  };

  if (method === "POST") {
    init.body = await req.text();
  }

  const upstream = await fetch(url, init);
  const body = await upstream.text();
  return new NextResponse(body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/json" } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const params = await ctx.params;
  return proxy(req, params, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const params = await ctx.params;
  return proxy(req, params, "POST");
}
