import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NonceStore } from "../src/nonceStore.js";

const TEST_ADDRESS = "0x1000000000000000000000000000000000000001";

test("NonceStore persists nonces across reloads", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ghost-ai-attestor-"));
  const filePath = path.join(dir, "nonces.json");

  const store1 = await NonceStore.create(filePath);
  await store1.set(TEST_ADDRESS, 5n);

  const store2 = await NonceStore.create(filePath);
  assert.equal(store2.get(TEST_ADDRESS), 5n);

  const reserved = await store2.reserveNextNonce(TEST_ADDRESS, 5n);
  assert.equal(reserved, 6n);

  const store3 = await NonceStore.create(filePath);
  assert.equal(store3.get(TEST_ADDRESS), 6n);
});

