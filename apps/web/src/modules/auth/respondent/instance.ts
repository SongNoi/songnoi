import "server-only"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { getEnv, type Env } from "@/env"
import { getDb, type Db } from "@/shared/infrastructure/db"

/**
 * Respondent world (people answering forms). Never shares sessions, cookies, secrets or tables
 * with the admin world (ADR 0002). Only email + password for now; per-form access modes
 * (brief §7) are added by their own work items.
 */
export const RESPONDENT_AUTH_BASE_PATH = "/api/auth/respondent"
export const RESPONDENT_COOKIE_PREFIX = "songnoi_respondent"

export function createRespondentAuth(db: Db, env: Pick<Env, "APP_URL" | "RESPONDENT_AUTH_SECRET">) {
  return betterAuth({
    appName: "SongNoi",
    baseURL: env.APP_URL,
    basePath: RESPONDENT_AUTH_BASE_PATH,
    secret: env.RESPONDENT_AUTH_SECRET,
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: { enabled: true },
    user: { modelName: "respondentUser" },
    session: { modelName: "respondentSession" },
    account: { modelName: "respondentAccount" },
    verification: { modelName: "respondentVerification" },
    advanced: { cookiePrefix: RESPONDENT_COOKIE_PREFIX },
    telemetry: { enabled: false },
  })
}

export type RespondentAuth = ReturnType<typeof createRespondentAuth>

let instance: RespondentAuth | undefined

export function getRespondentAuth(): RespondentAuth {
  instance ??= createRespondentAuth(getDb(), getEnv())
  return instance
}
