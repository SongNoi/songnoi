import { describe, expect, it } from "vitest"
import { resolveAdminLocale, resolveRespondentLocale } from "@/i18n/resolve-locale"

describe("resolveRespondentLocale", () => {
  it("uses the form owner's locale when supported", () => {
    expect(resolveRespondentLocale("th")).toBe("th")
    expect(resolveRespondentLocale("en")).toBe("en")
  })

  it("falls back to en for unsupported or missing locales", () => {
    expect(resolveRespondentLocale("fr")).toBe("en")
    expect(resolveRespondentLocale(undefined)).toBe("en")
    expect(resolveRespondentLocale(null)).toBe("en")
  })

  it("has no Accept-Language input at all, so the browser cannot override the form", () => {
    expect(resolveRespondentLocale.length).toBe(1)
  })
})

describe("resolveAdminLocale", () => {
  it("uses the cookie when it holds a supported locale", () => {
    expect(resolveAdminLocale("th")).toBe("th")
  })

  it("falls back to en otherwise", () => {
    expect(resolveAdminLocale("xx")).toBe("en")
    expect(resolveAdminLocale(undefined)).toBe("en")
  })
})
