import { NextResponse } from "next/server";

const GAAN = process.env.NEXT_PUBLIC_GAAN_URL ?? "http://localhost:9981";

export async function GET() {
  try {
    const [summaryRes, agentsRes, decisionsRes, tasksRes, messagesRes, networkRes] = await Promise.all([
      fetch(`${GAAN}/summary`,   { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${GAAN}/agents`,    { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${GAAN}/decisions`, { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${GAAN}/tasks`,     { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${GAAN}/messages`,  { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${GAAN}/network`,   { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
    ]);

    const [summary, agents, decisions, tasks, messages, network] = await Promise.all([
      summaryRes.ok   ? (summaryRes.json()   as Promise<unknown>) : Promise.resolve(null),
      agentsRes.ok    ? (agentsRes.json()    as Promise<unknown>) : Promise.resolve(null),
      decisionsRes.ok ? (decisionsRes.json() as Promise<unknown>) : Promise.resolve(null),
      tasksRes.ok     ? (tasksRes.json()     as Promise<unknown>) : Promise.resolve(null),
      messagesRes.ok  ? (messagesRes.json()  as Promise<unknown>) : Promise.resolve(null),
      networkRes.ok   ? (networkRes.json()   as Promise<unknown>) : Promise.resolve(null),
    ]);

    return NextResponse.json({ summary, agents, decisions, tasks, messages, network, timestamp: Date.now() });
  } catch {
    return NextResponse.json(
      { error: "GAAN service offline (port 9981)", timestamp: Date.now() },
      { status: 503 },
    );
  }
}
