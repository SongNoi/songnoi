import { describe, expect, it } from "vitest"
import {
  type AnswerSet,
  createFieldRegistry,
  type FormSchema,
  type Issue,
  parseFormSchema,
  storeAsOf,
  validateResponse,
} from "../../src/api"
import { textField } from "../../src/fields/text"
import { textareaField } from "../../src/fields/textarea"
import { HOSTILE_TIMEOUT_MS, hostileJson, isJsonObject } from "../fixtures/hostile-json"
import { expectIssues, parseIssues } from "../helpers/issues"

// T016 — the built-in `text` and `textarea` fields (spec US4, R10, R9; Edge cases "Empty", "Limits"
// and i18n; plan "Built-in fields", "Line breaks in `text`", "Text length"). Written before T018
// implements them. Proves:
//   AC15 — trimming, grapheme-counted `minLength` / `maxLength`, line breaks, `toCell`;
//   AC6  — text family analytics (`text` / `responses` / not groupable);
//   AC7  — stored values (the trimmed text as one value);
//   AC10 — text config rows through `parseFormSchema` (`invalid_range`, `too_small`,
//          `unknown_property`, each with its path);
//   AC13 — blank and whitespace-only text is unanswered (`required` when required, else omitted);
//   AC12 — the hostile-JSON corpus as answers and as `config`, never throwing;
//   AC8  — every failure goes through `expectIssues` / `parseIssues` (strict `issueSchema`).
// The text family has no config defaults (AC9 names none for it).
//
// Contract assumed (plan "Public API surface", "Module layout"): `src/fields/text.ts` exports
// `textField` (type `text`) and `src/fields/textarea.ts` exports `textareaField` (type
// `textarea`), both made with the public `defineField`. Config is the strict object
// `{ minLength?: int >= 0, maxLength?: int >= 1 }`; `minLength > maxLength` gives
// `invalid_range { min: minLength, max: maxLength }` at `["minLength"]` inside the config. The
// answer is a string; the normalised answer is the trimmed string.
//
// Shared test: runs in Node and in Chromium with identical expectations (the AC15 parity proof).
// Reads no locale, time zone or environment.

const registry = createFieldRegistry([textField, textareaField])

type Json = Record<string, unknown>
type TextType = "text" | "textarea"
type Result = ReturnType<typeof validateResponse>

const FIELD_ID = "k3Jx9aQ2mTzL"
const CONFIG_PATH = ["fields", 0, "config"] as const

/** A Thai one-language Form Schema candidate holding `fields`. */
function formOf(fields: readonly Json[]): Json {
  return { schemaVersion: 1, meta: { title: "แบบสอบถามความคิดเห็น", language: "th" }, fields }
}

/** One field entry of `type` with `extra` (config, required, …) applied. */
function entry(type: TextType, extra: Json = {}): Json {
  return { fieldId: FIELD_ID, type, label: "ความคิดเห็นของคุณ", ...extra }
}

/** Parses and asserts success; returns the parsed schema. */
function parsed(fields: readonly Json[]): FormSchema {
  const result = parseFormSchema(formOf(fields), registry)
  if (!result.ok) expect.fail(`expected a valid schema, got ${JSON.stringify(result.issues)}`)
  return result.schema
}

/** Parses one field entry and asserts failure with exactly `expected` (code, params, path). */
function expectConfigRejected(field: Json, expected: readonly Issue[]): void {
  const result = parseFormSchema(formOf([field]), registry)
  if (result.ok) expect.fail(`expected issues, got the schema ${JSON.stringify(result.schema)}`)
  expectIssues(result.issues, expected)
}

const at = (...path: readonly (string | number)[]): (string | number)[] => [...CONFIG_PATH, ...path]

function show(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 300)
  } catch {
    return String(value)
  }
}

