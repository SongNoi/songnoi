import { describe, expect, expectTypeOf, it } from "vitest"
import type { FieldDefinition, FormSchema, Issue, StoreAs, Summarize } from "../src/index"
import * as api from "../src/index"
import { hostileJson, isJsonObject } from "./fixtures/hostile-json"
import { expectIssues, parseIssues } from "./helpers/issues"

// T032 — the final nine-field cross-check over `builtInFields`, imported from the package barrel
// (spec R3, R10–R17, R2, R5, R6, R8, R9; plan "Public API surface", "Module layout", Proof AC6,
// AC7, AC9, AC10, AC12, AC13). Written before T033 adds `builtInFields` and the nine named
// definitions to the barrel. Each row here is a cross-check over all nine, not a second copy of
// the family rows (Coverage ownership in tasks.md): the family tests (T016, T017, T020, T022, T024)
// own the hand-written defaults, codes and paths; this file loops one rule over the whole array.
//   barrel — `builtInFields` is a frozen, readonly array (not a registry) of the nine in brief §5
//            order (text, textarea, number, choice, checkbox, dropdown, date, rating; then file),
//            no type twice, each element the same object as its named export;
//   AC6    — `storeAs` (date both ways), `summarize`, `groupable` equal the spec table;
//            `groupable` is true for exactly choice, checkbox, dropdown, rating;
//   AC7    — stored values per built-in, of the declared kind (checkbox "Other" without the text,
//            choice "Other" → ["other"], two files → two text values, date-time → one datetime);
//   AC9    — each type parsed with no `config` (option fields: a minimal `options` list) gets its
//            definition's defaults and re-parses to an equal value;
//   AC13   — absent, `null` and each type's own blank value: `required` when required, omitted
//            when optional;
//   AC10   — an unknown config key gives `unknown_property` at its path, for all nine;
//   AC12   — the full hostile corpus as answers and as `config` through `parseFormSchema`, for all
//            nine: no throw, every issue in the catalogue (AC8 through `expectIssues` /
//            `parseIssues`).
//
// The barrel is read as a namespace (`api.builtInFields`), so before T033 each test fails on its
// own with "is not an array" / "undefined" instead of the whole file failing to load.
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment.

type Json = Record<string, unknown>
type Path = (string | number)[]

/** Brief §5 lists the first eight in this order; `file` (owner decision 6) is the ninth. */
const BRIEF_ORDER = [
  "text",
  "textarea",
  "number",
  "choice",
  "checkbox",
  "dropdown",
  "date",
  "rating",
  "file",
] as const
type BuiltInType = (typeof BRIEF_ORDER)[number]

/** The barrel name of each built-in definition (plan "Public API surface"). */
const EXPORT_NAMES: Readonly<Record<BuiltInType, string>> = {
  text: "textField",
  textarea: "textareaField",
  number: "numberField",
  choice: "choiceField",
  checkbox: "checkboxField",
  dropdown: "dropdownField",
  date: "dateField",
  rating: "ratingField",
  file: "fileField",
}

const OPTION_TYPES: readonly BuiltInType[] = ["choice", "checkbox", "dropdown"]

const FACEBOOK = "Qm2xT8aLp0vW"
const OTHER_LABEL = "อื่นๆ"
/** The smallest valid option config (R13: at least one option). */
const MINIMAL_OPTIONS: Json = { options: [{ id: FACEBOOK, label: "Facebook" }] }
const WITH_OTHER: Json = { ...MINIMAL_OPTIONS, allowOther: true, otherLabel: OTHER_LABEL }

/** The config a type needs to parse at all: option fields need `options`, the rest nothing. */
function minimalConfig(type: BuiltInType): Json | undefined {
  return OPTION_TYPES.includes(type) ? MINIMAL_OPTIONS : undefined
}

// --- barrel access (lazy, so a missing export fails each test, not the file) -------------------------

const exported: Readonly<Record<string, unknown>> = api

function builtIns(): readonly FieldDefinition[] {
  const value: unknown = exported.builtInFields
  if (!Array.isArray(value)) {
    return expect.fail(`the barrel must export builtInFields as an array, got ${show(value)}`)
  }
  return value as readonly FieldDefinition[]
}

function definitionOf(type: BuiltInType): FieldDefinition {
  const found = builtIns().find((definition) => definition.type === type)
  if (found === undefined) return expect.fail(`builtInFields has no ${type}`)
  return found
}

let cachedRegistry: api.FieldRegistry | undefined
/** One registry from the whole array, through the same public call a plugin uses. */
function registry(): api.FieldRegistry {
  cachedRegistry ??= api.createFieldRegistry(builtIns())
  return cachedRegistry
}

