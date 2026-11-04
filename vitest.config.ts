import { defineConfig } from "vitest/config"

// Lets `pnpm vitest run <path>` run any single test file from the repo root.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
})
