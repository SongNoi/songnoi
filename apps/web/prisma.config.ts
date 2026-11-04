import { defineConfig } from "prisma/config"
import { loadRootEnv } from "./load-root-env"

loadRootEnv()

const url = process.env.DATABASE_URL
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL

// DATABASE_URL is only needed for migrate/introspect; `prisma generate` runs without it.
// SHADOW_DATABASE_URL is only needed by `pnpm db:check` (migrations vs schema drift, R13).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } } : {}),
})
