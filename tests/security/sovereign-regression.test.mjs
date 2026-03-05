/**
 * Sovereign Regression Tests — GhostStack
 *
 * PROPERTIES:
 *   - Deterministic: reads static files only, no network, no randomness
 *   - Hermetic: no external services required
 *   - Fast: all assertions complete <100ms
 *   - Stable in CI: no timing dependencies
 *
 * Run: node --test tests/security/sovereign-regression.test.mjs
 *
 * COVERAGE:
 *   1. Kong admin port not exposed on 0.0.0.0
 *   2. trustForwardHeader not set to true
 *   3. Fail-closed secrets (no insecure defaults in production composes)
 *   4. npm ci enforced (no bare npm install in core compose commands)
 *   5. Database ports bound to loopback in compliance compose
 *   6. AVH REQUIRE_SIGNATURE defaults to 1 (on)
 *   7. AVH DOCKER_ENABLED defaults to 0 (off)
 *   8. AVH HMAC_SECRET has no insecure default
 *   9. Container hardening anchors present in phase3 and sovereign composes
 *  10. No network_mode: host in any compose file
 *  11. CI workflow actions pinned to SHA (not floating tags)
 *  12. Traefik dashboard disabled in prod compose
 *  13. Production keycloak no longer depends_on floating list format
 *  14. Routing law verification script exists and is executable
 *  15. compose-hardening-audit.sh includes all required files
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(import.meta.dirname, "../..");

function read(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(existsSync(full), `Required file not found: ${relPath}`);
  return readFileSync(full, "utf8");
}

function assertNoMatch(content, pattern, message) {
  assert.ok(!pattern.test(content), message);
}

function assertMatch(content, pattern, message) {
  assert.ok(pattern.test(content), message);
}

// ── Test 1: Kong admin must not bind 0.0.0.0 ────────────────────────────────

test("FIND-001 — Kong admin port must not be bound to 0.0.0.0", () => {
  const prodCompose = read("infra/docker/docker-compose.prod.yml");

  // The value should be 127.0.0.1:8001, not 0.0.0.0:8001
  assertNoMatch(
    prodCompose,
    /KONG_ADMIN_LISTEN\s*:\s*["']?0\.0\.0\.0:/,
    "Kong admin API must not be exposed on 0.0.0.0 — binds to all interfaces (privilege escalation vector). Must be 127.0.0.1:8001"
  );

  assertMatch(
    prodCompose,
    /KONG_ADMIN_LISTEN\s*:\s*["']?127\.0\.0\.1:8001/,
    "Kong admin API must be explicitly bound to 127.0.0.1:8001"
  );
});

// ── Test 2: trustForwardHeader must not be true ──────────────────────────────

test("FIND-002 — Traefik forwardauth trustForwardHeader must not be true", () => {
  const prodCompose = read("infra/docker/docker-compose.prod.yml");

  assertNoMatch(
    prodCompose,
    /trustForwardHeader\s*=\s*true/,
    "trustForwardHeader=true allows clients to forge X-Forwarded-For headers, bypassing IP-based controls. Must be false."
  );

  assertMatch(
    prodCompose,
    /trustForwardHeader\s*=\s*false/,
    "trustForwardHeader must be explicitly set to false in prod compose"
  );
});

// ── Test 3: Fail-closed secrets — no insecure defaults in prod composes ───────

const PROD_COMPOSES = [
  "docker-compose.yml",
  "apps/docker-compose.yml",
  "infra/docker/docker-compose.prod.yml",
  "docker-compose.sovereign.yml",
];

const INSECURE_DEFAULT_PATTERN =
  /\$\{[A-Za-z0-9_]+:-?(change-me|ghostpass|changeme|password|admin)[^}]*\}/i;

for (const composeFile of PROD_COMPOSES) {
  test(`FIND-006 — No insecure default secrets in ${composeFile}`, () => {
    if (!existsSync(path.join(ROOT, composeFile))) {
      // File may not exist in all environments; skip gracefully.
      return;
    }
    const content = read(composeFile);
    const lines = content.split("\n");
    const violations = [];

    lines.forEach((line, idx) => {
      if (INSECURE_DEFAULT_PATTERN.test(line) && !line.trimStart().startsWith("#")) {
        violations.push(`  Line ${idx + 1}: ${line.trim()}`);
      }
    });

    assert.equal(
      violations.length,
      0,
      `Insecure secret defaults found in ${composeFile}.\n` +
      `These allow services to start with weak credentials if secrets are not set.\n` +
      `Replace :-<default> with :? to fail closed.\nViolations:\n${violations.join("\n")}`
    );
  });
}

// ── Test 4: npm ci enforced (no bare npm install in core compose commands) ────

test("FIND-005 — Core compose files must use npm ci, not npm install", () => {
  const CORE_COMPOSES = [
    "docker-compose.yml",
    "apps/docker-compose.yml",
  ];

  for (const composeFile of CORE_COMPOSES) {
    if (!existsSync(path.join(ROOT, composeFile))) continue;
    const content = read(composeFile);

    // Detect bare 'npm install' that is NOT 'npm install -g' or global install
    const bareInstallPattern = /npm install(?!\s+-g|\s+--global|\s+packages)/;
    const lines = content.split("\n");
    const violations = lines
      .map((line, idx) => ({ line: line.trim(), num: idx + 1 }))
      .filter(({ line }) => bareInstallPattern.test(line) && !line.startsWith("#"));

    assert.equal(
      violations.length,
      0,
      `Found 'npm install' in ${composeFile}.\n` +
      `'npm install' is non-deterministic and ignores the lockfile.\n` +
      `Replace with 'npm ci' for deterministic, lockfile-enforced installs.\n` +
      `Violations: ${violations.map(v => `L${v.num}: ${v.line}`).join("; ")}`
    );
  }
});

// ── Test 5: Database ports bound to loopback ─────────────────────────────────

test("FIND-010 — Postgres and Redis ports must be bound to 127.0.0.1", () => {
  for (const composeFile of ["docker-compose.yml", "apps/docker-compose.yml"]) {
    if (!existsSync(path.join(ROOT, composeFile))) continue;
    const content = read(composeFile);

    // Check that database ports are NOT published to 0.0.0.0
    assertNoMatch(
      content,
      /^\s{6}-\s+"?5432:5432"?\s*$/m,
      `${composeFile}: postgres port 5432 must be bound to 127.0.0.1:5432, not 0.0.0.0:5432`
    );
    assertNoMatch(
      content,
      /^\s{6}-\s+"?6379:6379"?\s*$/m,
      `${composeFile}: redis port 6379 must be bound to 127.0.0.1:6379, not 0.0.0.0:6379`
    );
  }
});

// ── Test 6: AVH REQUIRE_SIGNATURE defaults to 1 ─────────────────────────────

test("FIND-006b — AVH REQUIRE_SIGNATURE must default to 1 (signatures required)", () => {
  const content = read("docker-compose.autonomy.yml");

  assertNoMatch(
    content,
    /REQUIRE_SIGNATURE:\s*\$\{AVH_REQUIRE_SIGNATURE:-0\}/,
    "AVH REQUIRE_SIGNATURE must not default to 0. Unsigned actions must be rejected by default."
  );

  assertMatch(
    content,
    /REQUIRE_SIGNATURE:\s*\$\{AVH_REQUIRE_SIGNATURE:-1\}/,
    "AVH REQUIRE_SIGNATURE must default to 1 (require signatures on all actions)"
  );
});

// ── Test 7: AVH DOCKER_ENABLED defaults to 0 ────────────────────────────────

test("FIND-004b — AVH DOCKER_ENABLED must default to 0 (disabled)", () => {
  const content = read("docker-compose.autonomy.yml");

  assertNoMatch(
    content,
    /DOCKER_ENABLED:\s*\$\{AVH_DOCKER_ENABLED:-1\}/,
    "AVH DOCKER_ENABLED must not default to 1. Writable docker.sock requires explicit opt-in."
  );

  assertMatch(
    content,
    /DOCKER_ENABLED:\s*\$\{AVH_DOCKER_ENABLED:-0\}/,
    "AVH DOCKER_ENABLED must default to 0 (disabled — writable socket requires explicit approval)"
  );
});

// ── Test 8: AVH HMAC_SECRET has no insecure default ─────────────────────────

test("FIND-006c — AVH HMAC_SECRET must have no insecure default", () => {
  const content = read("docker-compose.autonomy.yml");

  assertNoMatch(
    content,
    /HMAC_SECRET:\s*\$\{AVH_HMAC_SECRET:-change-me/,
    "AVH HMAC_SECRET must not have an insecure default. Must use :? to fail closed."
  );

  assertMatch(
    content,
    /HMAC_SECRET:\s*\$\{AVH_HMAC_SECRET:?/,
    "AVH HMAC_SECRET must require an explicit value (:? fail-closed syntax)"
  );
});

// ── Test 9: Container hardening anchors present ──────────────────────────────

test("FIND-007 — docker-compose.phase3.yml must have hardening anchor with cap_drop", () => {
  const content = read("docker-compose.phase3.yml");
  assertMatch(content, /cap_drop:/, "docker-compose.phase3.yml must have cap_drop hardening");
  assertMatch(content, /no-new-privileges:true/, "docker-compose.phase3.yml must have no-new-privileges:true");
});

test("FIND-007 — docker-compose.sovereign.yml must have hardening anchor with cap_drop", () => {
  const content = read("docker-compose.sovereign.yml");
  assertMatch(content, /cap_drop:/, "docker-compose.sovereign.yml must have cap_drop hardening");
  assertMatch(content, /no-new-privileges:true/, "docker-compose.sovereign.yml must have no-new-privileges:true");
});

test("FIND-007 — infra/docker/docker-compose.prod.yml must have hardening anchor", () => {
  const content = read("infra/docker/docker-compose.prod.yml");
  assertMatch(content, /cap_drop:/, "prod compose must have cap_drop hardening");
  assertMatch(content, /no-new-privileges:true/, "prod compose must have no-new-privileges:true");
  assertMatch(content, /read_only:\s*true/, "prod compose must have read_only: true");
});

// ── Test 10: No network_mode: host ────────────────────────────────────────────

test("FIND-security — No service uses network_mode: host in production composes", () => {
  for (const composeFile of PROD_COMPOSES) {
    if (!existsSync(path.join(ROOT, composeFile))) continue;
    const content = read(composeFile);
    assertNoMatch(
      content,
      /^\s*network_mode:\s*host\s*$/m,
      `${composeFile}: network_mode: host bypasses all container network segmentation`
    );
  }
});

// ── Test 11: CI workflow actions pinned to SHA ────────────────────────────────

test("FIND-CI — GitHub Actions must use SHA-pinned action refs, not floating tags", () => {
  const CI_WORKFLOWS = [
    ".github/workflows/ci.yml",
    ".github/workflows/supply-chain-security.yml",
    ".github/workflows/nightly-security.yml",
    ".github/workflows/policy-gate.yml",
    ".github/workflows/atomic-ci.yml",
  ];

  for (const workflow of CI_WORKFLOWS) {
    if (!existsSync(path.join(ROOT, workflow))) continue;
    const content = read(workflow);
    const lines = content.split("\n");

    // Find 'uses: owner/repo@ref' lines where ref is NOT a 40-char hex SHA
    const violations = lines
      .map((line, idx) => ({ line: line.trim(), num: idx + 1 }))
      .filter(({ line }) => {
        if (!line.startsWith("uses:")) return false;
        const match = line.match(/uses:\s+[^@]+@([^\s#]+)/);
        if (!match) return false;
        const ref = match[1];
        // A valid pinned SHA is exactly 40 hex chars
        return !/^[0-9a-f]{40}$/i.test(ref);
      });

    assert.equal(
      violations.length,
      0,
      `Floating action tags in ${workflow} — supply chain risk.\n` +
      `Pin all 'uses:' to full 40-char SHA hashes.\n` +
      `Violations: ${violations.map(v => `L${v.num}: ${v.line}`).join("; ")}`
    );
  }
});

// ── Test 12: Traefik dashboard disabled in prod compose ──────────────────────

test("FIND-security — Traefik API dashboard must be disabled in prod compose", () => {
  const content = read("infra/docker/docker-compose.prod.yml");
  assertMatch(
    content,
    /--api\.dashboard=false/,
    "Traefik API dashboard must be explicitly disabled (--api.dashboard=false) in prod"
  );
  assertMatch(
    content,
    /--api\.insecure=false/,
    "Traefik insecure API must be explicitly disabled (--api.insecure=false) in prod"
  );
});

// ── Test 13: Keycloak depends_on with health condition ───────────────────────

test("FIND-stability — Keycloak must declare depends_on kc-postgres with health condition", () => {
  const content = read("infra/docker/docker-compose.prod.yml");

  assertMatch(
    content,
    /kc-postgres:\s*\n\s+condition:\s*service_healthy/,
    "Keycloak must depend on kc-postgres with `condition: service_healthy` to prevent startup races"
  );
});

// ── Test 14: Routing law verification script exists ──────────────────────────

test("FIND-governance — scripts/verify-routing.sh must exist", () => {
  const fullPath = path.join(ROOT, "scripts/verify-routing.sh");
  assert.ok(existsSync(fullPath), "scripts/verify-routing.sh is required for routing law enforcement");
  const stat = statSync(fullPath);
  // File must be non-empty
  assert.ok(stat.size > 0, "scripts/verify-routing.sh must not be empty");
});

// ── Test 15: compose-hardening-audit.sh includes all required files ──────────

test("FIND-009 — compose-hardening-audit.sh must include all critical compose files", () => {
  const content = read("scripts/security/compose-hardening-audit.sh");

  const REQUIRED_FILES = [
    "docker-compose.phase3.yml",
    "docker-compose.sovereign.yml",
    "docker-compose.ghostbrain.yml",
    "docker-compose.cascading-finality.yml",
    "infra/docker/docker-compose.prod.yml",
  ];

  for (const required of REQUIRED_FILES) {
    assert.ok(
      content.includes(required),
      `compose-hardening-audit.sh must include '${required}' in its scan scope`
    );
  }
});

// ── Test 16: Malformed JWT / oversized token defense (config assertions) ──────

test("FIND-security — JWT_SECRET must not use :- fallback in production composes", () => {
  for (const composeFile of PROD_COMPOSES) {
    if (!existsSync(path.join(ROOT, composeFile))) continue;
    const content = read(composeFile);
    const lines = content.split("\n");

    const violations = lines
      .map((line, idx) => ({ line: line.trim(), num: idx + 1 }))
      .filter(({ line }) =>
        /JWT_SECRET\s*:\s*\$\{[^}]+:-/.test(line) && !line.startsWith("#")
      );

    assert.equal(
      violations.length,
      0,
      `JWT_SECRET with insecure :- default in ${composeFile}.\n` +
      `A JWT secret must be explicitly set; use :? to fail closed.\n` +
      `Violations: ${violations.map(v => `L${v.num}: ${v.line}`).join("; ")}`
    );
  }
});

// ── Test 17: Sovereign services bound to 127.0.0.1 host ports ────────────────

test("FIND-security — Sovereign service host ports must be bound to 127.0.0.1", () => {
  const content = read("docker-compose.sovereign.yml");

  // Check that service ports like 7681:7681 appear as 127.0.0.1:xxxx:xxxx
  const rawPortBindings = content.match(/^\s+-\s+"[0-9]+:[0-9]+"\s*$/mg) || [];
  assert.equal(
    rawPortBindings.length,
    0,
    `docker-compose.sovereign.yml has unbound host ports (0.0.0.0).\n` +
    `All sovereign service ports must be bound to 127.0.0.1.\n` +
    `Found: ${rawPortBindings.join(", ")}`
  );
});

// ── Test 18: Ghostbrain postgres has no insecure default ─────────────────────

test("FIND-006d — docker-compose.ghostbrain.yml must not have insecure postgres default", () => {
  const content = read("docker-compose.ghostbrain.yml");
  assertNoMatch(
    content,
    /GHOSTBRAIN_POSTGRES_PASSWORD:-ghostbrain_dev_pw/,
    "GhostBrain postgres must not use an insecure default password. Use :? to fail closed."
  );
});

// ── Test 19: No privileged: true in any compose file ─────────────────────────

test("FIND-security — No service must run with privileged: true", () => {
  const ALL_CORE_COMPOSES = [
    "docker-compose.yml",
    "docker-compose.sovereign.yml",
    "docker-compose.phase3.yml",
    "docker-compose.autonomy.yml",
    "apps/docker-compose.yml",
    "infra/docker/docker-compose.prod.yml",
  ];

  for (const composeFile of ALL_CORE_COMPOSES) {
    if (!existsSync(path.join(ROOT, composeFile))) continue;
    const content = read(composeFile);
    assertNoMatch(
      content,
      /^\s*privileged:\s*true\s*$/m,
      `${composeFile}: 'privileged: true' grants full host access — sovereign violation`
    );
  }
});

// ── Test 20: policy-gate.yml and atomic-ci.yml exist ─────────────────────────

test("FIND-CI — Sovereign CI workflows must exist", () => {
  const REQUIRED_WORKFLOWS = [
    ".github/workflows/policy-gate.yml",
    ".github/workflows/atomic-ci.yml",
    ".github/workflows/supply-chain-security.yml",
    ".github/workflows/nightly-security.yml",
  ];

  for (const workflow of REQUIRED_WORKFLOWS) {
    const full = path.join(ROOT, workflow);
    assert.ok(existsSync(full), `Required sovereign workflow missing: ${workflow}`);
    const content = readFileSync(full, "utf8");
    assert.ok(content.length > 100, `Workflow ${workflow} appears to be empty or stub`);
  }
});
