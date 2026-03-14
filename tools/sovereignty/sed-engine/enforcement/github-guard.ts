/**
 * @file tools/sovereignty/sed-engine/enforcement/github-guard.ts
 * @description Posts inline pull-request review annotations to GitHub for each
 *   sovereignty violation found in the changed files of a PR.
 *
 * Designed to run in CI after ci-firewall.ts:
 *   node --experimental-strip-types .../github-guard.ts
 *
 * Required environment variables:
 *   GITHUB_TOKEN       — Personal access token or ${{ secrets.GITHUB_TOKEN }}
 *   GITHUB_REPOSITORY  — "owner/repo"
 *   GITHUB_SHA         — Commit SHA of the PR head
 *   GITHUB_PR_NUMBER   — Pull request number (set by GitHub Actions)
 *   REPO_ROOT          — Optional override for the repo root path
 */

import https           from "node:https";
import path            from "node:path";
import { execSync }    from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanFile }    from "../scanner/repo-scanner.ts";
import type { Finding } from "../scanner/repo-scanner.ts";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = process.env["REPO_ROOT"] ?? path.resolve(__dirname, "../../../../..");

// ── GitHub config ─────────────────────────────────────────────────────────────

const GITHUB_TOKEN      = process.env["GITHUB_TOKEN"];
const GITHUB_REPOSITORY = process.env["GITHUB_REPOSITORY"];   // "owner/repo"
const GITHUB_PR_NUMBER  = process.env["GITHUB_PR_NUMBER"] ?? process.env["PR_NUMBER"];
const GITHUB_SHA        = process.env["GITHUB_SHA"];

if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_PR_NUMBER || !GITHUB_SHA) {
  console.warn("github-guard: Missing required environment variables — skipping annotations.");
  process.exit(0);
}

const [owner, repo] = GITHUB_REPOSITORY.split("/");
const PR_NUMBER     = Number(GITHUB_PR_NUMBER);

// ── Changed files (from git diff) ────────────────────────────────────────────

function getChangedFiles(): string[] {
  try {
    const base = execSync("git merge-base HEAD origin/main", { cwd: REPO_ROOT })
      .toString().trim();
    const out  = execSync(`git diff --name-only ${base} HEAD`, { cwd: REPO_ROOT })
      .toString();
    return out.split("\n").map(l => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ── GitHub API helper ─────────────────────────────────────────────────────────

function githubPost(urlPath: string, body: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const json  = JSON.stringify(body);
    const opts  = {
      hostname: "api.github.com",
      path:     urlPath,
      method:   "POST",
      headers:  {
        "Content-Type":  "application/json",
        "Content-Length": Buffer.byteLength(json),
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "User-Agent":    "GhostStack-SED-Engine/1.0",
        "Accept":        "application/vnd.github.v3+json",
      },
    };

    const req = https.request(opts, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
        } else {
          resolve();
        }
      });
    });

    req.on("error", reject);
    req.write(json);
    req.end();
  });
}

// ── PR Review comments ────────────────────────────────────────────────────────

interface ReviewComment {
  path:     string;  // repo-relative file path
  line:     number;
  side:     "RIGHT";
  body:     string;
}

function findingToComment(finding: Finding, repoRelPath: string): ReviewComment {
  return {
    path: repoRelPath,
    line: finding.line || 1,
    side: "RIGHT",
    body: [
      `**⚡ SED-Engine Sovereignty Violation** \`[${finding.severity}]\``,
      "",
      `**Detected:** \`${finding.match}\``,
      `**Fix:** ${finding.suggestion}`,
      finding.context ? `**Context:** ${finding.context}` : "",
    ].filter(Boolean).join("\n"),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SCANNABLE = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sol"]);
const BLOCKING  = new Set(["CRITICAL", "HIGH"]);

const changedFiles = getChangedFiles();
const toScan = changedFiles
  .filter(f => SCANNABLE.has(path.extname(f)))
  .map(f => ({ rel: f, abs: path.join(REPO_ROOT, f) }))
  .filter(({ rel }) => !rel.startsWith("node_modules/"));

const comments: ReviewComment[] = [];

for (const { rel, abs } of toScan) {
  let findings: Finding[];
  try {
    findings = scanFile(abs);
  } catch {
    continue;
  }

  for (const f of findings) {
    if (BLOCKING.has(f.severity)) {
      comments.push(findingToComment(f, rel));
    }
  }
}

if (comments.length === 0) {
  console.log("github-guard: No blocking violations found — no annotations posted.");
  process.exit(0);
}

// Post as a single PR review (groups all comments in one review)
const reviewBody = {
  commit_id: GITHUB_SHA,
  body:      `## ⚡ GhostStack Sovereignty Check\n\n${comments.length} Ethereum dependency violation(s) were detected. Resolve before merging.`,
  event:     "REQUEST_CHANGES",
  comments,
};

try {
  await githubPost(`/repos/${owner}/${repo}/pulls/${PR_NUMBER}/reviews`, reviewBody);
  console.log(`github-guard: Posted ${comments.length} annotation(s) on PR #${PR_NUMBER}.`);
} catch (err) {
  console.error("github-guard: Failed to post PR review:", err);
  process.exit(2);
}