// --- form helpers -----------------------------------------------------------------------------------

const FIELD_ID = "Bt9-xQ2mLp0T"
const CONFIG_PATH = ["fields", 0, "config"] as const
const at = (...path: Path): Path => [...CONFIG_PATH, ...path]

function formOf(fields: readonly Json[]): Json {
  return { schemaVersion: 1, meta: { title: "แบบฟอร์มทดสอบ", language: "th" }, fields }
}

function entry(type: BuiltInType, extra: Json = {}, fieldId = FIELD_ID): Json {
  return { fieldId, type, label: "คำถาม", ...extra }
}

/** `entry` with the config given, or none at all when `config` is undefined. */
function entryWithConfig(type: BuiltInType, config: unknown, extra: Json = {}, fieldId = FIELD_ID) {
  return entry(type, config === undefined ? extra : { ...extra, config }, fieldId)
}

function parsed(fields: readonly Json[]): FormSchema {
  const result = api.parseFormSchema(formOf(fields), registry())
  if (!result.ok) return expect.fail(`expected a valid schema, got ${show(result.issues)}`)
  return result.schema
}

function show(value: unknown): string {
  try {
    // JSON.stringify returns undefined for undefined, functions and symbols, despite its type.
    const json = JSON.stringify(value) as string | undefined
    const text = json ?? String(value)
    return text.length > 300 ? `${text.slice(0, 300)}…` : text
  } catch {
    return String(value)
  }
}

const required: Issue = { code: "required", params: {}, path: [] }

// --- barrel: builtInFields and the nine named exports ------------------------------------------------

describe("builtInFields from the barrel (R3, ADR 0007 layout)", () => {
  it("is an array of the nine built-ins in brief §5 order, file last", () => {
    expect(builtIns().map(({ type }) => type)).toEqual([...BRIEF_ORDER])
  })

  it("holds no type twice", () => {
    const types = builtIns().map(({ type }) => type)
    expect(new Set(types).size).toBe(types.length)
    expect(types).toHaveLength(9)
  })

  it("is a frozen array, not a registry (no get, no types, not a Map)", () => {
    const value = builtIns()
    expect(Array.isArray(value)).toBe(true)
    expect(Object.isFrozen(value)).toBe(true)
    expect(value).not.toBeInstanceOf(Map)
    expect("get" in value).toBe(false)
    expect("types" in value).toBe(false)
  })

  it("is typed as a readonly array of field definitions", () => {
    // Compile-time only (checked by `pnpm typecheck`): a readonly array does not extend a mutable one.
    expectTypeOf(api.builtInFields).toExtend<readonly FieldDefinition[]>()
    expectTypeOf(api.builtInFields).not.toExtend<unknown[]>()
  })

  it.each(BRIEF_ORDER.map((type) => [EXPORT_NAMES[type], type] as const))(
    "the barrel exports %s, the same object as the %s entry of builtInFields",
    (name, type) => {
      const named = exported[name]
      expect(named, name).toBeDefined()
      expect(named).toBe(definitionOf(type))
      expect(Object.isFrozen(named)).toBe(true)
    },
  )

  it("registers through createFieldRegistry like a plugin, keeping the array order", () => {
    expect(registry().types).toEqual([...BRIEF_ORDER])
    for (const type of BRIEF_ORDER) expect(registry().get(type)).toBe(definitionOf(type))
  })

  it("each createFieldRegistry call over the array gives a new, independent registry", () => {
    expect(api.createFieldRegistry(builtIns())).not.toBe(api.createFieldRegistry(builtIns()))
  })
})

// --- AC6: analytics ----------------------------------------------------------------------------------

// The schema-section table of the spec, one row per type (date once per `includeTime`).
const ANALYTICS_ROWS: readonly (readonly [
  type: BuiltInType,
  storeAs: StoreAs,
  summarize: Summarize,
  groupable: boolean,
  config: Json | undefined,
])[] = [
  ["text", "text", "responses", false, undefined],
  ["textarea", "text", "responses", false, undefined],
  ["number", "number", "histogram+stats", false, undefined],
  ["choice", "text", "counts", true, MINIMAL_OPTIONS],
  ["checkbox", "text", "counts", true, MINIMAL_OPTIONS],
  ["dropdown", "text", "counts", true, MINIMAL_OPTIONS],
  ["date", "date", "timeline", false, { includeTime: false }],
  ["date", "datetime", "timeline", false, { includeTime: true }],
  ["rating", "number", "distribution+avg", true, undefined],
  ["file", "text", "count", false, undefined],
]

