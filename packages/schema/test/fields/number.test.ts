import { describe, expect, it } from "vitest"
import {
  createFieldRegistry,
  type FormSchema,
  type Issue,
  parseFormSchema,
  storeAsOf,
  validateResponse,
} from "../../src/api"
import { numberField } from "../../src/fields/number"
import { HOSTILE_TIMEOUT_MS, hostileJson, isJsonObject } from "../fixtures/hostile-json"
import { expectIssues, parseIssues } from "../helpers/issues"

// T017 — the built-in `number` field (spec US4, R11; Edge cases "Empty", "Limits", i18n; plan
// "Built-in fields", "Number cells: plain decimal, never an exponent"). Written before T019
// implements it. Proves:
//   AC16 — decimals by default, `not_integer` with `integer`, inclusive bounds, `min` = `max`,
//          `"5"` and `""` are `invalid`; plain-decimal cells (named rows, the power-of-ten sweep and
//          a seeded 10,000-double sweep: plain-decimal pattern and an exact round trip);
//   AC9  — the `integer` false default, written in, re-parsing to an equal value;
//   AC6  — `number` / `histogram+stats` / not groupable;
//   AC7  — the stored value is the number;
//   AC10 — config rows (`invalid_range`, unknown key) with their paths;
//   AC12 — the hostile-JSON corpus as answers and as `config`, never throwing;
//   AC8  — every failure goes through `expectIssues` / `parseIssues` (strict `issueSchema`).
//
// Contract assumed: `src/fields/number.ts` exports `numberField` (type `number`), made with the
// public `defineField`. Config is the strict object `{ min?: number, max?: number, integer: boolean
// = false }`; `min > max` gives `invalid_range { min, max }` at `["min"]` inside the config. The
// answer is a finite JSON number; the normalised answer is that number. The cell helper is internal
// (`toPlainDecimal`), so cells are tested through `numberField.toCell`.
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment; the random
// sweep uses a fixed seed, so both engines check the same 10,000 numbers on every run.

const registry = createFieldRegistry([numberField])

type Json = Record<string, unknown>
type Result = ReturnType<typeof validateResponse>

const FIELD_ID = "Vb7-pL0wQe4R"
const CONFIG_PATH = ["fields", 0, "config"] as const

function formOf(fields: readonly Json[]): Json {
  return { schemaVersion: 1, meta: { title: "แบบสำรวจรายได้", language: "th" }, fields }
}

