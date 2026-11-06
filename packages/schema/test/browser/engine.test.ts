import { describe, expect, it } from "vitest"

// Proves the browser project runs in real Chromium under a hostile locale/time zone (AC28).
describe("browser engine", () => {
  it("runs in real Chromium", () => {
    expect(navigator.userAgent).toMatch(/Chrome|HeadlessChrome/)
  })

  it("has no Node process global", () => {
    expect(typeof process).toBe("undefined")
  })

  it("uses the th-TH locale from the browser context", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().locale).toBe("th-TH")
  })

  it("uses the Pacific/Kiritimati time zone from the browser context", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Pacific/Kiritimati")
  })
})
