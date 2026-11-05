import { expect } from "vitest"
import { type Issue, issueSchema } from "../../src/core/issues"

// Assertion helper for every failure test of 001 (AC8): an issue only counts when it parses with
// the strict catalogue schema, so a code outside R4, wrong or extra params, a `message` or an
// `input` key fails the test that produced it.

/**
 * Asserts that `actual` is an array of catalogue issues and returns it typed. Each element must
 * parse with the strict `issueSchema` (closed code list, exact params, `path`, nothing else) and
 * must not carry a `message`.
 */
export function parseIssues(actual: unknown): Issue[] {
  if (!Array.isArray(actual)) {
    expect.fail(`expected an array of issues, got ${show(actual)}`)
  }
  const items: readonly unknown[] = actual
  return items.map((item, index) => {
    if (typeof item === "object" && item !== null && Object.hasOwn(item, "message")) {
      expect.fail(`issue ${index} carries a message (codes and params only): ${show(item)}`)
    }
    const parsed = issueSchema.safeParse(item)
    if (!parsed.success) {
      expect.fail(
        `issue ${index} is not a catalogue issue: ${show(item)}; ` +
          `issueSchema says ${show(parsed.error.issues)}`,
      )
    }
    // Strict parse must not reshape the issue (no defaults, no transforms hiding a difference).
    expect(parsed.data).toStrictEqual(item)
    return parsed.data
  })
}

/**
 * Asserts that `actual` holds exactly the `expected` issues — code, params and path — in any
 * order (a multiset match: same length, every expected issue present as often as listed), and that
 * every actual issue parses with the strict `issueSchema`.
 */
export function expectIssues(actual: unknown, expected: readonly Issue[]): void {
  const issues = parseIssues(actual)
  expect(sortIssues(issues)).toStrictEqual(sortIssues(expected))
}

function sortIssues(issues: readonly Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const ka = canonical(a)
    const kb = canonical(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

// JSON with sorted object keys, so key order never affects the multiset comparison.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) return inner
    const entries = Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries)
  })
}

function show(value: unknown): string {
  try {
    // JSON.stringify returns undefined for undefined, functions and symbols, despite its type.
    const json = JSON.stringify(value) as string | undefined
    return json ?? String(value)
  } catch {
    return String(value)
  }
}
