import { vi } from "vitest"

// Integration tests run outside Next: stub its server-only marker and point the app at the
// migrated test database.
vi.mock("server-only", () => ({}))

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://songnoi:songnoi@localhost:5432/songnoi_test"

Object.assign(process.env, {
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: "http://localhost:3000",
  ADMIN_AUTH_SECRET: "test-admin-secret-0123456789abcdef0123",
  RESPONDENT_AUTH_SECRET: "test-respondent-secret-0123456789abcd",
  LOG_LEVEL: "error",
})
