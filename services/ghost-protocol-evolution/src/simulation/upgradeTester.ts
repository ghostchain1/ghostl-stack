// upgradeTester — runs the proposed protocol change against a GhostBrain
// sandbox environment before a governance proposal is submitted.
// Returns false (blocking the proposal) unless the sandbox test passes.
import type { SimulationResult } from '../types.js';
import { RULES } from '../config/evolutionRules.js';

interface SandboxTestResponse {
  passed: boolean;
  details?: string;
  testId?: string;
  errorCode?: string;
}

export async function testUpgrade(sim: SimulationResult): Promise<boolean> {
  let sandboxResult: SandboxTestResponse | null = null;

  try {
    const resp = await fetch(`${RULES.ghostbrainUrl}/simulation/sandbox-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulationId: sim.simulationId,
        proposedChange: sim.proposedChange,
        analysisType: sim.analysis.type,
        riskLevel: sim.riskLevel,
      }),
      signal: AbortSignal.timeout(30_000),   // sandbox tests may take longer
    });

    if (resp.ok) {
      sandboxResult = await resp.json() as SandboxTestResponse;
    } else {
      console.warn(`[upgradeTester] sandbox-test returned ${resp.status} — blocking proposal`);
      return false;
    }
  } catch (err) {
    // Sandbox unreachable → fail closed: do not propose untested upgrades
    console.warn('[upgradeTester] sandbox API unreachable — blocking proposal (fail closed):', (err as Error).message);
    return false;
  }

  if (!sandboxResult.passed) {
    console.warn(`[upgradeTester] sandbox test failed — ${sandboxResult.details ?? sandboxResult.errorCode ?? 'no detail'}`);
    return false;
  }

  console.info(`[upgradeTester] sandbox test passed (id=${sandboxResult.testId ?? sim.simulationId})`);
  return true;
}
