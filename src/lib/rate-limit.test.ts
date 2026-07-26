import assert from "node:assert/strict";
import { test } from "node:test";

import { createRateLimiter } from "./rate-limit";

test("allows up to max requests within a window", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("a", 100).allowed, true);
  assert.equal(limiter.check("a", 200).allowed, true);
  const blocked = limiter.check("a", 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.resetAt, 1000);
});

test("resets after the window elapses", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("a", 500).allowed, false);
  assert.equal(limiter.check("a", 1000).allowed, true);
});

test("keys are isolated", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("b", 0).allowed, true);
  assert.equal(limiter.check("a", 0).allowed, false);
});

test("reset clears a key", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check("a", 0).allowed, true);
  limiter.reset("a");
  assert.equal(limiter.check("a", 0).allowed, true);
});

test("prunes expired entries so the map does not grow unbounded", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 5 });
  for (let i = 0; i < 100; i += 1) {
    limiter.check(`client-${i}`, 0);
  }
  assert.equal(limiter.size(), 100);
  // A later request past every window should prune the stale entries.
  limiter.check("late", 2000);
  assert.equal(limiter.size(), 1);
});

test("enforces a hard cap on total entries", () => {
  const limiter = createRateLimiter({ windowMs: 100_000, max: 5, maxEntries: 10 });
  for (let i = 0; i < 50; i += 1) {
    limiter.check(`client-${i}`, i); // staggered so all windows are still open
  }
  assert.ok(limiter.size() <= 10, `expected <= 10 entries, got ${limiter.size()}`);
});
