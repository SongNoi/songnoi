import { defineConfig } from "vitest/config"

// Node project: shared tests (`test/**`) plus Node-only checks (`test/node/**`).
// The Chromium project lives in vitest.browser.config.ts (`pnpm test:browser`).
export default defineConfig({
  test: {
    name: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/browser/**", "**/node_modules/**"],
    // UTC-11 on purpose: any accidental use of the process time zone shows up in the date tests.
    env: { TZ: "Pacific/Pago_Pago" },
  },
})
