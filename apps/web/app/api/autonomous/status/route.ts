/**
 * /api/autonomous/status
 *
 * Proxies the ghostbrain-autonomous health/status endpoint so the web
 * UI can display the engine's proposal queue and statistics without
 * needing direct service access.
 *
 * GET  /api/autonomous/status — engine status + recent proposals
 */

import { NextResponse } from "next/server";

const AUTONOMOUS_URL =
  process.env.GHOSTAUTO_INTERNAL_URL ??
  process.env.GHOSTBRAIN_AUTONOMOUS_URL ??
  "http://localhost:7921";

export async function GET() {
  try {
    const r = await fetch(`${AUTONOMOUS_URL}/status`, {
      signal:      AbortSignal.timeout(6_000),
      next:        { revalidate: 0 },
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: `autonomous engine returned ${r.status}` },
        { status: 502 },
      );
    }

    const data = await r.json();
    return NextResponse.json(data);
  } catch {
    // Service is offline — return a zero-state so the UI degrades gracefully
    return NextResponse.json({
      cycleCount:      0,
      proposalsSent:   0,
      proposalsFailed: 0,
      proposalsDryRun: 0,
      lastCycleAt:     null,
      strategy:        null,
      recentProposals: [],
      _offline:        true,
    });
  }
}