/** Validates `value` as the answer of a one-field form of `type` with `config` / `required`. */
function answer(type: TextType, value: unknown, config?: Json, isRequired = true): Result {
  const schema = parsed([
    entry(type, { required: isRequired, ...(config === undefined ? {} : { config }) }),
  ])
  return validateResponse(schema, { [FIELD_ID]: value }, registry)
}

/** Asserts the answer is accepted and normalised to `normalised`. */
function expectAccepted(result: Result, normalised: string): void {
  if (!result.ok) expect.fail(`expected ok, got ${show(result)}`)
  expect(result.answers).toStrictEqual({ [FIELD_ID]: normalised })
}

/** Asserts the answer is refused with exactly `issues` in the field's group (paths inside it). */
function expectRefused(result: Result, issues: readonly Issue[]): void {
  if (result.ok) expect.fail(`expected a failure, got ${show(result)}`)
  expectIssues(result.answerSet, [])
  expect(Object.keys(result.fields)).toEqual([FIELD_ID])
  expectIssues(result.fields[FIELD_ID], issues)
}

/** Asserts an optional unanswered field is valid and left out of the normalised set. */
function expectOmitted(result: Result): void {
  if (!result.ok) expect.fail(`expected ok, got ${show(result)}`)
  expect(result.answers).toStrictEqual({})
}

const invalid: Issue = { code: "invalid", params: {}, path: [] }
const required: Issue = { code: "required", params: {}, path: [] }
const tooShort = (min: number): Issue => ({ code: "too_short", params: { min }, path: [] })
const tooLong = (max: number): Issue => ({ code: "too_long", params: { max }, path: [] })

const TYPES: readonly TextType[] = ["text", "textarea"]
const definitionOf = { text: textField, textarea: textareaField } as const

// --- AC15: trimming ------------------------------------------------------------------------------------

describe.each(TYPES)("AC15 %s: answers are trimmed", (type) => {
  it('"  hi  " becomes "hi"', () => {
    expectAccepted(answer(type, "  hi  "), "hi")
  })

  it('"  ที่  " becomes "ที่" (Thai kept verbatim, no normalisation)', () => {
    expectAccepted(answer(type, "  ที่  "), "ที่")
  })

  it("leading and trailing line breaks and tabs are trimmed too", () => {
    expectAccepted(answer(type, "\n\thi\r\n"), "hi")
  })

  it("inner spaces and tabs are kept", () => {
    expectAccepted(answer(type, "  a  b\tc  "), "a  b\tc")
  })

  it("decomposed text is not normalised (e + combining acute stays two code points)", () => {
    expectAccepted(answer(type, "e\u0301"), "e\u0301")
  })
})

// --- AC15: grapheme-counted limits, after trimming -----------------------------------------------------

