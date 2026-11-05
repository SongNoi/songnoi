import { describe, expect, it } from "vitest"
import * as schema from "../src/index"

// Shared Node + Chromium smoke test; deleted in T005.
describe("smoke", () => {
  it("exposes the package entry point", () => {
    expect(Object.keys(schema).length).toBeGreaterThan(0)
  })
})
