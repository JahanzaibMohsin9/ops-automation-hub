import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaSlowQueryLoggingInitialized?: boolean;
};

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/ops_automation";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? [{ emit: "event", level: "query" }]
        : undefined,
  });

if (
  process.env.NODE_ENV === "development" &&
  !globalForPrisma.prismaSlowQueryLoggingInitialized
) {
  (prisma as PrismaClient & {
    $on: (
      eventType: "query",
      callback: (event: { duration: number; query: string }) => void
    ) => void;
  }).$on("query", (event) => {
    if (event.duration < 250) {
      return;
    }

    const compactQuery = event.query.replace(/\s+/g, " ").trim();
    console.log(
      `[prisma:slow] ${event.duration}ms ${compactQuery.slice(0, 220)}${
        compactQuery.length > 220 ? "..." : ""
      }`
    );
  });

  globalForPrisma.prismaSlowQueryLoggingInitialized = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
