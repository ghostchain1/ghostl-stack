// SPDX-License-Identifier: MIT
// GhostChain · GhostBrain AI Contract Engine — Autonomous Brander
//
// Stamps the GhostBrain brand header block into every non-bridge Solidity
// file that does not already carry it.  Bridge contracts are exempt per
// AGENTS.md policy.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync }          from "node:fs";
import type { Dirent }         from "node:fs";
import { readdir }             from "node:fs/promises";
import { resolve, extname }    from "node:path";
import type { BrandResult }    from "./types.js";
import { BRAND_HEADER, BRIDGE_DIR, SRC_DIRS, EXCLUDE_DIRS } from "./config.js";

// The brand sentinel — if a file already contains this, we skip it
const BRAND_SENTINEL = "GhostBrain AI Contract Evolution System";

// Brand is always inserted right after the SPDX line (or at the top)
export async function brandAll(): Promise<BrandResult[]> {
  const files = await _allSolFiles();
  const results: BrandResult[] = [];

  for (const fp of files) {
    results.push(await _brandFile(fp));
  }

  return results;
}

export async function brandFile(filePath: string): Promise<BrandResult> {
  return _brandFile(filePath);
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function _brandFile(filePath: string): Promise<BrandResult> {
  // Bridge contracts are exempt from branding
  if (filePath.startsWith(BRIDGE_DIR)) {
    return { filePath, branded: false, skipped: true, reason: "bridge contract — exempt from branding" };
  }

  let src: string;
  try { src = await readFile(filePath, "utf8"); }
  catch (e) {
    return { filePath, branded: false, skipped: true, reason: `unreadable: ${String(e)}` };
  }

  // Already branded
  if (src.includes(BRAND_SENTINEL)) {
    return { filePath, branded: false, skipped: true, reason: "already branded" };
  }

  // Find insertion point: after the SPDX line (first line starting with // SPDX-)
  const lines = src.split("\n");
  let insertAfter = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("// SPDX-License-Identifier")) {
      insertAfter = i;
      break;
    }
  }

  let branded: string;
  if (insertAfter >= 0) {
    lines.splice(insertAfter + 1, 0, BRAND_HEADER.trim());
    branded = lines.join("\n");
  } else {
    // No SPDX line found — prepend both
    branded = "// SPDX-License-Identifier: MIT\n" + BRAND_HEADER.trim() + "\n" + src;
  }

  try {
    await writeFile(filePath, branded, "utf8");
    return { filePath, branded: true, skipped: false, reason: "brand header injected" };
  } catch (e) {
    return { filePath, branded: false, skipped: false, reason: `write failed: ${String(e)}` };
  }
}

// ─── File discovery ───────────────────────────────────────────────────────────

async function _allSolFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of SRC_DIRS) {
    if (!existsSync(dir)) continue;
    await _walk(dir, out);
  }
  return out;
}

async function _walk(dir: string, out: string[]): Promise<void> {
  if (EXCLUDE_DIRS.some(e => dir.startsWith(e))) return;
  let entries: Dirent<string>[];
  try { entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' }); } catch { return; }
  for (const ent of entries) {
    const full = resolve(dir, ent.name);
    if (ent.isDirectory()) await _walk(full, out);
    else if (ent.isFile() && extname(ent.name) === ".sol") out.push(full);
  }
}
