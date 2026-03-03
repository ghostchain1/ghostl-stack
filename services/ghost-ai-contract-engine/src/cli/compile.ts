#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// GhostChain · ghost-ai-contract-engine CLI — compile

import { compile } from "../compiler.js";

const result = await compile();
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "pass" ? 0 : 1);
