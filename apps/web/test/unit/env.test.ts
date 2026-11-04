import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { parseEnv } = await import("@/env")

const valid = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://songnoi:songnoi@localhost:5432/songnoi",
  ADMIN_AUTH_SECRET: "a".repeat(32),
  RESPONDENT_AUTH_SECRET: "b".repeat(32),
}

describe("parseEnv", () => {
  it("accepts a complete environment and applies defaults", () => {
    const env = parseEnv(valid)
    expect(env.LOG_LEVEL).toBe("info")
    expect(env.NODE_ENV).toBe("development")
  })

  it("names DATABASE_URL when it is missing", () => {
    const { DATABASE_URL: _omit, ...rest } = valid
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/)
  })

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x@y/z" })).toThrow(/DATABASE_URL/)
  })

  it("requires the two auth secrets to differ (separate worlds)", () => {
    expect(() => parseEnv({ ...valid, RESPONDENT_AUTH_SECRET: valid.ADMIN_AUTH_SECRET })).toThrow(
      /RESPONDENT_AUTH_SECRET/,
    )
  })
})
