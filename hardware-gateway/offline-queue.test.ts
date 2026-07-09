import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { JsonlOfflineQueue } from "./offline-queue";

test("persists samples and acknowledges only uploaded entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tka-gateway-"));
  const queuePath = join(directory, "queue.jsonl");
  const queue = new JsonlOfflineQueue<{ id: number }>(queuePath);

  try {
    await queue.append({ id: 1 });
    await queue.append({ id: 2 });
    await queue.append({ id: 3 });

    assert.equal(await queue.size(), 3);
    assert.deepEqual(await queue.peek(2), [{ id: 1 }, { id: 2 }]);

    await queue.acknowledge(2);
    assert.equal(await queue.size(), 1);
    assert.deepEqual(await queue.peek(5), [{ id: 3 }]);
    assert.equal((await readFile(queuePath, "utf8")).trim(), '{"id":3}');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
