import "server-only"
import { z } from "zod"

/** Every environment variable the server reads. Keep `.env.example` in sync (spec R16). */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** Public base URL of this app, e.g. http://localhost:3000. */
  APP_URL: z.url(),
  DATABASE_URL: z.url().refine((v) => v.startsWith("postgres"), "must be a postgres:// URL"),
  /** Signs admin sessions. Different from the respondent secret (ADR 0002). */
  ADMIN_AUTH_SECRET: z.string().min(32),
  /** Signs respondent sessions. Different from the admin secret (ADR 0002). */
  RESPONDENT_AUTH_SECRET: z.string().min(32),
})

export type Env = z.infer<typeof EnvSchema>

/** Parses an environment object; throws one error that names every bad variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}`)
  }
  if (result.data.ADMIN_AUTH_SECRET === result.data.RESPONDENT_AUTH_SECRET) {
    throw new Error(
      "Invalid environment variables:\n  - RESPONDENT_AUTH_SECRET: must differ from ADMIN_AUTH_SECRET",
    )
  }
  return result.data
}

let cached: Env | undefined

/** Validated env, parsed on first use (not at import, so `next build` needs no secrets). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
