import "server-only"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { getEnv, type Env } from "@/env"
import { getDb, type Db } from "@/shared/infrastructure/db"

/** Admin world (form creators). Separate path, cookie prefix, secret and tables (ADR 0002). */
export const ADMIN_AUTH_BASE_PATH = "/api/auth/admin"
export const ADMIN_COOKIE_PREFIX = "songnoi_admin"

export function createAdminAuth(db: Db, env: Pick<Env, "APP_URL" | "ADMIN_AUTH_SECRET">) {
  return betterAuth({
    appName: "SongNoi",
    baseURL: env.APP_URL,
    basePath: ADMIN_AUTH_BASE_PATH,
    secret: env.ADMIN_AUTH_SECRET,
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: { enabled: true },
    user: { modelName: "adminUser" },
    session: { modelName: "adminSession" },
    account: { modelName: "adminAccount" },
    verification: { modelName: "adminVerification" },
    advanced: { cookiePrefix: ADMIN_COOKIE_PREFIX },
    telemetry: { enabled: false },
  })
}

export type AdminAuth = ReturnType<typeof createAdminAuth>

let instance: AdminAuth | undefined

/** Created on first use so `next build` does not need secrets or a database. */
export function getAdminAuth(): AdminAuth {
  instance ??= createAdminAuth(getDb(), getEnv())
  return instance
}
