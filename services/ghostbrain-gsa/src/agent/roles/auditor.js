/**
 * @file src/agent/roles/auditor.js
 * @description Auditor role: post-execution regression checks.
 * Validates that no constitutional invariant degraded after a change.
 */

import { assertRoutingLaw, assertBrandingLaw } from '../../policy/constraints.js';
import { npmAudit } from '../../tools/audit.js';
import { forgeBuild } from '../../tools/forge.js';
import { config } from '../../config.js';

/**
 * Run all post-execution audit checks.
 * @param {{ repoRoot?: string }} [opts]
 * @returns {Promise<{ ok: boolean, checks: object[] }>}
 */
export async function auditPipeline(opts = {}) {
  const root = opts.repoRoot ?? config.repoRoot;
  const checks = [];

  // 1. npm audit regression check
  const auditResult = await npmAudit({ cwd: root });
  checks.push({
    name: 'supply-chain-audit',
    ok:   auditResult.ok,
    details: auditResult.ok
      ? `no high/critical vulns (${auditResult.findings.length} total)`
      : `HIGH/CRITICAL vulns found: ${auditResult.findings.filter(f => ['high','critical'].includes(f.severity)).map(f => f.name).join(', ')}`,
  });

  // 2. Forge build (if contracts exist)
  const forgeResult = await forgeBuild();
  checks.push({
    name: 'forge-build',
    ok:   forgeResult.ok,
    details: forgeResult.ok ? 'contracts compile clean' : forgeResult.output.slice(0, 300),
  });

  // 3. Routing law invariant (sample check — L3→L1 must be invalid)
  const { L1, L2, L3 } = config.brand.chainIds;
  const badRoute  = assertRoutingLaw(L3, L1);
  const goodRoute = assertRoutingLaw(L3, L2);
  checks.push({
    name: 'routing-law-invariant',
    ok: !badRoute.ok && goodRoute.ok,
    details: !badRoute.ok && goodRoute.ok
      ? `L3→L1 correctly rejected, L3→L2 correctly allowed`
      : `INVARIANT BROKEN: routing law check failed`,
  });

  // 4. Brand law invariant
  const brandBad   = assertBrandingLaw({ symbol: 'ETH' });
  const brandGood  = assertBrandingLaw({ name: 'Ghost', symbol: 'GST', decimals: 18 });
  checks.push({
    name: 'brand-law-invariant',
    ok: !brandBad.ok && brandGood.ok,
    details: !brandBad.ok && brandGood.ok
      ? 'ETH symbol correctly rejected, Ghost/GST/18 correctly accepted'
      : `INVARIANT BROKEN: brand law check failed`,
  });

  const allOk = checks.every(c => c.ok);
  return { ok: allOk, checks };
}
