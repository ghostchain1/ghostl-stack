#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const outPath = process.argv[2] || path.join(process.cwd(), 'docs', 'sovereign-economy-simulation.md');

const scenarios = [
  {
    id: 'S1',
    name: 'Low volume L3',
    inputs: { l3RevenueWei: 50_000_000_000_000_000n, l2FeeBps: 250, externalYieldBps: 420, lossBps: 0, governanceApproved: true }
  },
  {
    id: 'S2',
    name: 'High congestion',
    inputs: { l3RevenueWei: 900_000_000_000_000_000n, l2FeeBps: 300, externalYieldBps: 710, lossBps: 20, governanceApproved: true }
  },
  {
    id: 'S3',
    name: 'Yield loss scenario',
    inputs: { l3RevenueWei: 700_000_000_000_000_000n, l2FeeBps: 250, externalYieldBps: 100, lossBps: 450, governanceApproved: true }
  },
  {
    id: 'S4',
    name: 'Treasury drawdown event',
    inputs: { l3RevenueWei: 400_000_000_000_000_000n, l2FeeBps: 250, externalYieldBps: 280, lossBps: 1200, governanceApproved: true }
  },
  {
    id: 'S5',
    name: 'Governance rejection case',
    inputs: { l3RevenueWei: 650_000_000_000_000_000n, l2FeeBps: 250, externalYieldBps: 640, lossBps: 0, governanceApproved: false }
  }
];

const toEth = (wei) => Number(wei) / 1e18;
const pct = (bps) => `${(bps / 100).toFixed(2)}%`;

const simulate = (scenario) => {
  const { l3RevenueWei, l2FeeBps, externalYieldBps, lossBps, governanceApproved } = scenario.inputs;

  const l2OpsFeeWei = (l3RevenueWei * BigInt(l2FeeBps)) / 10_000n;
  const l1NetWei = l3RevenueWei - l2OpsFeeWei;

  const allocatableWei = governanceApproved ? l1NetWei : 0n;
  const grossYieldWei = (allocatableWei * BigInt(externalYieldBps)) / 10_000n;
  const lossesWei = (allocatableWei * BigInt(lossBps)) / 10_000n;
  const netYieldWei = grossYieldWei > lossesWei ? grossYieldWei - lossesWei : 0n;

  const reserveWei = (netYieldWei * 2000n) / 10_000n;
  const validatorWei = (netYieldWei * 3000n) / 10_000n;
  const ecosystemWei = (netYieldWei * 3000n) / 10_000n;
  const l2l3Wei = (netYieldWei * 2000n) / 10_000n;

  return {
    l2OpsFeeWei,
    l1NetWei,
    allocatableWei,
    grossYieldWei,
    lossesWei,
    netYieldWei,
    reserveWei,
    validatorWei,
    ecosystemWei,
    l2l3Wei,
    governanceApproved
  };
};

const rows = scenarios.map((scenario) => ({
  scenario,
  result: simulate(scenario)
}));

const summary = rows.map(({ scenario, result }) => {
  const status = result.governanceApproved ? (result.netYieldWei > 0n ? 'PASS' : 'WARN') : 'EXPECTED_BLOCK';
  return `| ${scenario.id} | ${scenario.name} | ${status} | ${toEth(result.l1NetWei).toFixed(4)} | ${toEth(result.netYieldWei).toFixed(4)} | ${toEth(result.l2l3Wei).toFixed(4)} |`;
});

const detailed = rows
  .map(({ scenario, result }) => {
    return [
      `### ${scenario.id} — ${scenario.name}`,
      `- Governance approved: ${result.governanceApproved}`,
      `- L3 captured revenue: ${toEth(scenario.inputs.l3RevenueWei).toFixed(6)} GST`,
      `- L2 operations fee: ${pct(scenario.inputs.l2FeeBps)} (${toEth(result.l2OpsFeeWei).toFixed(6)} GST)`,
      `- L1 net treasury intake: ${toEth(result.l1NetWei).toFixed(6)} GST`,
      `- External gross yield: ${pct(scenario.inputs.externalYieldBps)} (${toEth(result.grossYieldWei).toFixed(6)} GST)`,
      `- Stress losses: ${pct(scenario.inputs.lossBps)} (${toEth(result.lossesWei).toFixed(6)} GST)`,
      `- Net yield: ${toEth(result.netYieldWei).toFixed(6)} GST`,
      `- Distribution (reserve/validator/ecosystem/L2-L3): ${toEth(result.reserveWei).toFixed(6)} / ${toEth(result.validatorWei).toFixed(6)} / ${toEth(result.ecosystemWei).toFixed(6)} / ${toEth(result.l2l3Wei).toFixed(6)} GST`
    ].join('\n');
  })
  .join('\n\n');

const generatedAt = new Date().toISOString();
const markdown = `# Sovereign Economy Simulation\n\nGenerated at: ${generatedAt}\n\n## Scenario Matrix\n\n| Scenario | Name | Outcome | L1 Net Intake (GST) | Net Yield (GST) | L2/L3 Incentives (GST) |\n|---|---|---|---:|---:|---:|\n${summary.join('\n')}\n\n## Details\n\n${detailed}\n\n## Notes\n\n- Routing constraints assumed: L3 -> L2 -> L1 only.\n- Governance rejection blocks allocation (allocatableWei = 0).\n- Yield redistribution follows fixed split 20/30/30/20 (reserve/validator/ecosystem/L2-L3).\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, markdown);
console.log(JSON.stringify({ ok: true, outPath, generatedAt }, null, 2));
