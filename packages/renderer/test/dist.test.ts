import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = new URL("../", import.meta.url)
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
  type: string
  exports: { ".": { types: string; import: string } }
}

describe("built package", () => {
  it("is ESM-only", () => {
    expect(pkg.type).toBe("module")
    expect(Object.keys(pkg.exports["."])).toEqual(["types", "import"])
  })

  it("ships type declarations", () => {
    expect(existsSync(fileURLToPath(new URL(pkg.exports["."].types, root)))).toBe(true)
  })

  it("can be imported through its exports map", async () => {
    const mod = (await import(fileURLToPath(new URL(pkg.exports["."].import, root)))) as {
      VERSION: unknown
    }
    expect(typeof mod.VERSION).toBe("string")
  })
})
