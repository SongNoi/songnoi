import { defineConfig, devices } from "@playwright/test"

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`

// Smoke tests against a production build (`pnpm build` first). The home page and locale
// switch need no database, but the server still validates its env at start-up.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use a preinstalled browser when provided (e.g. sandboxes); CI installs its own.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: "node e2e/serve.mjs",
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      APP_URL: baseURL,
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://songnoi:songnoi@localhost:5432/songnoi_test",
      ADMIN_AUTH_SECRET: process.env.ADMIN_AUTH_SECRET ?? "e2e-admin-secret-0123456789abcdef01234",
      RESPONDENT_AUTH_SECRET:
        process.env.RESPONDENT_AUTH_SECRET ?? "e2e-respondent-secret-0123456789abcdef0",
    },
  },
})
