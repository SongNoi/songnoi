import { execFileSync } from "node:child_process"
import path from "node:path"

// Applies migrations to the test database once before the integration suite.
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://songnoi:songnoi@localhost:5432/songnoi_test"
  process.env.TEST_DATABASE_URL = url
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, DATABASE_URL: url, CHECKPOINT_DISABLE: "1" },
    stdio: "pipe",
  })
}
