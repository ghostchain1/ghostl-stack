import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { withDockerAccess } from "../deploy/docker_access.ts";

test("wraps docker command with dynamic socket group and docker fallback", () => {
  const wrapped = withDockerAccess("docker ps --format '{{.Names}}'");
  assert.match(wrapped, /GHOST_DOCKER_SOCKET_GROUP=\"\"/);
  assert.match(wrapped, /stat -c '%G' \/var\/run\/docker\.sock/);
  assert.match(
    wrapped,
    /GHOST_DOCKER_GROUP_CANDIDATE=\$\{DOCKER_SOCKET_GROUP:-\$\{GHOST_DOCKER_SOCKET_GROUP:-\$\{GHOST_DOCKER_GROUP:-\}\}\}/,
  );
  assert.match(wrapped, /sg \"\$GHOST_DOCKER_GROUP_CANDIDATE\" -c/);
  assert.match(wrapped, /sg docker -c/);
  assert.match(wrapped, /docker ps --format/);
});

test("generated wrapper has valid shell syntax", () => {
  const wrapped = withDockerAccess("docker ps");
  const parsed = spawnSync("bash", ["-n", "-c", wrapped], {
    encoding: "utf8",
  });

  const parseOutput = [parsed.stdout, parsed.stderr].filter(Boolean).join("\n");
  assert.equal(parsed.status, 0, parseOutput || "shell parse failed");
});