function entry(extra: Json = {}): Json {
  return { fieldId: FIELD_ID, type: "number", label: "จำนวนสมาชิกในครอบครัว", ...extra }
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

const defaultConfig = numberField.config.parse({})
const cell = (n: number): string => numberField.toCell(n, defaultConfig)

// --- AC16: answers ---------------------------------------------------------------------------------

describe("AC16 number: answers", () => {
  it("accepts 2.5 by default (decimals allowed unless integer is set)", () => {
    expectAccepted(answer(2.5), 2.5)
  })

  it.each([0, -1, 1234.5, -0.25, 1e-7, 1e21, 1e308, -1e308, 5e-324])(
    "accepts the finite number %d with no config",
    (value) => {
      expectAccepted(answer(value), value)
    },
  )

  it("with integer: 2 and -3 are valid, 2.5 gives not_integer", () => {
    expectAccepted(answer(2, { integer: true }), 2)
    expectAccepted(answer(-3, { integer: true }), -3)
    expectRefused(answer(2.5, { integer: true }), [notInteger])
  })

  it("bounds are inclusive: min 0, max 10 accept 0, 10 and 5.5", () => {
    const bounds = { min: 0, max: 10 }
    expectAccepted(answer(0, bounds), 0)
    expectAccepted(answer(10, bounds), 10)
    expectAccepted(answer(5.5, bounds), 5.5)
  })

  it("below min gives too_small {min}, above max gives too_big {max}", () => {
    const bounds = { min: 0, max: 10 }
    expectRefused(answer(-0.5, bounds), [tooSmall(0)])
    expectRefused(answer(10.5, bounds), [tooBig(10)])
  })

  it("negative bounds: min -5, max -1", () => {
    const bounds = { min: -5, max: -1 }
    expectAccepted(answer(-5, bounds), -5)
    expectAccepted(answer(-1, bounds), -1)
    expectRefused(answer(-6, bounds), [tooSmall(-5)])
    expectRefused(answer(0, bounds), [tooBig(-1)])
  })

  it("only one bound set: the other side is open", () => {
    expectAccepted(answer(1e308, { min: 1 }), 1e308)
    expectRefused(answer(0, { min: 1 }), [tooSmall(1)])
    expectAccepted(answer(-1e308, { max: 1 }), -1e308)
    expectRefused(answer(2, { max: 1 }), [tooBig(1)])
  })

  it("min = max allows exactly that number", () => {
    const bounds = { min: 3, max: 3 }
    expectAccepted(answer(3, bounds), 3)
    expectRefused(answer(2, bounds), [tooSmall(3)])
    expectRefused(answer(4, bounds), [tooBig(3)])
  })

  it("integer with bounds: each rule gives its own code", () => {
    const config = { min: 1, max: 10, integer: true }
    expectAccepted(answer(10, config), 10)
    expectRefused(answer(2.5, config), [notInteger])
    expectRefused(answer(11, config), [tooBig(10)])
    expectRefused(answer(0, config), [tooSmall(1)])
  })

  it.each([
    { name: 'the numeric string "5"', value: "5" },
    { name: 'a grouped string "1,000"', value: "1,000" },
    { name: 'Thai digits "๑๒๓"', value: "๑๒๓" },
    { name: "true", value: true },
    { name: "[5]", value: [5] },
    { name: "an object", value: { value: 5 } },
  ])("$name is invalid", ({ value }) => {
    expectRefused(answer(value), [invalid])
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
})

// --- AC16: plain-decimal cells ---------------------------------------------------------------------

/** Every cell must match this (plan "Number cells"): no exponent, no grouping, no trailing zeros. */
const PLAIN_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/

describe("AC16 number: toCell writes plain decimal, never an exponent", () => {
  const rows: readonly { name: string; n: number; cell: string }[] = [
    { name: "1234.5", n: 1234.5, cell: "1234.5" },
    { name: "-0.25", n: -0.25, cell: "-0.25" },
    { name: "1e21", n: 1e21, cell: "1000000000000000000000" },
    { name: "-1e21", n: -1e21, cell: "-1000000000000000000000" },
    { name: "1e-7", n: 1e-7, cell: "0.0000001" },
    { name: "-1.5e-10", n: -1.5e-10, cell: "-0.00000000015" },
    { name: "1.2345e21", n: 1.2345e21, cell: "1234500000000000000000" },
    { name: "0", n: 0, cell: "0" },
    { name: "-0", n: -0, cell: "0" },
    { name: "42", n: 42, cell: "42" },
    { name: "0.1", n: 0.1, cell: "0.1" },
    { name: "1e-6 (already plain in String(n))", n: 1e-6, cell: "0.000001" },
    {
      name: "123456789012345680000 (just below 1e21)",
      n: 1.2345678901234568e20,
      cell: "123456789012345680000",
    },
    { name: "Number.MAX_SAFE_INTEGER", n: Number.MAX_SAFE_INTEGER, cell: "9007199254740991" },
    {
      name: "Number.MAX_VALUE (309 digits)",
      n: Number.MAX_VALUE,
      cell: `17976931348623157${"0".repeat(292)}`,
    },
    {
      name: "-Number.MAX_VALUE",
      n: -Number.MAX_VALUE,
      cell: `-17976931348623157${"0".repeat(292)}`,
    },
    {
      name: "Number.MIN_VALUE (0., 323 zeros, 5)",
      n: Number.MIN_VALUE,
      cell: `0.${"0".repeat(323)}5`,
    },
  ]

  it.each(rows)("$name gives $cell", ({ n, cell: expected }) => {
    expect(cell(n)).toBe(expected)
  })

  it("Number.MAX_VALUE has 309 digits and Number.MIN_VALUE 323 zeros after the point", () => {
    expect(cell(Number.MAX_VALUE)).toHaveLength(309)
    expect(cell(Number.MIN_VALUE)).toHaveLength(2 + 323 + 1)
  })

  it("the config does not change the cell", () => {
    const config = numberField.config.parse({ min: -1e30, max: 1e30, integer: true })
    expect(numberField.toCell(1e21, config)).toBe("1000000000000000000000")
  })
})

/** Checks one cell: plain decimal, sign iff negative, reads back as exactly `n`. */
function cellProblem(n: number): string | undefined {
  const text = cell(n)
  if (!PLAIN_DECIMAL.test(text)) return `${String(n)} -> ${text}: not plain decimal`
  if (text.startsWith("-") !== n < 0) return `${String(n)} -> ${text}: wrong sign`
  if (Number(text) !== n) return `${String(n)} -> ${text}: reads back as ${String(Number(text))}`
  return undefined
}

/** mulberry32: a tiny deterministic PRNG, so every run and both engines see the same numbers. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}

/** `count` finite doubles built from random 64-bit patterns (all exponents and signs). */
function randomDoubles(seed: number, count: number): number[] {
  const next = mulberry32(seed)
  const view = new DataView(new ArrayBuffer(8))
  const out: number[] = []
  while (out.length < count) {
    view.setUint32(0, next())
    view.setUint32(4, next())
    const n = view.getFloat64(0)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

describe("AC16 number: cell sweeps (plain decimal and an exact round trip)", () => {
  it("every power of ten from 1e-323 to 1e308", () => {
    const problems: string[] = []
    for (let exponent = -323; exponent <= 308; exponent += 1) {
      const n = Number(`1e${exponent}`)
      const problem = cellProblem(n) ?? cellProblem(-n)
      if (problem !== undefined) problems.push(problem)
    }
    expect(problems.slice(0, 10)).toEqual([])
  })

  it("10,000 finite doubles from seeded random bit patterns", () => {
    const doubles = randomDoubles(0x5eed_0017, 10_000)
    // The bit patterns really spread over the range: huge, tiny and both signs are present.
    expect(doubles.some((n) => Math.abs(n) >= 1e21)).toBe(true)
    expect(doubles.some((n) => n !== 0 && Math.abs(n) < 1e-7)).toBe(true)
    expect(doubles.some((n) => n < 0)).toBe(true)
    const problems: string[] = []
    for (const n of doubles) {
      const problem = cellProblem(n)
      if (problem !== undefined) problems.push(problem)
    }
    expect(problems.slice(0, 10)).toEqual([])
  })

  it("subnormals and the edges of the normal range", () => {
    const edges = [
      Number.MIN_VALUE,
      2 * Number.MIN_VALUE,
      2.2250738585072014e-308, // smallest normal
      2.225073858507201e-308, // largest subnormal
      Number.EPSILON,
      Number.MAX_SAFE_INTEGER + 2,
      2 ** 70,
      0.1 + 0.2,
      1 / 3,
    ]
    const problems = edges.flatMap((n) => [cellProblem(n), cellProblem(-n)]).filter(Boolean)
    expect(problems).toEqual([])
  })
})

// --- AC9: the integer default ---------------------------------------------------------------------

describe("AC9 number: the built-in default is written in", () => {
  it("no config gets integer false, and the output re-parses to an equal value", () => {
    const schema = parsed([entry()])
    expect(schema.fields[0]?.config).toStrictEqual({ integer: false })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("bounds without integer get integer false next to them", () => {
    const schema = parsed([entry({ config: { min: 1, max: 9 } })])
    expect(schema.fields[0]?.config).toStrictEqual({ min: 1, max: 9, integer: false })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("an explicit integer true is kept", () => {
    const schema = parsed([entry({ config: { integer: true } })])
    expect(schema.fields[0]?.config).toStrictEqual({ integer: true })
  })
})

// --- AC10: config rows -------------------------------------------------------------------------------

describe("AC10 number: config through parseFormSchema", () => {
  it("min = max is accepted", () => {
    const schema = parsed([entry({ config: { min: 3, max: 3 } })])
    expect(schema.fields[0]?.config).toStrictEqual({ min: 3, max: 3, integer: false })
  })

  it("decimal and negative bounds are accepted", () => {
    const schema = parsed([entry({ config: { min: -2.5, max: 0.5 } })])
    expect(schema.fields[0]?.config).toStrictEqual({ min: -2.5, max: 0.5, integer: false })
  })

  it("min > max gives invalid_range {min, max} at min", () => {
    expectConfigRejected(entry({ config: { min: 5, max: 1 } }), [
      { code: "invalid_range", params: { min: 5, max: 1 }, path: at("min") },
    ])
  })

  it.each(["step", "precision", "unit"])(
    "the unknown config key %s gives unknown_property {key} at its path",
    (key) => {
      expectConfigRejected(entry({ config: { min: 0, [key]: 1 } }), [
        { code: "unknown_property", params: { key }, path: at(key) },
      ])
    },
  )

  it('a bound that is a string ("0") is invalid at its path', () => {
    expectConfigRejected(entry({ config: { min: "0" } }), [
      { code: "invalid", params: {}, path: at("min") },
    ])
  })

  it('integer "yes" is invalid at its path', () => {
    expectConfigRejected(entry({ config: { integer: "yes" } }), [
      { code: "invalid", params: {}, path: at("integer") },
    ])
  })
})

// --- AC6, AC7: analytics and stored values ---------------------------------------------------------------

describe("AC6 / AC7 number: analytics and stored values", () => {
  it("the definition has type number", () => {
    expect(numberField.type).toBe("number")
  })

  it("AC6 storeAs number, summarize histogram+stats, not groupable", () => {
    expect(storeAsOf(numberField, defaultConfig)).toBe("number")
    expect(storeAsOf(numberField, numberField.config.parse({ integer: true }))).toBe("number")
    expect(numberField.analytics.summarize).toBe("histogram+stats")
    expect(numberField.analytics.groupable).toBe(false)
  })

  it.each([2.5, 0, -1e21, 1e-7])("AC7 the stored values of %d are that one number", (n) => {
    expect(numberField.storedValues(n, defaultConfig)).toStrictEqual([n])
  })
})

// --- AC12: the hostile-JSON corpus -------------------------------------------------------------------

describe("AC12 number: the hostile-JSON corpus never throws", () => {
  const hostileForm = parsed([
    { fieldId: "plain", type: "number", label: "ตัวเลข", required: true },
    {
      fieldId: "bounded",
      type: "number",
      label: "ตัวเลข",
      config: { min: 0, max: 10, integer: true },
    },
  ])
  const boundedCodes = new Set(["too_small", "too_big", "not_integer"])

  it.each(hostileJson)(
    "AC12 as every number answer: $name",
    { timeout: HOSTILE_TIMEOUT_MS },
    ({ value }) => {
      const result = validateResponse(hostileForm, { plain: value, bounded: value }, registry)
      if (!result.ok) {
        expectIssues(result.answerSet, [])
        for (const issues of Object.values(result.fields)) parseIssues(issues)
      }
      const fields = result.ok ? {} : result.fields

      if (value === null) {
        expectIssues(fields.plain, [required])
        expect(fields.bounded).toBeUndefined()
        return
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        expectIssues(fields.plain, [invalid])
        expectIssues(fields.bounded, [invalid])
        return
      }
      // A finite number: always valid without config, and its cell is plain decimal.
      expect(fields.plain).toBeUndefined()
      expect(cellProblem(value)).toBeUndefined()
      if (fields.bounded !== undefined) {
        for (const issue of parseIssues(fields.bounded)) {
          expect(boundedCodes.has(issue.code), issue.code).toBe(true)
        }
      } else {
        expect(Number.isInteger(value) && value >= 0 && value <= 10).toBe(true)
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
        expect(result.schema.fields[0]?.config, name).toStrictEqual({ integer: false })
        continue
      }
      // No corpus key is a number config key, so each one is an unknown property (strict config).
      if (result.ok) expect.fail(`${name}: unknown config keys must be refused`)
      expectIssues(
        result.issues,
        keys.map((key) => ({ code: "unknown_property", params: { key }, path: at(key) })),
      )
    }
  })
})
