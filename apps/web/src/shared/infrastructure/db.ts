import "server-only"
import { PrismaPg } from "@prisma/adapter-pg"
import { getEnv } from "@/env"
import { PrismaClient } from "./generated/prisma/client"

export type Db = PrismaClient

/** Creates a Prisma client for a connection string (tests use this with their own DB). */
export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

const globalForDb = globalThis as unknown as { songnoiDb?: Db }

/** The app's shared client; reused across hot reloads in development. */
export function getDb(): Db {
  globalForDb.songnoiDb ??= createDb(getEnv().DATABASE_URL)
  return globalForDb.songnoiDb
}

/** True when Postgres answers a trivial query. */
export async function pingDatabase(db: Db): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