describe.each(TYPES)("AC15 %s: length counts user-perceived characters after trimming", (type) => {
  // Each counts 1, so `maxLength: 1` accepts it and `minLength: 2` refuses it.
  const single: readonly { name: string; value: string; normalised: string }[] = [
    { name: "ที่ (3 code points)", value: "ที่", normalised: "ที่" },
    { name: '"  ที่  " (trimmed first)', value: "  ที่  ", normalised: "ที่" },
    { name: "👍🏽 (skin-tone modifier)", value: "👍🏽", normalised: "👍🏽" },
    { name: "👨‍👩‍👧‍👦 (ZWJ family, 7 code points)", value: "👨‍👩‍👧‍👦", normalised: "👨‍👩‍👧‍👦" },
    { name: "🇹🇭 (flag)", value: "🇹🇭", normalised: "🇹🇭" },
  ]

  it.each(single)("maxLength 1 accepts $name", ({ value, normalised }) => {
    expectAccepted(answer(type, value, { maxLength: 1 }), normalised)
  })

  it.each(single)("minLength 2 refuses $name with too_short {min: 2}", ({ value }) => {
    expectRefused(answer(type, value, { minLength: 2 }), [tooShort(2)])
  })

  it("สวัสดี (6 code points, 4 characters) passes maxLength 4 and fails maxLength 3", () => {
    expectAccepted(answer(type, "สวัสดี", { maxLength: 4 }), "สวัสดี")
    expectRefused(answer(type, "สวัสดี", { maxLength: 3 }), [tooLong(3)])
  })

  it("สวัสดี passes minLength 4 and fails minLength 5", () => {
    expectAccepted(answer(type, "สวัสดี", { minLength: 4 }), "สวัสดี")
    expectRefused(answer(type, "สวัสดี", { minLength: 5 }), [tooShort(5)])
  })

  it("กา counts 2: maxLength 1 refuses it, maxLength 2 accepts it", () => {
    expectRefused(answer(type, "กา", { maxLength: 1 }), [tooLong(1)])
    expectAccepted(answer(type, "กา", { maxLength: 2 }), "กา")
  })

  it("surrounding whitespace never counts: '   ab   ' passes maxLength 2", () => {
    expectAccepted(answer(type, "   ab   ", { maxLength: 2 }), "ab")
  })

  it("bounds are inclusive: minLength = maxLength = 2 accepts exactly two characters", () => {
    expectAccepted(answer(type, "ที่ที่", { minLength: 2, maxLength: 2 }), "ที่ที่")
    expectRefused(answer(type, "ที่", { minLength: 2, maxLength: 2 }), [tooShort(2)])
    expectRefused(answer(type, "ที่ที่ที่", { minLength: 2, maxLength: 2 }), [tooLong(2)])
  })

  it("with no limit set, any length is accepted", () => {
    const long = "ที่".repeat(5000)
    expectAccepted(answer(type, long), long)
  })
})

describe("AC15 textarea: an inner line break counts 1, sent as \\n or as \\r\\n", () => {
  it.each(["a\nb", "a\r\nb"])("%j counts 3: maxLength 3 accepts it, kept verbatim", (value) => {
    expectAccepted(answer("textarea", value, { maxLength: 3 }), value)
  })

  it.each(["a\nb", "a\r\nb"])("%j counts 3: maxLength 2 refuses it", (value) => {
    expectRefused(answer("textarea", value, { maxLength: 2 }), [tooLong(2)])
  })

  it.each(["a\nb", "a\r\nb"])("%j counts 3: minLength 4 refuses it", (value) => {
    expectRefused(answer("textarea", value, { minLength: 4 }), [tooShort(4)])
  })
})

// --- AC15: line breaks ------------------------------------------------------------------------------

// The ECMAScript LineTerminators (LF, CR, LS, PS) are line breaks; NEL, VT and FF are not (R10).
const LINE_BREAKS: readonly { name: string; value: string }[] = [
  { name: "LF", value: "a\nb" },
  { name: "CR", value: "a\rb" },
  { name: "CRLF", value: "a\r\nb" },
  { name: "LS (U+2028)", value: "a\u2028b" },
  { name: "PS (U+2029)", value: "a\u2029b" },
  { name: "two lines of Thai", value: "สวัสดี\nครับ" },
]

const NOT_LINE_BREAKS: readonly { name: string; value: string }[] = [
  { name: "NEL (U+0085)", value: "a\u0085b" },
  { name: "VT (U+000B)", value: "a\u000bb" },
  { name: "FF (U+000C)", value: "a\u000cb" },
  { name: "tab", value: "a\tb" },
]

