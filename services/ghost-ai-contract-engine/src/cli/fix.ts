#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// GhostChain · ghost-ai-contract-engine CLI — fix

import { scanAll }    from "../scanner.js";
import { fixErrors }  from "../fixer.js";

const scan   = await scanAll();
const fixes  = await fixErrors(scan.errors);

console.log(JSON.stringify({ errorsBefore: scan.errors.length, fixes }, null, 2));
process.exit(0);
