import path from "node:path"
import { ESLint } from "eslint"
import tseslint from "typescript-eslint"
import { beforeAll, describe, expect, it } from "vitest"
import { serverActions } from "@songnoi/config/eslint/server-actions"
import { architecture } from "../../eslint/architecture.mjs"

// Lints a fixture tree that mirrors src/ with the exact rules apps/web uses (spec R19, R37, R39).
const appRoot = path.resolve(import.meta.dirname, "../..")
const fixtureRoot = path.join(appRoot, "test/fixtures/architecture")

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser } },
      // Same order as the real config: the shared "use server" ban, then the architecture rules.
      ...serverActions,
      ...architecture({ rootPath: fixtureRoot, tsconfig: path.join(appRoot, "tsconfig.json") }),
    ],
  })
})

async function errorsFor(file: string) {
  const target = file.startsWith("/") ? file.slice(1) : path.join("src", file)
  const [result] = await eslint.lintFiles([path.join(fixtureRoot, target)])
  return (result?.messages ?? []).map((m) => `${m.ruleId ?? "fatal"}: ${m.message}`)
}

describe("allowed edges", () => {
  it.each([
    "shared/kernel/result.ts",
    "modules/demo/domain/entity.ts",
    "modules/demo/application/use-case.ts",
    "modules/demo/infrastructure/repo.ts",
    "modules/demo/actions.ts",
    "modules/demo/queries.ts",
    "modules/demo/application/cross-module-use-case.ts",
    "modules/other/domain/x.ts",
    "modules/auth/admin/instance.ts",
    "app/(admin)/page.tsx",
  ])("%s passes", async (file) => {
    expect(await errorsFor(file)).toEqual([])
  })
})

describe("forbidden edges", () => {
  it.each([
    [
      "domain → framework (next)",
      "modules/demo/domain/bad-framework.ts",
      "boundaries/dependencies",
    ],
    ["domain → infrastructure", "modules/demo/domain/bad-outward.ts", "boundaries/dependencies"],
    [
      "domain → Prisma (@prisma/client)",
      "modules/demo/domain/bad-prisma.ts",
      "boundaries/dependencies",
    ],
    ["domain → shared db", "modules/demo/domain/bad-db.ts", "boundaries/dependencies"],
    [
      "actions.ts → Prisma (writes skip use cases)",
      "modules/writes/actions.ts",
      "boundaries/dependencies",
    ],
    [
      'file-level "use server" in application',
      "modules/demo/application/bad-file-use-server.ts",
      "no-restricted-syntax",
    ],
    [
      'file-level "use server" in a page folder',
      "app/(admin)/bad-file-use-server.ts",
      "no-restricted-syntax",
    ],
    ["export * from actions.ts", "modules/reexportall/actions.ts", "no-restricted-syntax"],
    ['"use server" file outside src/', "/server-actions.ts", "no-restricted-syntax"],
    ["`export let` action (reassignable)", "modules/letexport/actions.ts", "no-restricted-syntax"],
    [
      "local defineAction shadowing the real one",
      "modules/shadow/actions.ts",
      "no-restricted-syntax",
    ],
    [
      "module → other module internals",
      "modules/demo/application/bad-cross-module.ts",
      "boundaries/dependencies",
    ],
    ["app → module domain", "app/(admin)/bad-domain.tsx", "boundaries/dependencies"],
    ["(respond) → (admin)", "app/(respond)/bad-cross-world.tsx", "boundaries/dependencies"],
    [
      "respondent auth → admin auth",
      "modules/auth/respondent/bad-guard.ts",
      "boundaries/dependencies",
    ],
    [
      'inline "use server"',
      "modules/demo/application/bad-inline-use-server.ts",
      "no-restricted-syntax",
    ],
  ])("%s is an error", async (_name, file, rule) => {
    const errors = await errorsFor(file)
    expect(
      errors.some((e) => e.startsWith(`${rule}:`)),
      errors.join("\n"),
    ).toBe(true)
  })

  it("bare exports in actions.ts are errors", async () => {
    const errors = (await errorsFor("modules/bad/actions.ts")).filter((e) =>
      e.startsWith("no-restricted-syntax:"),
    )
    expect(errors).toHaveLength(2)
  })

  it("re-exports from actions.ts are errors (`export { x }` and `export { x } from`)", async () => {
    const errors = (await errorsFor("modules/reexport/actions.ts")).filter((e) =>
      e.startsWith("no-restricted-syntax:"),
    )
    expect(errors).toHaveLength(2)
  })
})