describe("AC15 text: refuses inner line breaks, accepts NEL, VT and FF", () => {
  it.each(LINE_BREAKS)("an inner $name is invalid", ({ value }) => {
    expectRefused(answer("text", value), [invalid])
  })

  it.each(LINE_BREAKS)("an inner $name is invalid on an optional field too", ({ value }) => {
    expectRefused(answer("text", value, undefined, false), [invalid])
  })

  it.each(LINE_BREAKS)(
    "an inner $name is invalid also when padded with whitespace",
    ({ value }) => {
      expectRefused(answer("text", `  ${value}  `), [invalid])
    },
  )

  it.each(NOT_LINE_BREAKS)("an inner $name is accepted and kept verbatim", ({ value }) => {
    expectAccepted(answer("text", value), value)
  })

  it.each(["hi\n", "hi\r\n", "\nhi", "hi\u2028", "\u2029hi"])(
    "trim first: %j is accepted as hi",
    (value) => {
      expectAccepted(answer("text", value), "hi")
    },
  )

  it("NEL is not whitespace for trim(): a trailing NEL is kept", () => {
    expectAccepted(answer("text", "hi\u0085"), "hi\u0085")
  })
})

describe("AC15 textarea: keeps every line break verbatim", () => {
  it.each([...LINE_BREAKS, ...NOT_LINE_BREAKS])(
    "an inner $name is accepted and kept",
    ({ value }) => {
      expectAccepted(answer("textarea", value), value)
    },
  )

  it("CRLF is not rewritten to LF", () => {
    expectAccepted(answer("textarea", "  line 1\r\nline 2\r\n"), "line 1\r\nline 2")
  })
})

// --- AC15: wrong types ------------------------------------------------------------------------------

describe.each(TYPES)("AC15 %s: an answer that is not a string is invalid", (type) => {
  it.each([
    { name: "a number", value: 5 },
    { name: "zero", value: 0 },
    { name: "true", value: true },
    { name: "an array of one string", value: ["hi"] },
    { name: "an object", value: { text: "hi" } },
  ])("$name", ({ value }) => {
    expectRefused(answer(type, value), [invalid])
  })
})

// --- AC15: toCell ---------------------------------------------------------------------------------

describe.each(TYPES)("AC15 %s: toCell returns the trimmed text", (type) => {
  const definition = definitionOf[type]

  it.each([
    { value: "  hi  ", cell: "hi" },
    { value: "  ที่  ", cell: "ที่" },
    { value: "👨‍👩‍👧‍👦", cell: "👨‍👩‍👧‍👦" },
    { value: "=SUM(A1)", cell: "=SUM(A1)" },
  ])("$value gives the cell $cell (raw, never quoted here)", ({ value, cell }) => {
    const result = answer(type, value)
    if (!result.ok) return expect.fail(`expected ok, got ${show(result)}`)
    const normalised = result.answers[FIELD_ID]
    if (typeof normalised !== "string") return expect.fail("the normalised answer is a string")
    const config = definition.config.parse({})
    expect(definition.toCell(normalised, config)).toBe(cell)
  })

  it("the config does not change the cell", () => {
    expect(definition.toCell("ที่", definition.config.parse({ minLength: 1, maxLength: 9 }))).toBe(
      "ที่",
    )
  })
})

describe("AC15 textarea: toCell keeps inner line breaks", () => {
  it("a\\r\\nb stays a\\r\\nb", () => {
    expect(textareaField.toCell("a\r\nb", textareaField.config.parse({}))).toBe("a\r\nb")
  })
})

// --- AC6, AC7: analytics and stored values ---------------------------------------------------------------

describe.each(TYPES)("AC6 / AC7 %s: analytics and stored values", (type) => {
  const definition = definitionOf[type]

  it(`the definition has type ${type}`, () => {
    expect(definition.type).toBe(type)
  })

  it("AC6 storeAs text, summarize responses, not groupable (with and without limits)", () => {
    expect(storeAsOf(definition, definition.config.parse({}))).toBe("text")
    expect(storeAsOf(definition, definition.config.parse({ minLength: 1, maxLength: 5 }))).toBe(
      "text",
    )
    expect(definition.analytics.summarize).toBe("responses")
    expect(definition.analytics.groupable).toBe(false)
  })

  it("AC7 the stored values are the trimmed text, as one value", () => {
    const result = answer(type, "  สวัสดี  ")
    if (!result.ok) return expect.fail(`expected ok, got ${show(result)}`)
    const normalised = result.answers[FIELD_ID]
    if (typeof normalised !== "string") return expect.fail("the normalised answer is a string")
    expect(definition.storedValues(normalised, definition.config.parse({}))).toStrictEqual([
      "สวัสดี",
    ])
  })
})

