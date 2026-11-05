// T014 — the shared hostile-JSON corpus (spec R8, AC12; plan "Whole-response validation", Proof
// AC12). Every value here is something `JSON.parse` can return — no `undefined`, functions, symbols,
// class instances or `NaN` — and each is hostile to some rule: wrong types, empty and blank strings,
// numbers at the extremes, mixed arrays, wrong option-answer shapes, own `__proto__` / `constructor`
// keys and very deep nesting. `test/response.test.ts` drives it through `validateResponse`; every
// built-in family test (T016, T017, T020, T022, T024) and `test/builtins.test.ts` (T032) reuse it as
// answers and as `config` through `parseFormSchema`: no throw, every issue in the catalogue.
//
// Every value is deeply frozen, so code that mutates its input throws in the test (ES modules run
// in strict mode) instead of silently changing the corpus for the next test. Shared fixture: runs in
// Node and in Chromium.

/** One corpus entry: a short name for the test title and the value itself. */
export interface HostileJson {
  readonly name: string
  readonly value: unknown
}

/** Depth of the deeply nested array and object (spec AC12: a 10,000-deep nested array). */
export const HOSTILE_DEPTH = 10_000

/** Length of the huge strings and of the long array. */
export const HOSTILE_LENGTH = 100_000

/** `JSON.parse`, so own `__proto__` / `constructor` keys are real own data properties. */
function parsed(json: string): unknown {
  return JSON.parse(json) as unknown
}

// Built with a loop rather than `JSON.parse`, so building the corpus never depends on the engine's
// parser depth; the value is exactly what `JSON.parse` returns for "[[[…]]]".
function deepArray(depth: number): unknown {
  let value: unknown = []
  for (let level = 0; level < depth; level += 1) value = [value]
  return value
}

function deepObject(depth: number): unknown {
  let value: unknown = {}
  for (let level = 0; level < depth; level += 1) value = { a: value }
  return value
}

// Iterative deep freeze (a recursive one would overflow the stack on the deep values).
function deepFreeze<T>(root: T): T {
  const pending: unknown[] = [root]
  const seen = new Set<object>()
  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value !== "object" || value === null || seen.has(value)) continue
    seen.add(value)
    Object.freeze(value)
    for (const key of Object.keys(value)) {
      pending.push((value as Record<string, unknown>)[key])
    }
  }
  return root
}