describe("AC6 analytics of all nine equal the spec table (cross-check)", () => {
  it("the table has a row for every built-in", () => {
    expect([...new Set(ANALYTICS_ROWS.map(([type]) => type))]).toEqual([...BRIEF_ORDER])
  })

  it.each(ANALYTICS_ROWS)(
    "AC6 %s: storeAs %s, summarize %s, groupable %s",
    (type, storeAs, summarize, groupable, config) => {
      const definition = definitionOf(type)
      const schema = parsed([entryWithConfig(type, config)])
      const parsedConfig = schema.fields[0]?.config
      if (parsedConfig === undefined) return expect.fail("one field parsed")
      expect(api.storeAsOf(definition, parsedConfig)).toBe(storeAs)
      expect(definition.analytics.summarize).toBe(summarize)
      expect(definition.analytics.groupable).toBe(groupable)
    },
  )

  it("AC6 groupable is true for exactly choice, checkbox, dropdown and rating", () => {
    const groupable = builtIns()
      .filter(({ analytics }) => analytics.groupable)
      .map(({ type }) => type)
    expect(groupable).toEqual(["choice", "checkbox", "dropdown", "rating"])
  })
})

// --- AC7: stored values ------------------------------------------------------------------------------

/** One stored value is of kind `kind` (R2): its JSON type and, for dates, its exact format. */
function isOfKind(value: unknown, kind: StoreAs): boolean {
  switch (kind) {
    case "text":
      return typeof value === "string"
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    case "datetime":
      return (
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      )
    case "none":
      return false
  }
}

const STORED_ROWS: readonly (readonly [
  type: BuiltInType,
  stored: readonly unknown[],
  kind: StoreAs,
  answer: unknown,
  config: Json | undefined,
])[] = [
  ["text", ["สวัสดีครับ"], "text", "  สวัสดีครับ  ", undefined],
  ["textarea", ["บรรทัดแรก\nบรรทัดสอง"], "text", "บรรทัดแรก\nบรรทัดสอง", undefined],
  ["number", [2.5], "number", 2.5, undefined],
  ["choice", ["other"], "text", { optionIds: ["other"], other: "TikTok" }, WITH_OTHER],
  [
    "checkbox",
    [FACEBOOK, "other"],
    "text",
    { optionIds: [FACEBOOK, "other"], other: "TikTok" },
    WITH_OTHER,
  ],
  ["dropdown", [FACEBOOK], "text", { optionIds: [FACEBOOK] }, MINIMAL_OPTIONS],
  ["date", ["2026-11-04"], "date", "2026-11-04", undefined],
  [
    "date",
    ["2026-11-04T10:30:00.000Z"],
    "datetime",
    "2026-11-04T17:30:00+07:00",
    { includeTime: true },
  ],
  ["rating", [4], "number", 4, undefined],
  [
    "file",
    ["upl_7Hq2xL9vR0aB", "upl_Q2mLp0TxZ9a"],
    "text",
    ["upl_7Hq2xL9vR0aB", "upl_Q2mLp0TxZ9a"],
    { maxFiles: 2 },
  ],
]

describe("AC7 stored values of all nine (cross-check)", () => {
  it("the list has a row for every built-in", () => {
    expect([...new Set(STORED_ROWS.map(([type]) => type))]).toEqual([...BRIEF_ORDER])
  })

  it.each(STORED_ROWS)(
    "AC7 %s stores %j, each of kind %s",
    (type, stored, kind, answer, config) => {
      const definition = definitionOf(type)
      const schema = parsed([entryWithConfig(type, config, { required: true })])
      const field = schema.fields[0]
      if (field === undefined) return expect.fail("one field parsed")
      const result = api.validateResponse(schema, { [FIELD_ID]: answer }, registry())
      if (!result.ok) return expect.fail(`expected ok, got ${show(result)}`)

      const values = definition.storedValues(result.answers[FIELD_ID], field.config)
      expect(values).toStrictEqual(stored)
      expect(api.storeAsOf(definition, field.config)).toBe(kind)
      for (const value of values) expect(isOfKind(value, kind), show(value)).toBe(true)
    },
  )

  it('AC7 the "Other" free text is never a stored value (checkbox and choice)', () => {
    for (const [type, , , answer, config] of STORED_ROWS.filter((row) => row[4] === WITH_OTHER)) {
      const schema = parsed([entryWithConfig(type, config)])
      const field = schema.fields[0]
      if (field === undefined) return expect.fail("one field parsed")
      const result = api.validateResponse(schema, { [FIELD_ID]: answer }, registry())
      if (!result.ok) return expect.fail(`expected ok, got ${show(result)}`)
      expect(definitionOf(type).storedValues(result.answers[FIELD_ID], field.config)).not.toContain(
        "TikTok",
      )
    }
  })
})