// --- AC10: config rows through parseFormSchema ------------------------------------------------------------

describe.each(TYPES)("AC10 %s: config through parseFormSchema", (type) => {
  it("no config parses to an empty config (the text family has no defaults)", () => {
    const schema = parsed([entry(type)])
    expect(schema.fields[0]?.config).toStrictEqual({})
  })

  it("limits are kept as given and the output re-parses to an equal value", () => {
    const schema = parsed([entry(type, { config: { minLength: 0, maxLength: 1 } })])
    expect(schema.fields[0]?.config).toStrictEqual({ minLength: 0, maxLength: 1 })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("minLength = maxLength is accepted", () => {
    const schema = parsed([entry(type, { config: { minLength: 3, maxLength: 3 } })])
    expect(schema.fields[0]?.config).toStrictEqual({ minLength: 3, maxLength: 3 })
  })

  it("minLength > maxLength gives invalid_range {min, max} at minLength", () => {
    expectConfigRejected(entry(type, { config: { minLength: 5, maxLength: 3 } }), [
      { code: "invalid_range", params: { min: 5, max: 3 }, path: at("minLength") },
    ])
  })

  it("maxLength 0 gives too_small {min: 1} at maxLength", () => {
    expectConfigRejected(entry(type, { config: { maxLength: 0 } }), [
      { code: "too_small", params: { min: 1 }, path: at("maxLength") },
    ])
  })

  it("minLength -1 gives too_small {min: 0} at minLength", () => {
    expectConfigRejected(entry(type, { config: { minLength: -1 } }), [
      { code: "too_small", params: { min: 0 }, path: at("minLength") },
    ])
  })

  it("a non-integer limit gives not_integer at its path", () => {
    expectConfigRejected(entry(type, { config: { minLength: 1.5 } }), [
      { code: "not_integer", params: {}, path: at("minLength") },
    ])
    expectConfigRejected(entry(type, { config: { maxLength: 2.5 } }), [
      { code: "not_integer", params: {}, path: at("maxLength") },
    ])
  })

  it('a limit that is a string ("5") is invalid at its path', () => {
    expectConfigRejected(entry(type, { config: { maxLength: "5" } }), [
      { code: "invalid", params: {}, path: at("maxLength") },
    ])
  })

  it("an unknown config key gives unknown_property {key} at its path", () => {
    expectConfigRejected(entry(type, { config: { maxLength: 5, pattern: "^[a-z]+$" } }), [
      { code: "unknown_property", params: { key: "pattern" }, path: at("pattern") },
    ])
  })

  it("config null is invalid at the config path", () => {
    expectConfigRejected(entry(type, { config: null }), [
      { code: "invalid", params: {}, path: [...CONFIG_PATH] },
    ])
  })
})

// --- AC13: blank text is unanswered --------------------------------------------------------------------

describe.each(TYPES)("AC13 %s: blank and whitespace-only text is unanswered", (type) => {
  const blanks: readonly { name: string; value: string }[] = [
    { name: "empty string", value: "" },
    { name: "spaces", value: "   " },
    { name: "tabs and line breaks", value: "\t\r\n\n" },
    { name: "LS, PS, NBSP and ideographic space", value: "\u2028\u2029\u00a0\u3000" },
  ]

  it.each(blanks)("$name on a required field gives required", ({ value }) => {
    expectRefused(answer(type, value), [required])
  })

  it.each(blanks)("$name on an optional field is omitted", ({ value }) => {
    expectOmitted(answer(type, value, undefined, false))
  })

  it.each(blanks)(
    "$name on an optional field with minLength 2 is omitted, not too_short",
    ({ value }) => {
      expectOmitted(answer(type, value, { minLength: 2 }, false))
    },
  )

  it.each(blanks)("$name on a required field with minLength 2 gives required only", ({ value }) => {
    expectRefused(answer(type, value, { minLength: 2 }), [required])
  })

  it("a lone NEL is not blank (trim() keeps it): it is an answer", () => {
    expectAccepted(answer(type, "\u0085", undefined, false), "\u0085")
  })
})

// --- AC12: the hostile-JSON corpus -------------------------------------------------------------------

describe("AC12 text family: the hostile-JSON corpus never throws", () => {
  const LIMITS = { minLength: 2, maxLength: 5 }
  const hostileFields: readonly { fieldId: string; type: TextType; required: boolean }[] = [
    { fieldId: "textPlain", type: "text", required: true },
    { fieldId: "textLimits", type: "text", required: false },
    { fieldId: "areaPlain", type: "textarea", required: true },
    { fieldId: "areaLimits", type: "textarea", required: false },
  ]
  const hostileForm = parsed(
    hostileFields.map(({ fieldId, type, required }) => ({
      fieldId,
      type,
      label: "ข้อความ",
      required,
      ...(fieldId.endsWith("Limits") ? { config: LIMITS } : {}),
    })),
  )
  const answerCodes = new Set(["invalid", "too_short", "too_long"])

  it.each(hostileJson)(
    "AC12 as every text and textarea answer: $name",
    { timeout: HOSTILE_TIMEOUT_MS },
    ({ value }) => {
      const answers = Object.fromEntries(hostileFields.map(({ fieldId }) => [fieldId, value]))
      const result = validateResponse(hostileForm, answers, registry)
      const fields = result.ok ? {} : result.fields
      const normalised: AnswerSet = result.ok ? result.answers : {}
      if (!result.ok) {
        expectIssues(result.answerSet, [])
        for (const issues of Object.values(result.fields)) parseIssues(issues)
      }

      for (const { fieldId, required: isRequired } of hostileFields) {
        const issues = fields[fieldId]
        const blank = value === null || (typeof value === "string" && value.trim() === "")
        if (blank) {
          // Absent-like: `required` when required, else left out.
          if (isRequired) expectIssues(issues, [required])
          else expect(issues, fieldId).toBeUndefined()
          expect(Object.hasOwn(normalised, fieldId), fieldId).toBe(false)
        } else if (typeof value !== "string") {
          expectIssues(issues, [invalid])
        } else if (issues === undefined) {
          // Accepted: only when ok overall can we see it; then it is the trimmed text.
          if (result.ok) expect(normalised[fieldId], fieldId).toBe(value.trim())
        } else {
          for (const issue of parseIssues(issues)) {
            expect(answerCodes.has(issue.code), `${fieldId}: ${issue.code}`).toBe(true)
          }
        }
      }
    },
  )

  it.each(TYPES)("AC12 %s: every hostile value as config gives catalogue issues only", (type) => {
    for (const { name, value } of hostileJson) {
      const result = parseFormSchema(formOf([entry(type, { config: value })]), registry)
      if (!isJsonObject(value)) {
        if (result.ok) expect.fail(`${name}: a non-object config must be refused`)
        expectIssues(result.issues, [{ code: "invalid", params: {}, path: [...CONFIG_PATH] }])
        continue
      }
      const keys = Object.keys(value)
      if (keys.length === 0) {
        if (!result.ok) expect.fail(`${name}: {} is a valid config, got ${show(result.issues)}`)
        expect(result.schema.fields[0]?.config, name).toStrictEqual({})
        continue
      }
      // No corpus key is a text config key, so each one is an unknown property (strict config).
      if (result.ok) expect.fail(`${name}: unknown config keys must be refused`)
      expectIssues(
        result.issues,
        keys.map((key) => ({ code: "unknown_property", params: { key }, path: at(key) })),
      )
    }
  })
})
