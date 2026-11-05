import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Brief §2 / .claude/rules/schema.md: the schema must stay usable on the server and outside React.
describe("@songnoi/schema dependencies", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  it.each(["dependencies", "peerDependencies"] as const)("has no React in %s", (field) => {
    const names = Object.keys(pkg[field] ?? {})
    expect(names.filter((n) => n === "react" || n.startsWith("react-"))).toEqual([])
  })
})
