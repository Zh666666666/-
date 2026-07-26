/**
 * Prisma 「记录不存在」的统一处理。
 *
 * `prisma.x.update({ where: { id } })` 在 id 不存在时抛 P2025，未捕获会变成
 * HTTP 500。这些路由的 demo 分支本来就返回 404，生产分支却是 500——同一个
 * 请求在两种模式下语义不同，客户端无法据此区分「资源不存在」和「服务故障」。
 * 这里把 P2025 收敛成 null，让路由返回与 demo 分支一致的 404。
 */

const RECORD_NOT_FOUND = "P2025";

export function isRecordNotFound(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === RECORD_NOT_FOUND;
}

/**
 * 执行一次 Prisma 写操作；目标记录不存在时返回 null，其余错误照常抛出。
 * 只吞 P2025，避免把连接失败、约束冲突等真实故障也伪装成 404。
 */
export async function updateOrNull<T>(operation: Promise<T>): Promise<T | null> {
  try {
    return await operation;
  } catch (error) {
    if (isRecordNotFound(error)) return null;
    throw error;
  }
}