// --- AC9: defaults, one loop over all nine ------------------------------------------------------------

describe("AC9 every built-in parses with no config and re-parses equal (cross-check)", () => {
  it.each(BRIEF_ORDER)(
    "AC9 %s: defaults are its definition's, required false, re-parse equal",
    (type) => {
      const config = minimalConfig(type)
      const schema = parsed([entryWithConfig(type, config)])
      const field = schema.fields[0]
      if (field === undefined) return expect.fail("one field parsed")
      expect(field.required).toBe(false)
      expect(field.config).toStrictEqual(definitionOf(type).config.parse(config ?? {}))
      expect(api.parseFormSchema(schema, registry())).toStrictEqual({ ok: true, schema })
    },
  )

  it("AC9 every built-in but text and textarea writes at least one default in", () => {
    const withDefaults = BRIEF_ORDER.filter((type) => {
      const config = minimalConfig(type) ?? {}
      const field = parsed([entryWithConfig(type, minimalConfig(type))]).fields[0]
      if (field === undefined) return expect.fail("one field parsed")
      return Object.keys(field.config).some((key) => !Object.hasOwn(config, key))
    })
    expect(withDefaults).toEqual(BRIEF_ORDER.filter((t) => t !== "text" && t !== "textarea"))
  })

  it("AC9 all nine in one form, none with config beyond options, re-parse equal", () => {
    const fields = BRIEF_ORDER.map((type, index) =>
      entryWithConfig(type, minimalConfig(type), {}, `field_${index}`),
    )
    const schema = parsed(fields)
    expect(schema.fields.map(({ type }) => type)).toEqual([...BRIEF_ORDER])
    expect(api.parseFormSchema(schema, registry())).toStrictEqual({ ok: true, schema })
  })
})

// --- AC13: unanswered, required vs optional ----------------------------------------------------------

const ABSENT = Symbol("absent")

/** The type's own blank value(s) beyond absent and `null` (spec R9; ADR 0007 `isUnanswered`). */
const OWN_BLANK: Readonly<Record<BuiltInType, readonly unknown[]>> = {
  text: ["   "],
  textarea: [" \n\t "],
  number: [],
  choice: [{ optionIds: [] }],
  checkbox: [{ optionIds: [] }],
  dropdown: [{ optionIds: [] }],
  date: [],
  rating: [],
  file: [[]],
}

describe("AC13 unanswered values of all nine, required vs optional (cross-check)", () => {
  it("AC13 isUnanswered is declared by exactly text, textarea, the option fields and file", () => {
    const declaring = builtIns()
      .filter((definition) => definition.isUnanswered !== undefined)
      .map(({ type }) => type)
    expect(declaring).toEqual(BRIEF_ORDER.filter((type) => OWN_BLANK[type].length > 0))
  })

  it.each(BRIEF_ORDER)("AC13 %s: required gives required, optional is omitted", (type) => {
    const config = minimalConfig(type)
    for (const value of [ABSENT, null, ...OWN_BLANK[type]]) {
      const answers = value === ABSENT ? {} : { [FIELD_ID]: value }
      const label = value === ABSENT ? "absent" : show(value)

      const requiredForm = parsed([entryWithConfig(type, config, { required: true })])
      const refused = api.validateResponse(requiredForm, answers, registry())
      if (refused.ok) return expect.fail(`${label}: a required field must be refused`)
      expectIssues(refused.answerSet, [])
      expect(Object.keys(refused.fields), label).toEqual([FIELD_ID])
      expectIssues(refused.fields[FIELD_ID], [required])

      const optionalForm = parsed([entryWithConfig(type, config, { required: false })])
      const omitted = api.validateResponse(optionalForm, answers, registry())
      expect(omitted, label).toStrictEqual({ ok: true, answers: {} })
    }
  })

  it("AC13 all nine required and unanswered give nine required groups; optional, an empty set", () => {
    const blanks = BRIEF_ORDER.map((type) => OWN_BLANK[type][0] ?? null)
    const ids = BRIEF_ORDER.map((_type, index) => `field_${index}`)
    const answers = Object.fromEntries(ids.map((id, index) => [id, blanks[index]]))
    const fields = (isRequired: boolean) =>
      BRIEF_ORDER.map((type, index) =>
        entryWithConfig(type, minimalConfig(type), { required: isRequired }, ids[index]),
      )

    const refused = api.validateResponse(parsed(fields(true)), answers, registry())
    if (refused.ok) return expect.fail("nine unanswered required fields must be refused")
    expectIssues(refused.answerSet, [])
    expect(Object.keys(refused.fields).sort()).toEqual([...ids].sort())
    for (const id of ids) expectIssues(refused.fields[id], [required])

    expect(api.validateResponse(parsed(fields(false)), answers, registry())).toStrictEqual({
      ok: true,
      answers: {},
    })
  })
})

