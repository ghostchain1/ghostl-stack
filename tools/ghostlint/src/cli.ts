#!/usr/bin/env node
// GhostLint CLI — ghostlint scan [dir] [--fix] [--json]
import { GhostLint } from './index.js';

const args = process.argv.slice(2);
const dir   = args.find(a => !a.startsWith('--')) ?? '.';
const json  = args.includes('--json');
const rules = args.includes('--errors-only') ? undefined : undefined;

async function main() {
  const lint = new GhostLint({ rules });
  const report = await lint.scan(dir);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(GhostLint.formatReport(report));
  }

  if (!report.passed) process.exit(1);
}

main().catch(err => { console.error('[GhostLint]', err); process.exit(1); });
