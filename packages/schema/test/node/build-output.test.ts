import { existsSync, readdirSync, readFileSync } from "node:fs"
import { builtinModules } from "node:module"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"

// T034 — the build output of @songnoi/schema imports nothing but `zod` and its own files (spec
// AC2, R20; plan "Zod version and package shape", "R20 guard rails"). Reads the built `dist/`, so
// it runs after `pnpm --filter @songnoi/schema build` (Turbo: the package's `test` depends on its
// own `build`). Every `dist/**/*.js` file is parsed with the TypeScript compiler (a real parser, so
// a word in a comment or a string never counts) and checked for:
//   - module specifiers (static `import`, `export … from`, dynamic `import()`): only `zod` or a
//     relative path to a file inside `dist/`; no Node built-in (`node:*` or a bare built-in name);
//     a dynamic `import()` must take a string literal;
//   - no reference to the Node globals `process`, `Buffer` or `require` (also not through
//     `globalThis.x` / `globalThis["x"]`).
// It also proves Zod is not bundled: the output imports `zod`. Node-only: it reads the file system.

const distDir = fileURLToPath(new URL("../../dist/", import.meta.url))

const FORBIDDEN_GLOBALS = new Set(["process", "Buffer", "require"])
const GLOBAL_OBJECTS = new Set(["globalThis", "self", "window", "global"])
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))

function jsFiles(): string[] {
  if (!existsSync(distDir)) return []
  return readdirSync(distDir, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".js"))
    .map((name) => join(distDir, name))
    .sort()
}

interface Scan {
  readonly specifiers: readonly string[]
  readonly nonLiteralImports: number
  readonly globals: readonly string[]
}

// Identifiers in these positions are property or member names, not references to a global.
function isNameOnly(node: ts.Identifier): boolean {
  const parent = node.parent
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isGetAccessorDeclaration(parent) && parent.name === node) ||
    (ts.isSetAccessorDeclaration(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    (ts.isExportSpecifier(parent) && parent.propertyName === node) ||
    (ts.isImportSpecifier(parent) && parent.propertyName === node)
  )
}

function scan(file: string, text = readFileSync(file, "utf8")): Scan {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const specifiers: string[] = []
  const globals: string[] = []
  let nonLiteralImports = 0

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments
      if (argument !== undefined && ts.isStringLiteralLike(argument)) specifiers.push(argument.text)
      else nonLiteralImports += 1
    }
    if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text) && !isNameOnly(node)) {
      globals.push(node.text)
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      GLOBAL_OBJECTS.has(node.expression.text) &&
      FORBIDDEN_GLOBALS.has(node.name.text)
    ) {
      globals.push(`${node.expression.text}.${node.name.text}`)
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      GLOBAL_OBJECTS.has(node.expression.text) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      FORBIDDEN_GLOBALS.has(node.argumentExpression.text)
    ) {
      globals.push(`${node.expression.text}["${node.argumentExpression.text}"]`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { specifiers, nonLiteralImports, globals }
}

const files = jsFiles()
const scans = new Map(files.map((file) => [file, scan(file)]))
const label = (file: string) => relative(distDir, file).split(sep).join("/")

describe("the dist scanner itself", () => {
  it("finds what it must refuse, and ignores comments, strings and property names", () => {
    const found = scan(
      "probe.js",
      [
        'import fs from "node:fs"',
        'export { x } from "./local.js"',
        'import "react"',
        'const m = await import("path")',
        "const n = await import(name)",
        "process.env.TZ",
        'require("crypto")',
        "globalThis.Buffer",
        'self["process"]',
        "// process, Buffer and require in a comment",
        'const s = "process Buffer require"',
        "const o = { process: 1 }; o.require; const { Buffer: b } = o",
      ].join("\n"),
    )
    expect(found.specifiers).toEqual(["node:fs", "./local.js", "react", "path"])
    expect(found.nonLiteralImports).toBe(1)
    expect(found.globals).toEqual(["process", "require", "globalThis.Buffer", 'self["process"]'])
  })
})

describe("dist/**/*.js (AC2, R20)", () => {
  it("the build output exists (run `pnpm --filter @songnoi/schema build` first)", () => {
    expect(files.map(label)).toContain("index.js")
  })

  it.each(files.map((file) => [label(file), file] as const))(
    "AC2 %s imports only zod and relative files inside dist",
    (_name, file) => {
      const { specifiers, nonLiteralImports } = scans.get(file) ?? expect.fail("scanned")
      expect(nonLiteralImports).toBe(0)
      const outside = specifiers.filter(
        (s) => s !== "zod" && !s.startsWith("./") && !s.startsWith("../"),
      )
      expect(outside).toEqual([])
      for (const specifier of specifiers.filter((s) => s.startsWith("."))) {
        const target = resolve(dirname(file), specifier)
        expect(target.startsWith(distDir), specifier).toBe(true)
        expect(existsSync(target), specifier).toBe(true)
      }
    },
  )

  it.each(files.map((file) => [label(file), file] as const))(
    "AC2 %s imports no Node built-in module",
    (_name, file) => {
      const { specifiers } = scans.get(file) ?? expect.fail("scanned")
      expect(specifiers.filter((s) => NODE_BUILTINS.has(s) || s.startsWith("node:"))).toEqual([])
    },
  )

  it.each(files.map((file) => [label(file), file] as const))(
    "R20 %s references no process, Buffer or require",
    (_name, file) => {
      const { globals } = scans.get(file) ?? expect.fail("scanned")
      expect(globals).toEqual([])
    },
  )

  it("AC2 zod stays external: the output imports it instead of bundling it", () => {
    const all = [...scans.values()].flatMap(({ specifiers }) => specifiers)
    expect(all).toContain("zod")
  })
})
