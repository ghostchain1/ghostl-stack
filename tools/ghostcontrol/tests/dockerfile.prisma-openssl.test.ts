import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dockerfilePath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/apps/api/Dockerfile",
);

test("api build-stage installs openssl for prisma migrate runtime detection", () => {
  const dockerfile = readFileSync(dockerfilePath, "utf8");
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS build/);
  assert.match(
    dockerfile,
    /apt-get install -y --no-install-recommends openssl ca-certificates/,
  );
});
