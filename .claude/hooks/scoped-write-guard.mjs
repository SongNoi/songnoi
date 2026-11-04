// PreToolUse (Edit|Write) for role subagents: each role may only write inside its own area.
// Usage in agent frontmatter: node scoped-write-guard.mjs <scope>
//   docs  — planning/requirements/design agents: docs/work/**, docs/adr/**
//   tests — test-engineer: test files, fixtures and e2e specs only
import { readFileSync } from "node:fs"
import path from "node:path"

const SCOPES = {
  docs: [/^docs\/work\//, /^docs\/adr\//],
  tests: [
    /(^|\/)test\//,
    /(^|\/)e2e\//,
    /\.test\.tsx?$/,
    /\.test-d\.tsx?$/,
    /\.spec\.tsx?$/,
    /(^|\/)playwright\.config\.ts$/,
    /(^|\/)vitest\.config\.ts$/,
  ],
}

const scope = process.argv[2] ?? ""
const allowed = SCOPES[scope]
const input = JSON.parse(readFileSync(0, "utf8") || "{}")
const filePath = input.tool_input?.file_path
if (!filePath) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/")

if (allowed && !rel.startsWith("..") && allowed.some((re) => re.test(rel))) process.exit(0)

console.error(
  `Blocked: this agent may only write in its "${scope}" area (${(allowed ?? []).map(String).join(", ")}). ` +
    `"${rel}" is outside it — hand the change back to the caller.`,
)
process.exit(2)
