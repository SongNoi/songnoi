import path from "node:path"

/**
 * Loads the repo-root `.env` (the one docker compose also reads) for `pnpm dev`, `next build`
 * and Prisma CLI commands. Values already in the environment win; a missing file is fine.
 */
export function loadRootEnv(): void {
  try {
    process.loadEnvFile(path.join(import.meta.dirname, "../../.env"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}
