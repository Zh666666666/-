import assert from "node:assert/strict";
import test from "node:test";

import { isJsonWithinBytes } from "./request-limits";

test("accepts normal sensor metadata and rejects oversized JSON", () => {
  assert.equal(isJsonWithinBytes({ captureSequence: 1, device: "BT50" }, 128), true);
  assert.equal(isJsonWithinBytes({ payload: "x".repeat(256) }, 128), false);
});
