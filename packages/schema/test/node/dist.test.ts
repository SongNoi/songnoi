import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import * as source from "../../src/index"

// T034 — the built package is ESM with type declarations (spec AC2; plan "Zod version and package
// shape"; ADR 0004). Reads the built `dist/`, so it runs after `pnpm --filter @songnoi/schema build`
// (Turbo: the package's `test` depends on its own `build`). The built module is imported through
// the `exports` map; its runtime exports must equal the source barrel's (a stale or partial build
// fails here), and the declaration file must declare every one of them. Node-only: it reads the
// file system.

const root = new URL("../../", import.meta.url)
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
  type: string
  exports: { ".": { types: string; import: string } }
}
const typesPath = fileURLToPath(new URL(pkg.exports["."].types, root))
const importPath = fileURLToPath(new URL(pkg.exports["."].import, root))

async function built(): Promise<Readonly<Record<string, unknown>>> {
  return (await import(importPath)) as Readonly<Record<string, unknown>>
}

// The names a declaration file exports: `export declare …` / `export function …` statements and
// `export { a, b as c }` lists, read with the TypeScript parser.
function declaredExports(file: string): Set<string> {
  const text = readFileSync(file, "utf8")
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    const isExported = ts.canHaveModifiers(statement)
      ? (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      : false
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.add(element.name.text)
      }
    } else if (isExported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      }
    } else if (
      isExported &&
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      names.add(statement.name.text)
    }
  }
  return names
}

describe("built package (AC2)", () => {
  it("AC2 is ESM-only: type module, exports map with types and import only", () => {
    expect(pkg.type).toBe("module")
    expect(Object.keys(pkg.exports["."])).toEqual(["types", "import"])
    expect(pkg.exports["."].import).toMatch(/\.js$/)
  })

  it("AC2 the built module is ESM syntax, not CommonJS", () => {
    const text = readFileSync(importPath, "utf8")
    expect(text).toMatch(/^export \{/m)
    expect(text).not.toMatch(/\bmodule\.exports\b|\bexports\.[A-Za-z_$]/)
  })

  it("AC2 ships type declarations", () => {
    expect(existsSync(typesPath)).toBe(true)
  })

  it("can be imported through its exports map", async () => {
    expect(typeof (await built()).defineField).toBe("function")
  })

  it("exports at runtime exactly what the source barrel exports (the build is current)", async () => {
    expect(Object.keys(await built()).sort()).toEqual(Object.keys(source).sort())
  })

  it("AC2 the declaration file declares every runtime export", () => {
    const declared = declaredExports(typesPath)
    expect(Object.keys(source).filter((name) => !declared.has(name))).toEqual([])
  })
})