const entries: readonly HostileJson[] = [
  // --- literals and wrong types -------------------------------------------------------------------
  { name: "null", value: null },
  { name: "true", value: true },
  { name: "false", value: false },

  // --- numbers at the extremes --------------------------------------------------------------------
  { name: "0", value: 0 },
  { name: "-0", value: parsed("-0") },
  { name: "1", value: 1 },
  { name: "-1", value: -1 },
  { name: "1.5", value: 1.5 },
  { name: "1e308", value: parsed("1e308") },
  { name: "-1e308", value: parsed("-1e308") },
  { name: "5e-324 (smallest subnormal)", value: parsed("5e-324") },
  { name: "1e21 (exponent in String(n))", value: parsed("1e21") },
  { name: "1e-7 (exponent in String(n))", value: parsed("1e-7") },
  { name: "9007199254740993 (above MAX_SAFE_INTEGER)", value: parsed("9007199254740993") },
  // `JSON.parse` turns an out-of-range literal into an infinity; it is still a JSON.parse result.
  { name: "1e400 (parses to Infinity)", value: parsed("1e400") },
  { name: "-1e400 (parses to -Infinity)", value: parsed("-1e400") },

  // --- strings: empty, blank, look-alikes, Thai, odd code points, huge ------------------------------
  { name: 'empty string ""', value: "" },
  { name: "one space", value: " " },
  { name: "whitespace only (tab, LF, CR, NBSP, ideographic space)", value: "\t\n\r 　" },
  { name: "line separators only (U+2028, U+2029, NEL)", value: "  \u0085" },
  { name: "zero-width characters only", value: "​‌‍﻿" },
  { name: 'string "null"', value: "null" },
  { name: 'string "0"', value: "0" },
  { name: 'string "5"', value: "5" },
  { name: 'string "true"', value: "true" },
  { name: 'string "[]"', value: "[]" },
  { name: 'string "{}"', value: "{}" },
  { name: 'string "__proto__"', value: "__proto__" },
  { name: 'string "constructor"', value: "constructor" },
  { name: 'string "other"', value: "other" },
  { name: "Thai with spaces", value: "  ที่  " },
  { name: "family emoji", value: "👨‍👩‍👧‍👦" },
  { name: "lone high surrogate", value: parsed('"\\ud800"') },
  { name: "lone low surrogate", value: parsed('"\\udfff"') },
  { name: "NUL character", value: parsed('"\\u0000"') },
  { name: "right-to-left override", value: "‮abc" },
  { name: "combining marks only", value: "́̂̃" },
  { name: "date-like 2026-02-29", value: "2026-02-29" },
  { name: "date-time without offset", value: "2026-11-04T17:30:00" },
  { name: "date-time with T24:00", value: "2026-11-04T24:00:00Z" },
  { name: "1e21 as a string", value: "1e21" },
  { name: "huge ASCII string", value: "a".repeat(HOSTILE_LENGTH) },
  {
    name: "huge Thai string (combining marks)",
    value: "ที่".repeat(Math.floor(HOSTILE_LENGTH / 3)),
  },
  { name: "huge whitespace string", value: " ".repeat(HOSTILE_LENGTH) },

  // --- arrays ---------------------------------------------------------------------------------------
  { name: "empty array", value: [] },
  { name: "[null]", value: [null] },
  { name: "array of mixed types", value: parsed('[1, "a", null, true, {}, [], -0, 1e308]') },
  { name: "array of empty strings", value: ["", ""] },
  { name: "array of one option ID", value: ["Qm2xT8aLp0vW"] },
  { name: '["other"]', value: ["other"] },
  { name: "array of a repeated ID", value: ["Qm2xT8aLp0vW", "Qm2xT8aLp0vW"] },
  { name: "array of numbers", value: [1, 2, 3] },
  { name: "array of an empty array", value: [[]] },
  { name: "long array", value: Array.from({ length: HOSTILE_LENGTH }, () => "x") },
  { name: "10,000-deep nested array", value: deepArray(HOSTILE_DEPTH) },

  // --- objects --------------------------------------------------------------------------------------
  { name: "empty object", value: {} },
  { name: "object with one unknown key", value: { a: 1 } },
  { name: "object with an empty key", value: parsed('{"": 1}') },
  { name: "10,000-deep nested object", value: deepObject(HOSTILE_DEPTH) },
  {
    name: "own __proto__ key holding an object",
    value: parsed('{"__proto__": {"polluted": true, "optionIds": ["other"]}}'),
  },
  { name: "own __proto__ key holding null", value: parsed('{"__proto__": null}') },
  {
    name: "own constructor key",
    value: parsed('{"constructor": {"prototype": {"polluted": true}}}'),
  },
  {
    name: "own prototype-method keys",
    value: parsed('{"toString": 1, "valueOf": "x", "hasOwnProperty": null}'),
  },

  // --- wrong option-answer shapes (R14: { optionIds, other? }) --------------------------------------
  { name: "optionIds empty", value: { optionIds: [] } },
  { name: "optionIds as a bare string", value: { optionIds: "Qm2xT8aLp0vW" } },
  { name: "optionIds null", value: { optionIds: null } },
  { name: "optionIds of numbers", value: { optionIds: [1, 2] } },
  { name: "optionIds of nested arrays", value: { optionIds: [["Qm2xT8aLp0vW"]] } },
  { name: "optionIds of empty strings", value: { optionIds: ["", " "] } },
  {
    name: "optionIds as an array-like object",
    value: parsed('{"optionIds": {"0": "a", "length": 1}}'),
  },
  { name: "other selected, text null", value: { optionIds: ["other"], other: null } },
  { name: "other selected, text blank", value: { optionIds: ["other"], other: "  " } },
  { name: "other selected, text a number", value: { optionIds: ["other"], other: 5 } },
  { name: "other text without the selection", value: { optionIds: [], other: "x" } },
  { name: "other text only", value: { other: "TikTok" } },
  { name: "option answer with an extra key", value: { optionIds: ["Qm2xT8aLp0vW"], extra: 1 } },
  {
    name: "option answer with an own __proto__ key",
    value: parsed('{"optionIds": ["other"], "__proto__": {"other": "TikTok"}}'),
  },
]

/** The shared hostile-JSON corpus, deeply frozen. Read it; never mutate it. */
export const hostileJson: readonly HostileJson[] = deepFreeze(entries)

/** True when `value` is a JSON object (not `null`, not an array), as the corpus builds them. */
export function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
