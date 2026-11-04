// PreToolUse (Edit|Write): block edits to the brief and to applied Prisma migrations.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const input = JSON.parse(readFileSync(0, "utf8") || "{}")
const filePath = input.tool_input?.file_path
if (!filePath) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
const abs = path.resolve(root, filePath)
const rel = path.relative(root, abs).split(path.sep).join("/")

if (rel === "docs/project-brief.md") {
  console.error(
    "Blocked: docs/project-brief.md is the source of truth and must not be edited. " +
      "Propose the change in your summary instead.",
  )
  process.exit(2)
}

if (/(^|\/)prisma\/migrations\//.test(rel) && existsSync(abs)) {
  console.error(
    `Blocked: ${rel} is an existing migration. Never edit an applied migration; ` +
      "create a new one with prisma migrate instead.",
  )
  process.exit(2)
}

process.exit(0)
