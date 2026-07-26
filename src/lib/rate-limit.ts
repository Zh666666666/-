/**
 * 内存滑动窗口限流器。
 *
 * 之前各认证路由各自维护一个模块级 Map，只在成功时删除条目，
 * 失败尝试和过期窗口会一直累积——攻击者轮换 IP/邮箱即可无上限
 * 撑大内存。这里统一实现：每次读写顺带修剪过期条目，并对条目
 * 总数设硬上限，超限时先淘汰最旧的窗口，避免无界增长。
 *
 * 纯内存实现，仅适用于单实例；多实例扩容时应迁移到 Redis 等
 * 共享存储（与实时事件总线同样的迁移点）。
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

export type RateLimiter = {
  check: (key: string, nowMs?: number) => RateLimitResult;
  reset: (key: string) => void;
  size: () => number;
};

export type RateLimiterOptions = {
  /** 窗口长度（毫秒）。 */
  windowMs: number;
  /** 单个窗口内允许的最大请求数。 */
  max: number;
  /** 条目总数硬上限，防止键空间被攻击者撑爆。默认 10000。 */
  maxEntries?: number;
};

export function createRateLimiter({ windowMs, max, maxEntries = 10_000 }: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function prune(nowMs: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= nowMs) buckets.delete(key);
    }
  }

  function evictOldestIfFull() {
    if (buckets.size < maxEntries) return;
    // Map 保持插入顺序；最旧的窗口最先到期，优先淘汰。
    let oldestKey: string | null = null;
    let oldestResetAt = Infinity;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < oldestResetAt) {
        oldestResetAt = bucket.resetAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) buckets.delete(oldestKey);
  }

  return {
    check(key, nowMs = Date.now()) {
      prune(nowMs);

      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= nowMs) {
        evictOldestIfFull();
        const resetAt = nowMs + windowMs;
        buckets.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: max - 1, resetAt };
      }

      if (existing.count >= max) {
        return { allowed: false, remaining: 0, resetAt: existing.resetAt };
      }

      existing.count += 1;
      return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt };
    },

    reset(key) {
      buckets.delete(key);
    },

    size() {
      return buckets.size;
    },
  };
}
