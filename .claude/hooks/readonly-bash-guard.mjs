// PreToolUse (Bash) for read-only subagents (spec-reviewer, convergence-auditor):
// allow only git reads and test/lint/typecheck runs, with no chaining or redirection.
import { readFileSync } from "node:fs"

const input = JSON.parse(readFileSync(0, "utf8") || "{}")
const cmd = (input.tool_input?.command ?? "").trim()

const allowed =
  /^(git (diff|log|show|status)\b|pnpm (test|test:integration|typecheck|lint|vitest run)\b)/
const chained = /[;&|><`]|\$\(/

if (allowed.test(cmd) && !chained.test(cmd)) process.exit(0)

console.error(
  "Blocked: read-only agents may only run git diff/log/show/status, pnpm test, " +
    "pnpm test:integration, pnpm typecheck, pnpm lint or pnpm vitest run, without chaining " +
    "or redirection.",
)
process.exit(2)
