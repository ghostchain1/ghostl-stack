#!/usr/bin/env node
/**
 * GhostStack Branding Scanner — enforces Ghost-native naming across the entire repo.
 * Fails with exit code 1 if any banned Ethereum/ethers reference is found.
 *
 * Usage: node services/ghost-branding/scan.js [--dir <path>]
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const BANNED = [
  "ethereum",
  "ethers",
  " eth_",      // RPC method prefix (space-prefixed to avoid false positive in "method")
  "\"eth_",     // JSON string method names
  "'eth_",
  "`eth_",
  /\bweb3\b/,
  /\bwei\b/i,
  /\bgwei\b/i,
  /\bERC20\b/,
  /\bERC721\b/,
  /\bERC1155\b/,
];

// Files / dirs to skip entirely
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
const SKIP_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".lock", ".map", ".wasm"]);

// Paths that are explicitly allowed to contain these words (e.g. branding docs)
const ALLOWLIST_PATHS = [
  "services/ghost-branding/scan.js",
  "services/ghost-branding/branding-scanner.js",
  "services/ghost-branding/solidity-ast-validator.ts",
  "packages/ghost-registry/src/index.ts",   // contains GhostBrandMap
];

let violations = 0;

function isAllowlisted(filePath) {
  const rel = filePath.replace(/\\/g, "/");
  return ALLOWLIST_PATHS.some(p => rel.endsWith(p));
}

function check(filePath) {
  if (isAllowlisted(filePath)) return;

  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (_) {
    return; // binary / unreadable
  }

  const lines = text.split("\n");
  lines.forEach((line, i) => {
    BANNED.forEach(b => {
      const hit = b instanceof RegExp ? b.test(line) : line.toLowerCase().includes(typeof b === "string" ? b.toLowerCase() : b);
      if (hit) {
        console.error(`[BRAND VIOLATION] ${filePath}:${i + 1}  →  ${JSON.stringify(line.trim())}`);
        console.error(`  Matched: ${b instanceof RegExp ? b.source : b}`);
        violations++;
      }
    });
  });
}

function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) scan(fullPath);
    } else if (entry.isFile()) {
      if (!SKIP_EXTS.has(path.extname(entry.name))) check(fullPath);
    }
  }
}

const targetDir = process.argv[3] ?? process.argv[2] ?? process.cwd();
console.log(`GhostStack Branding Scanner — scanning: ${targetDir}\n`);
scan(targetDir);

if (violations > 0) {
  console.error(`\n[FAILED] ${violations} branding violation(s) found. Fix before committing.`);
  process.exit(1);
} else {
  console.log("[PASSED] No branding violations found. GhostStack is sovereign.");
}
