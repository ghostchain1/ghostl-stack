import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const composePath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/infra/compose/docker-compose.yml",
);

test("compose enforces DB migration completion before DB-dependent services", () => {
  const compose = readFileSync(composePath, "utf8");

  assert.match(compose, /ghostcontrol-db-migrate:/);
  assert.match(
    compose,
    /ghostcontrol-db-migrate:\n[\s\S]*\/app\/packages\/db\/node_modules\/\.bin\/prisma/,
  );

  assert.match(
    compose,
    /ghostcontrol-api:\n[\s\S]*ghostcontrol-db-migrate:\n[\s]*condition: service_completed_successfully/,
  );
  assert.match(
    compose,
    /ghostcontrol-ingest:\n[\s\S]*ghostcontrol-db-migrate:\n[\s]*condition: service_completed_successfully/,
  );
  assert.match(
    compose,
    /ghostcontrol-planner:\n[\s\S]*ghostcontrol-db-migrate:\n[\s]*condition: service_completed_successfully/,
  );
});
