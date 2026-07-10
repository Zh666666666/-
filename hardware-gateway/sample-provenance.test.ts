import assert from "node:assert/strict";
import test from "node:test";

import { isSimulatedSource, resolveSensorDataSource } from "../src/lib/sample-provenance";

test("uses the session source instead of a caller-provided source", () => {
  assert.equal(resolveSensorDataSource("DEMO", "HARDWARE"), "DEMO");
  assert.equal(resolveSensorDataSource("HARDWARE", "DEMO"), "HARDWARE");
});

test("defaults direct gateway uploads to hardware and preserves demo provenance", () => {
  assert.equal(resolveSensorDataSource(), "HARDWARE");
  assert.equal(resolveSensorDataSource(null, "DEMO"), "DEMO");
  assert.equal(isSimulatedSource("DEMO"), true);
  assert.equal(isSimulatedSource("HARDWARE"), false);
});
