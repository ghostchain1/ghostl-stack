import { NextResponse } from "next/server";

const AIOPS = process.env.NEXT_PUBLIC_AIOPS_URL ?? "http://localhost:9988";

export async function GET() {
  try {
    const [summaryRes, predictionsRes, anomaliesRes, incidentsRes, scalingRes] = await Promise.all([
      fetch(`${AIOPS}/summary`,     { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${AIOPS}/predictions`, { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${AIOPS}/anomalies`,   { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${AIOPS}/incidents`,   { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${AIOPS}/scaling`,     { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
    ]);

    const [summary, predictions, anomalies, incidents, scaling] = await Promise.all([
      summaryRes.ok     ? summaryRes.json()     as Promise<unknown> : Promise.resolve(null),
      predictionsRes.ok ? predictionsRes.json() as Promise<unknown> : Promise.resolve(null),
      anomaliesRes.ok   ? anomaliesRes.json()   as Promise<unknown> : Promise.resolve(null),
      incidentsRes.ok   ? incidentsRes.json()   as Promise<unknown> : Promise.resolve(null),
      scalingRes.ok     ? scalingRes.json()     as Promise<unknown> : Promise.resolve(null),
    ]);

    return NextResponse.json({ summary, predictions, anomalies, incidents, scaling, timestamp: Date.now() });
  } catch {
    return NextResponse.json(
      { error: "AIOps service offline (port 9988)", timestamp: Date.now() },
      { status: 503 },
    );
  }
}