// --- AC10: unknown config key -------------------------------------------------------------------------

describe("AC10 an unknown config key, for all nine (cross-check)", () => {
  it.each(BRIEF_ORDER)('AC10 %s: "color": "red" gives unknown_property {key: color}', (type) => {
    const config = { ...minimalConfig(type), color: "red" }
    const result = api.parseFormSchema(formOf([entryWithConfig(type, config)]), registry())
    if (result.ok) return expect.fail(`${type}: an unknown config key must be refused`)
    expectIssues(result.issues, [
      { code: "unknown_property", params: { key: "color" }, path: at("color") },
    ])
  })
})

// --- AC12: the hostile corpus, as answers and as config, for all nine ---------------------------------

// Each type twice (required and optional), `date` also with time, option fields with "Other" on.
type HostileField = readonly [fieldId: string, type: BuiltInType, config: Json | undefined]
const HOSTILE_FIELDS: readonly HostileField[] = [
  ...BRIEF_ORDER.flatMap((type): HostileField[] => {
    const config = OPTION_TYPES.includes(type) ? WITH_OTHER : undefined
    return [
      [`${type}_required`, type, config],
      [`${type}_optional`, type, config],
    ]
  }),
  ["date_time_required", "date", { includeTime: true }],
]

describe("AC12 the hostile corpus never throws for any built-in (cross-check)", () => {
  function hostileForm(): FormSchema {
    return parsed(
      HOSTILE_FIELDS.map(([fieldId, type, config]) =>
        entryWithConfig(type, config, { required: fieldId.endsWith("_required") }, fieldId),
      ),
    )
  }

  it.each(hostileJson)("AC12 as the answer of every built-in field: $name", ({ value }) => {
    const schema = hostileForm()
    const answers = Object.fromEntries(HOSTILE_FIELDS.map(([fieldId]) => [fieldId, value]))
    const result = api.validateResponse(schema, answers, registry())

    if (result.ok) {
      // Every field accepted the value or left it out as unanswered; nothing else is in the set.
      for (const key of Object.keys(result.answers)) {
        expect(HOSTILE_FIELDS.map(([fieldId]) => fieldId)).toContain(key)
      }
      return
    }
    expectIssues(result.answerSet, [])
    for (const [fieldId, type] of HOSTILE_FIELDS) {
      const issues = result.fields[fieldId]
      if (issues !== undefined) {
        expect(parseIssues(issues).length, fieldId).toBeGreaterThan(0)
      }
      // `null` is unanswered for every type: `required` alone when required, omitted otherwise.
      if (value === null) {
        if (fieldId.endsWith("_required")) expectIssues(issues, [required])
        else expect(issues, `${type} ${fieldId}`).toBeUndefined()
      }
    }
  })

  it.each(BRIEF_ORDER)("AC12 %s: every hostile value as config gives catalogue issues", (type) => {
    for (const { name, value } of hostileJson) {
      const result = api.parseFormSchema(formOf([entry(type, { config: value })]), registry())
      if (!isJsonObject(value)) {
        if (result.ok) return expect.fail(`${name}: a non-object config must be refused`)
        expectIssues(result.issues, [{ code: "invalid", params: {}, path: at() }])
        continue
      }
      // No corpus key is a built-in config key, so each is an unknown property (strict configs);
      // option fields also miss `options`.
      const expected: Issue[] = [
        ...(OPTION_TYPES.includes(type)
          ? [{ code: "required", params: {}, path: at("options") } satisfies Issue]
          : []),
        ...Object.keys(value).map((key): Issue => ({
          code: "unknown_property",
          params: { key },
          path: at(key),
        })),
      ]
      if (expected.length === 0) {
        if (!result.ok) return expect.fail(`${name}: {} is a valid ${type} config`)
        continue
      }
      if (result.ok) return expect.fail(`${name}: must be refused for ${type}`)
      expectIssues(result.issues, expected)
    }
  })
})
