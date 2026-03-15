import { NextResponse } from "next/server";

const GCL = process.env.NEXT_PUBLIC_GCL_URL ?? "http://localhost:9989";

export async function GET() {
  try {
    const [summaryRes, insightsRes, patternsRes, strategiesRes, decisionsRes, knowledgeRes] =
      await Promise.all([
        fetch(`${GCL}/summary`,    { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
        fetch(`${GCL}/insights`,   { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
        fetch(`${GCL}/patterns`,   { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
        fetch(`${GCL}/strategies`, { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
        fetch(`${GCL}/decisions`,  { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
        fetch(`${GCL}/knowledge/stats`, { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      ]);

    const [summary, insights, patterns, strategies, decisions, knowledgeStats]: unknown[] =
      await Promise.all([
        summaryRes.ok       ? (summaryRes.json()       as Promise<unknown>) : Promise.resolve(null),
        insightsRes.ok      ? (insightsRes.json()      as Promise<unknown>) : Promise.resolve(null),
        patternsRes.ok      ? (patternsRes.json()      as Promise<unknown>) : Promise.resolve(null),
        strategiesRes.ok    ? (strategiesRes.json()    as Promise<unknown>) : Promise.resolve(null),
        decisionsRes.ok     ? (decisionsRes.json()     as Promise<unknown>) : Promise.resolve(null),
        knowledgeRes.ok     ? (knowledgeRes.json()     as Promise<unknown>) : Promise.resolve(null),
      ]);

    return NextResponse.json({
      summary,
      insights,
      patterns,
      strategies,
      decisions,
      knowledgeStats,
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json(
      { error: "GhostBrain Cognitive Layer offline (port 9989)", timestamp: Date.now() },
      { status: 503 },
    );
  }
}
