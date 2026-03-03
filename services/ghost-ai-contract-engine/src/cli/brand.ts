#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// GhostChain · ghost-ai-contract-engine CLI — brand

import { brandAll } from "../brander.js";

const results = await brandAll();
console.log(JSON.stringify({ branded: results.length, results }, null, 2));
process.exit(0);
