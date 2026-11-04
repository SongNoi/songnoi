import { globSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Spec R38 / ADR 0005: mutations use Server Actions; route handlers exist only where an HTTP
// endpoint is unavoidable. Extend this list only together with ADR 0005.
export const ALLOWED_ROUTE_HANDLERS = [
  /^api\/auth\/admin\/\[\.\.\.all\]\/route\.ts$/,
  /^api\/auth\/respondent\/\[\.\.\.all\]\/route\.ts$/,
  /^api\/health\/route\.ts$/,
  /^api\/files\/(.+\/)?route\.ts$/, // streamed upload/download (no presigned URLs)
  /^api\/forms\/\[formId\]\/export\/route\.ts$/, // CSV download
  /^api\/v1\/(.+\/)?route\.ts$/, // external REST API / embed (brief §8)
]

const isAllowed = (file: string) => ALLOWED_ROUTE_HANDLERS.some((re) => re.test(file))

describe("route handler allow-list", () => {
  const appDir = path.resolve(import.meta.dirname, "../../src/app")
  const routes = globSync("**/route.{ts,tsx,js,jsx,mts,mjs}", { cwd: appDir }).map((f) =>
    f.split(path.sep).join("/"),
  )

  it.each(routes.length ? routes : ["(none yet)"])("%s is allow-listed", (file) => {
    if (file === "(none yet)") return
    expect(isAllowed(file), `${file} is not an allowed route handler (R38)`).toBe(true)
  })

  it("rejects a route handler outside the allow-list", () => {
    expect(isAllowed("api/forms/[formId]/publish/route.ts")).toBe(false)
    expect(isAllowed("(admin)/forms/route.ts")).toBe(false)
  })

  it("accepts the reserved paths", () => {
    expect(isAllowed("api/health/route.ts")).toBe(true)
    expect(isAllowed("api/files/[fileId]/route.ts")).toBe(true)
    expect(isAllowed("api/v1/forms/[formId]/responses/route.ts")).toBe(true)
  })
})
