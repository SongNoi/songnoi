import { describe, expect, it } from "vitest"
import {
  createFieldRegistry,
  type FormSchema,
  type Issue,
  parseFormSchema,
  storeAsOf,
  validateResponse,
} from "../../src/api"
import { ratingField } from "../../src/fields/rating"
import { HOSTILE_TIMEOUT_MS, hostileJson, isJsonObject } from "../fixtures/hostile-json"
import { expectIssues, parseIssues } from "../helpers/issues"

// T017 — the built-in `rating` field (spec US4, R12; Edge cases "Empty", "Limits"; plan "Built-in
// fields"; owner decisions 2026-11-05: groupable, `max` change incompatible). Written before T019
// implements it. Proves:
//   AC17 — config defaults and errors, answer errors, `toCell(4)` is `"4"`;
//   AC9  — `max` 5 and `icon` `star` written in, re-parsing to an equal value;
//   AC10 — rating config rows with codes and paths (`max` 1 / 11 / 4.5, unknown key `color`);
//   AC29 — the rating rule's direct rows: `ratingField.incompatibleChanges` gives `["max"]` for a
//          `max` change and `[]` for an `icon`-only change, called without `?.` (the call
//          typechecks only because `defineField` keeps a provided rule non-optional, P03);
//   AC6  — `number` / `distribution+avg` / groupable;
//   AC7  — the stored value is the number;
//   AC12 — the hostile-JSON corpus as answers and as `config`, never throwing;
//   AC8  — every failure goes through `expectIssues` / `parseIssues` (strict `issueSchema`).
//
// Contract assumed: `src/fields/rating.ts` exports `ratingField` (type `rating`), made with the
// public `defineField`. Config is the strict object `{ max: int 2–10 = 5, icon: "star" | "heart" =
// "star" }`; the answer is an integer 1 … `max`, normalised to itself.
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment.

const registry = createFieldRegistry([ratingField])

type Json = Record<string, unknown>
type Result = ReturnType<typeof validateResponse>

const FIELD_ID = "k3Jx9aQ2mTzL"
const CONFIG_PATH = ["fields", 0, "config"] as const

function formOf(fields: readonly Json[]): Json {
  return { schemaVersion: 1, meta: { title: "แบบสอบถามความพึงพอใจ", language: "th" }, fields }
}

function entry(extra: Json = {}): Json {
  return { fieldId: FIELD_ID, type: "rating", label: "ให้คะแนนบริการ", ...extra }
}

function parsed(fields: readonly Json[]): FormSchema {
  const result = parseFormSchema(formOf(fields), registry)
  if (!result.ok) expect.fail(`expected a valid schema, got ${JSON.stringify(result.issues)}`)
  return result.schema
}

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

function answer(value: unknown, config?: Json, isRequired = true): Result {
  const schema = parsed([
    entry({ required: isRequired, ...(config === undefined ? {} : { config }) }),
  ])
  return validateResponse(schema, { [FIELD_ID]: value }, registry)
}

function expectAccepted(result: Result, normalised: number): void {
  if (!result.ok) expect.fail(`expected ok, got ${show(result)}`)
  expect(result.answers).toStrictEqual({ [FIELD_ID]: normalised })
}

function expectRefused(result: Result, issues: readonly Issue[]): void {
  if (result.ok) expect.fail(`expected a failure, got ${show(result)}`)
  expectIssues(result.answerSet, [])
  expect(Object.keys(result.fields)).toEqual([FIELD_ID])
  expectIssues(result.fields[FIELD_ID], issues)
}

const invalid: Issue = { code: "invalid", params: {}, path: [] }
const required: Issue = { code: "required", params: {}, path: [] }
const notInteger: Issue = { code: "not_integer", params: {}, path: [] }
const tooSmall = (min: number): Issue => ({ code: "too_small", params: { min }, path: [] })
const tooBig = (max: number): Issue => ({ code: "too_big", params: { max }, path: [] })

const MAXES = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const

// --- AC9 / AC17: defaults -------------------------------------------------------------------------

