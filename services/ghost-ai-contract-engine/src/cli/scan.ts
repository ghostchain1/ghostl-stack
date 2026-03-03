#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// GhostChain · ghost-ai-contract-engine CLI — scan

import { scanAll } from "../scanner.js";

const result = await scanAll();
console.log(JSON.stringify(result, null, 2));
process.exit(result.errors.length > 0 ? 1 : 0);
