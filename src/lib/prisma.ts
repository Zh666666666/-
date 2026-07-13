import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { getRuntimeReadiness, hasUsableDatabaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function shouldUsePrisma() {
  return getRuntimeReadiness().durableStorage && hasUsableDatabaseUrl();
}

function createPrismaClient() {
  if (!shouldUsePrisma()) {
    throw new Error("A valid production DATABASE_URL is required before using PrismaClient.");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const prismaClient = globalForPrisma.prisma ?? (shouldUsePrisma() ? createPrismaClient() : undefined);

export const prisma =
  prismaClient ??
  (new Proxy(
    {},
    {
      get() {
        throw new Error("DATABASE_URL is required before using PrismaClient.");
      },
    },
  ) as PrismaClient);

if (process.env.NODE_ENV !== "production" && prismaClient) {
  globalForPrisma.prisma = prismaClient;
}