describe("AC9 / AC17 rating: the built-in defaults are written in", () => {
  it("no config gets max 5 and icon star, and the output re-parses to an equal value", () => {
    const schema = parsed([entry()])
    expect(schema.fields[0]?.config).toStrictEqual({ max: 5, icon: "star" })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("only max given: icon star is written in", () => {
    const schema = parsed([entry({ config: { max: 10 } })])
    expect(schema.fields[0]?.config).toStrictEqual({ max: 10, icon: "star" })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("only icon given: max 5 is written in", () => {
    const schema = parsed([entry({ config: { icon: "heart" } })])
    expect(schema.fields[0]?.config).toStrictEqual({ max: 5, icon: "heart" })
  })

  it.each(MAXES)("max %i is accepted (range 2–10)", (max) => {
    const schema = parsed([entry({ config: { max } })])
    expect(schema.fields[0]?.config).toStrictEqual({ max, icon: "star" })
  })
})

// --- AC10 / AC17: config errors ------------------------------------------------------------------

describe("AC10 / AC17 rating: config errors through parseFormSchema", () => {
  it("max 1 gives too_small {min: 2} at max", () => {
    expectConfigRejected(entry({ config: { max: 1 } }), [
      { code: "too_small", params: { min: 2 }, path: at("max") },
    ])
  })

  it("max 11 gives too_big {max: 10} at max", () => {
    expectConfigRejected(entry({ config: { max: 11 } }), [
      { code: "too_big", params: { max: 10 }, path: at("max") },
    ])
  })

  it("max 4.5 gives not_integer at max", () => {
    expectConfigRejected(entry({ config: { max: 4.5 } }), [
      { code: "not_integer", params: {}, path: at("max") },
    ])
  })

  it("max 0 gives too_small {min: 2} at max", () => {
    expectConfigRejected(entry({ config: { max: 0 } }), [
      { code: "too_small", params: { min: 2 }, path: at("max") },
    ])
  })

  it('max "5" is invalid at max', () => {
    expectConfigRejected(entry({ config: { max: "5" } }), [
      { code: "invalid", params: {}, path: at("max") },
    ])
  })

  it('icon "thumb" is invalid at icon', () => {
    expectConfigRejected(entry({ config: { icon: "thumb" } }), [
      { code: "invalid", params: {}, path: at("icon") },
    ])
  })

  it('{ "max": 5, "color": "red" } gives unknown_property {key: "color"} at color', () => {
    expectConfigRejected(entry({ config: { max: 5, color: "red" } }), [
      { code: "unknown_property", params: { key: "color" }, path: at("color") },
    ])
  })

  it("a minimum is not configurable: min gives unknown_property", () => {
    expectConfigRejected(entry({ config: { min: 0 } }), [
      { code: "unknown_property", params: { key: "min" }, path: at("min") },
    ])
  })
})

// --- AC17: answers ---------------------------------------------------------------------------------

describe("AC17 rating: answers", () => {
  it.each([1, 2, 3, 4, 5])("%i is valid with the default max 5", (value) => {
    expectAccepted(answer(value), value)
  })

  it("0 gives too_small {min: 1}", () => {
    expectRefused(answer(0), [tooSmall(1)])
  })

  it("-1 gives too_small {min: 1}", () => {
    expectRefused(answer(-1), [tooSmall(1)])
  })

  it.each(MAXES)("with max %i: max is valid, max + 1 gives too_big {max}", (max) => {
    expectAccepted(answer(max, { max }), max)
    expectRefused(answer(max + 1, { max }), [tooBig(max)])
  })

  it("3.5 gives not_integer", () => {
    expectRefused(answer(3.5), [notInteger])
  })

  it('"4" is invalid', () => {
    expectRefused(answer("4"), [invalid])
  })

  it('"" is invalid, not unanswered, on a required field', () => {
    expectRefused(answer(""), [invalid])
  })

  it('"" is invalid, not unanswered, on an optional field too', () => {
    expectRefused(answer("", undefined, false), [invalid])
  })

  it("null is unanswered: required gives required, optional is omitted", () => {
    expectRefused(answer(null), [required])
    const optional = answer(null, undefined, false)
    if (!optional.ok) return expect.fail(`expected ok, got ${show(optional)}`)
    expect(optional.answers).toStrictEqual({})
  })

  it("the icon does not change which answers are valid", () => {
    expectAccepted(answer(5, { icon: "heart" }), 5)
    expectRefused(answer(6, { icon: "heart" }), [tooBig(5)])
  })
})

// --- AC17: toCell ------------------------------------------------------------------------------------

describe("AC17 rating: toCell writes the integer", () => {
  it('toCell(4) is "4"', () => {
    expect(ratingField.toCell(4, ratingField.config.parse({}))).toBe("4")
  })

  it.each(MAXES)("toCell(%i) with max 10 is the plain integer", (value) => {
    expect(ratingField.toCell(value, ratingField.config.parse({ max: 10 }))).toBe(String(value))
  })

  it('toCell(1) is "1" whatever the icon', () => {
    expect(ratingField.toCell(1, ratingField.config.parse({ icon: "heart" }))).toBe("1")
  })
})

// --- AC29: the answer-compatibility rule, called directly --------------------------------------------

describe("AC29 rating: incompatibleChanges (called directly, no ?.)", () => {
  it('a max change (5 to 10) returns ["max"]', () => {
    expect(
      ratingField.incompatibleChanges({ max: 5, icon: "star" }, { max: 10, icon: "star" }),
    ).toStrictEqual(["max"])
  })

  it('a max change the other way (10 to 5) returns ["max"]', () => {
    expect(
      ratingField.incompatibleChanges({ max: 10, icon: "star" }, { max: 5, icon: "star" }),
    ).toStrictEqual(["max"])
  })

  it("an icon-only change (star to heart) returns []", () => {
    expect(
      ratingField.incompatibleChanges({ max: 5, icon: "star" }, { max: 5, icon: "heart" }),
    ).toStrictEqual([])
  })

  it('max and icon both changed returns only ["max"] (icon is always compatible)', () => {
    expect(
      ratingField.incompatibleChanges({ max: 5, icon: "star" }, { max: 7, icon: "heart" }),
    ).toStrictEqual(["max"])
  })

  it("no change returns []", () => {
    expect(
      ratingField.incompatibleChanges({ max: 5, icon: "star" }, { max: 5, icon: "star" }),
    ).toStrictEqual([])
  })

  it("works on parsed configs (defaults written in)", () => {
    const previous = ratingField.config.parse({})
    expect(
      ratingField.incompatibleChanges(previous, ratingField.config.parse({ max: 10 })),
    ).toEqual(["max"])
    expect(
      ratingField.incompatibleChanges(previous, ratingField.config.parse({ icon: "heart" })),
    ).toEqual([])
  })
})

// --- AC6, AC7: analytics and stored values ---------------------------------------------------------------

describe("AC6 / AC7 rating: analytics and stored values", () => {
  it("the definition has type rating", () => {
    expect(ratingField.type).toBe("rating")
  })

  it("AC6 storeAs number, summarize distribution+avg, groupable", () => {
    expect(storeAsOf(ratingField, ratingField.config.parse({}))).toBe("number")
    expect(storeAsOf(ratingField, ratingField.config.parse({ max: 10, icon: "heart" }))).toBe(
      "number",
    )
    expect(ratingField.analytics.summarize).toBe("distribution+avg")
    expect(ratingField.analytics.groupable).toBe(true)
  })

  it("AC7 the stored values of 4 are [4]", () => {
    expect(ratingField.storedValues(4, ratingField.config.parse({}))).toStrictEqual([4])
  })
})

// --- AC12: the hostile-JSON corpus -------------------------------------------------------------------

describe("AC12 rating: the hostile-JSON corpus never throws", () => {
  const hostileForm = parsed([
    { fieldId: "five", type: "rating", label: "คะแนน", required: true },
    { fieldId: "ten", type: "rating", label: "คะแนน", config: { max: 10, icon: "heart" } },
  ])
  const maxOf = { five: 5, ten: 10 } as const
  const numberCodes = new Set(["too_small", "too_big", "not_integer"])

  it.each(hostileJson)(
    "AC12 as every rating answer: $name",
    { timeout: HOSTILE_TIMEOUT_MS },
    ({ value }) => {
      const result = validateResponse(hostileForm, { five: value, ten: value }, registry)
      if (!result.ok) {
        expectIssues(result.answerSet, [])
        for (const issues of Object.values(result.fields)) parseIssues(issues)
      }
      const fields = result.ok ? {} : result.fields

      if (value === null) {
        expectIssues(fields.five, [required])
        expect(fields.ten).toBeUndefined()
        return
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        expectIssues(fields.five, [invalid])
        expectIssues(fields.ten, [invalid])
        return
      }
      for (const fieldId of ["five", "ten"] as const) {
        const valid = Number.isInteger(value) && value >= 1 && value <= maxOf[fieldId]
        const issues = fields[fieldId]
        if (valid) {
          expect(issues, fieldId).toBeUndefined()
        } else {
          if (issues === undefined)
            return expect.fail(`${fieldId}: ${String(value)} must be refused`)
          for (const issue of parseIssues(issues)) {
            expect(numberCodes.has(issue.code), `${fieldId}: ${issue.code}`).toBe(true)
          }
        }
      }
    },
  )

  it("AC12 every hostile value as config gives catalogue issues only", () => {
    for (const { name, value } of hostileJson) {
      const result = parseFormSchema(formOf([entry({ config: value })]), registry)
      if (!isJsonObject(value)) {
        if (result.ok) expect.fail(`${name}: a non-object config must be refused`)
        expectIssues(result.issues, [{ code: "invalid", params: {}, path: [...CONFIG_PATH] }])
        continue
      }
      const keys = Object.keys(value)
      if (keys.length === 0) {
        if (!result.ok) expect.fail(`${name}: {} is a valid config, got ${show(result.issues)}`)
        expect(result.schema.fields[0]?.config, name).toStrictEqual({ max: 5, icon: "star" })
        continue
      }
      // No corpus key is a rating config key, so each one is an unknown property (strict config).
      if (result.ok) expect.fail(`${name}: unknown config keys must be refused`)
      expectIssues(
        result.issues,
        keys.map((key) => ({ code: "unknown_property", params: { key }, path: at(key) })),
      )
    }
  })
})
