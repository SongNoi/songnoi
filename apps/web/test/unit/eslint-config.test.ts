import path from "node:path"
import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

// The real apps/web config (not just the architecture part) must reject a "use server" file
// anywhere in the app, including outside src/ (R39, constitution §10).
describe("apps/web eslint.config.mjs", () => {
  it('bans a file-level "use server" outside src/', async () => {
    const appRoot = path.resolve(import.meta.dirname, "../..")
    const eslint = new ESLint({ cwd: appRoot })
    const config = (await eslint.calculateConfigForFile(
      path.join(appRoot, "server-actions.ts"),
    )) as {
      rules: Record<string, unknown[]>
    }
    const rule = config.rules["no-restricted-syntax"]
    expect(JSON.stringify(rule)).toContain("Program > ExpressionStatement[directive='use server']")
  })

  it("keeps the inline ban but allows the file directive in a module's actions.ts", async () => {
    const appRoot = path.resolve(import.meta.dirname, "../..")
    const eslint = new ESLint({ cwd: appRoot })
    const config = (await eslint.calculateConfigForFile(
      path.join(appRoot, "src/modules/forms/actions.ts"),
    )) as { rules: Record<string, unknown[]> }
    const rule = JSON.stringify(config.rules["no-restricted-syntax"])
    expect(rule).not.toContain("Program > ExpressionStatement")
    expect(rule).toContain(":function > BlockStatement > ExpressionStatement")
  })
})
