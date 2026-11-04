// Stop: run `pnpm -s typecheck` once the workspace has a typecheck script and deps installed.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const input = JSON.parse(readFileSync(0, "utf8") || "{}")
// Already continuing because of this hook: let Claude stop rather than loop forever.
if (input.stop_hook_active) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
const pkgPath = path.join(root, "package.json")
if (!existsSync(pkgPath) || !existsSync(path.join(root, "node_modules"))) process.exit(0)

let scripts = {}
try {
  scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {}
} catch {
  process.exit(0)
}
if (!scripts.typecheck) process.exit(0)

const res = spawnSync("pnpm", ["-s", "typecheck"], { cwd: root, encoding: "utf8" })
if (res.status === 0) process.exit(0)

console.error(`Typecheck failed. Fix these errors before finishing:\n${res.stdout}${res.stderr}`)
process.exit(2)
