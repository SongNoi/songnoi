import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// T034 — the published manifest of @songnoi/schema (spec AC2, R20; plan "Zod version and package
// shape", Risk 5; ADR 0004, ADR 0012; brief §2, .claude/rules/schema.md). The schema must stay
// usable on the server and outside React: no UI library among the dependencies of any kind, `zod`
// the only name across them (a peer, so app, package and plugins share one Zod), and an `exports`
// map that exposes no internals. Node-only: it reads the package's own `package.json`.

type DependencyField = "dependencies" | "peerDependencies" | "optionalDependencies"

const DEPENDENCY_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
] as const satisfies readonly DependencyField[]

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  exports?: Record<string, unknown>
} & Partial<Record<DependencyField, Record<string, string>>>

function namesIn(field: DependencyField): string[] {
  return Object.keys(pkg[field] ?? {})
}

// React and its renderers, other UI frameworks, and common component / styling libraries.
function isUiLibrary(name: string): boolean {
  return (
    name === "react" ||
    name.startsWith("react-") ||
    name.startsWith("@react-") ||
    name === "preact" ||
    name === "vue" ||
    name.startsWith("@vue/") ||
    name === "svelte" ||
    name === "solid-js" ||
    name === "lit" ||
    name.startsWith("@angular/") ||
    name === "next" ||
    name.startsWith("@radix-ui/") ||
    name.startsWith("@mui/") ||
    name.startsWith("@emotion/") ||
    name === "styled-components" ||
    name.startsWith("@headlessui/")
  )
}

describe("@songnoi/schema manifest (AC2)", () => {
  it.each(DEPENDENCY_FIELDS)("AC2 has no react, react-dom or other UI library in %s", (field) => {
    expect(namesIn(field).filter(isUiLibrary)).toEqual([])
  })

  it("AC2 zod is the only name across dependencies, peerDependencies and optionalDependencies", () => {
    const names = new Set(DEPENDENCY_FIELDS.flatMap(namesIn))
    expect([...names]).toEqual(["zod"])
  })

  it("AC2 zod is a peer dependency, so app, package and plugins share one Zod copy", () => {
    expect(pkg.peerDependencies?.zod).toBe("^4.6.0")
  })

  it('exports has exactly the keys "." and "./package.json" (no subpath exposes internals)', () => {
    expect(Object.keys(pkg.exports ?? {})).toEqual([".", "./package.json"])
    expect(pkg.exports?.["./package.json"]).toBe("./package.json")
  })
})
