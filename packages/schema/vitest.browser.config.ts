import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

// Chromium project: shared tests (`test/**`) plus browser-only checks (`test/browser/**`).
// Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled browser (sandboxes); CI installs its own.
// The Thai locale and the UTC+14 zone are tripwires for code that reads the environment (R20).
export default defineConfig({
  test: {
    name: "chromium",
    include: ["test/**/*.test.ts"],
    exclude: ["test/node/**", "**/node_modules/**"],
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright({
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
        contextOptions: { locale: "th-TH", timezoneId: "Pacific/Kiritimati" },
      }),
    },
  },
})
