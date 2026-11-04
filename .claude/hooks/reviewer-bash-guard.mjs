// PreToolUse (Bash) for the spec-reviewer subagent: allow only git reads and tests.
import { readFileSync } from "node:fs"

const input = JSON.parse(readFileSync(0, "utf8") || "{}")
const cmd = (input.tool_input?.command ?? "").trim()

const allowed = /^(git (diff|log|show|status)\b|pnpm (test|typecheck|vitest run)\b)/
const chained = /[;&|><`]|\$\(/

if (allowed.test(cmd) && !chained.test(cmd)) process.exit(0)

console.error(
  "Blocked: spec-reviewer may only run git diff/log/show/status, pnpm test, " +
    "pnpm typecheck or pnpm vitest run, without chaining or redirection.",
)
process.exit(2)
