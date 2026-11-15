import { PrismaClient } from "@prisma/client";

/**
 * Neon: a URL com "-pooler" passa pelo PgBouncer (modo transação). O Prisma precisa de
 * pgbouncer=true nesse caso; adicionamos automaticamente para evitar erro de configuração.
 */
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes("-pooler") || url.includes("pgbouncer=")) return url;
  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true&connect_timeout=15";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
