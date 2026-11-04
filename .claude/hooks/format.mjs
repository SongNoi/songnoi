// PostToolUse (Edit|Write): run the workspace Prettier on the edited file, if installed.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const input = JSON.parse(readFileSync(0, "utf8") || "{}")
const filePath = input.tool_input?.file_path
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
const bin = path.join(root, "node_modules", ".bin", "prettier")

if (!filePath || !existsSync(bin)) process.exit(0)

try {
  execFileSync(bin, ["--write", "--ignore-unknown", path.resolve(root, filePath)], {
    cwd: root,
    stdio: "ignore",
  })
} catch {
  // Formatting is best-effort; never block on it.
}
process.exit(0)
