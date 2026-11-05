import { describe, expect, it } from "vitest"
import * as z from "zod"
import {
  customIssue,
  FieldDefinitionError,
  type Issue,
  type IssueCode,
  issueSchema,
  toIssues,
} from "../src/core/issues"
import { expectIssues, parseIssues } from "./helpers/issues"

// T005 — the error catalogue (spec R4, plan "Error-code catalogue", ADR 0012 decision 2).
// Shared test: runs in Node and in Chromium; reads no locale, time zone or environment.

type ParamsOf<C extends IssueCode> = Extract<Issue, { code: C }>["params"]
type Context = "schema" | "answer"

// R4's 29 codes, in the order the spec lists them.
const R4_CODES = [
  // values and config
  "required",
  "invalid",
  "too_short",
  "too_long",
  "too_small",
  "too_big",
  "not_integer",
  "too_few",
  "too_many",
  "invalid_range",
  "duplicate",
  "unknown_option",
  "other_text_required",
  "invalid_date",
  "offset_required",
  // answer set
  "unknown_field",
  // Form Schema
  "unsupported_schema_version",
  "unknown_property",
  "unknown_field_type",
  "duplicate_field_id",
  "duplicate_option_id",
  "reserved_id",
  // version history
  "field_type_changed",
  "field_kind_changed",
  "field_config_incompatible",
  // definitions, registry and export
  "invalid_field_type",
  "duplicate_field_type",
  "incompatible_analytics",
  "invalid_time_zone",
] as const

// One valid params object per code. The mapped type makes `pnpm typecheck` fail if `IssueCode`
// has a code missing here (missing key) or lacks one listed here (excess key), and if a code's
// params type differs from R4's.
const SAMPLE_PARAMS = {
  required: {},
  invalid: {},
  too_short: { min: 2 },
  too_long: { max: 4 },
  too_small: { min: 1 },
  too_big: { max: 10 },
  not_integer: {},
  too_few: { min: 1 },
  too_many: { max: 1 },
  invalid_range: { min: 3, max: 2 },
  duplicate: { value: "Qm2xT8aLp0vW" },
  unknown_option: { optionId: "other" },
  other_text_required: {},
  invalid_date: {},
  offset_required: {},
  unknown_field: { fieldId: "__proto__" },
  unsupported_schema_version: { found: 2 },
  unknown_property: { key: "color" },
  unknown_field_type: { type: "acme/signature" },
  duplicate_field_id: { fieldId: "q1" },
  duplicate_option_id: { optionId: "c9Rk_4NnYb1E" },
  reserved_id: { id: "other" },
  field_type_changed: { fieldId: "q1", previousType: "text", type: "number", version: 1 },
  field_kind_changed: {
    fieldId: "q2",
    type: "date",
    previousStoreAs: "date",
    storeAs: "datetime",
    version: 2,
  },
  field_config_incompatible: { fieldId: "q3", type: "rating", properties: ["max"], version: 3 },
  invalid_field_type: { type: "my type" },
  duplicate_field_type: { type: "rating" },
  incompatible_analytics: { storeAs: "none", summarize: "responses" },
  invalid_time_zone: { timeZone: "Mars/Base" },
} satisfies { [C in IssueCode]: ParamsOf<C> }

const CODES = Object.keys(SAMPLE_PARAMS) as IssueCode[]

function sampleIssue(code: IssueCode, path: Issue["path"] = []): Issue {
  return { code, params: SAMPLE_PARAMS[code], path } as Issue
}

// Wrong-typed values per param name (R4 / plan catalogue table: numbers for limits and versions,
// strings for IDs, keys, types and zones, `string | number` for `duplicate.value`,
// `number | string | null` for `found`, `string[]` for `properties`).
const WRONG_PARAM_VALUES: Readonly<Record<string, readonly unknown[]>> = {
  min: ["2", null, true],
  max: ["2", null, true],
  value: [true, null, ["a"], {}],
  optionId: [1, null],
  fieldId: [1, null],
  found: [true, {}, [2]],
  key: [1, null],
  type: [1, null],
  id: [1, null],
  previousType: [1, null],
  version: ["1", null],
  previousStoreAs: [1, null],
  storeAs: [1, null],
  summarize: [1, null],
  properties: ["max", [1], null],
  timeZone: [1, null],
}

const paramRows = CODES.flatMap((code) =>
  Object.keys(SAMPLE_PARAMS[code]).map((param) => ({ code, param })),
)

describe("AC8: issueSchema is exactly R4's closed catalogue of 29 codes", () => {
  it("AC8: lists R4's 29 codes, each once, and nothing else", () => {
    const codes = issueSchema.options.map((option) => option.shape.code.value)
    expect(R4_CODES).toHaveLength(29)
    expect(new Set(codes).size).toBe(codes.length)
    expect([...codes].sort()).toStrictEqual([...R4_CODES].sort())
    expect([...CODES].sort()).toStrictEqual([...R4_CODES].sort())
  })

  it.each(CODES)(
    "AC8: accepts `%s` with its R4 params, at the root and at a nested path",
    (code) => {
      for (const path of [[], ["fields", 0, "config", "options", 1, "color"]]) {
        const issue = { code, params: SAMPLE_PARAMS[code], path }
        const parsed = issueSchema.safeParse(issue)
        expect(parsed.success).toBe(true)
        expect(parsed.data).toStrictEqual(issue)
      }
    },
  )

  it.each(CODES)("AC8: refuses `%s` with a `message` key (no display text)", (code) => {
    expect(issueSchema.safeParse({ ...sampleIssue(code), message: "Required" }).success).toBe(false)
  })

  it.each(CODES)("AC8: refuses `%s` with any extra top-level key (strict)", (code) => {
    expect(issueSchema.safeParse({ ...sampleIssue(code), input: "x" }).success).toBe(false)
    expect(issueSchema.safeParse({ ...sampleIssue(code), fieldId: "q1" }).success).toBe(false)
  })

  it.each(CODES)("AC8: refuses `%s` with an extra params key (strict params)", (code) => {
    const issue = { code, params: { ...SAMPLE_PARAMS[code], extra: 1 }, path: [] }
    expect(issueSchema.safeParse(issue).success).toBe(false)
  })

  it.each(CODES)("AC8: refuses `%s` without `params` or without `path`", (code) => {
    expect(issueSchema.safeParse({ code, path: [] }).success).toBe(false)
    expect(issueSchema.safeParse({ code, params: SAMPLE_PARAMS[code] }).success).toBe(false)
  })

  it.each(CODES)("AC8: refuses `%s` with a malformed path", (code) => {
    for (const path of ["fields", null, {}, [true], [null], [["a"]], [{}]]) {
      const issue = { code, params: SAMPLE_PARAMS[code], path }
      expect(issueSchema.safeParse(issue).success, `path ${JSON.stringify(path)}`).toBe(false)
    }
  })

  it.each(paramRows)("AC8: refuses `$code` without its `$param` param", ({ code, param }) => {
    const params = Object.fromEntries(
      Object.entries(SAMPLE_PARAMS[code]).filter(([key]) => key !== param),
    )
    expect(issueSchema.safeParse({ code, params, path: [] }).success).toBe(false)
  })

  it.each(paramRows)("AC8: refuses `$code` with a wrong-typed `$param`", ({ code, param }) => {
    const wrongValues = WRONG_PARAM_VALUES[param]
    expect(wrongValues, `no wrong values listed for ${param}`).toBeDefined()
    for (const wrong of wrongValues ?? []) {
      const issue = { code, params: { ...SAMPLE_PARAMS[code], [param]: wrong }, path: [] }
      expect(issueSchema.safeParse(issue).success, `${param}: ${JSON.stringify(wrong)}`).toBe(false)
    }
  })

  it("AC8: `duplicate` takes a string or a number as `value`", () => {
    expectIssues(
      [
        { code: "duplicate", params: { value: "a" }, path: [0] },
        { code: "duplicate", params: { value: 3 }, path: ["earlier", 1, "version"] },
      ],
      [
        { code: "duplicate", params: { value: "a" }, path: [0] },
        { code: "duplicate", params: { value: 3 }, path: ["earlier", 1, "version"] },
      ],
    )
  })

  it("AC8: `unsupported_schema_version` takes a number, a string or null as `found`", () => {
    for (const found of [0, 2, "1", null]) {
      const issue = { code: "unsupported_schema_version", params: { found }, path: [] }
      expect(issueSchema.safeParse(issue).success, JSON.stringify(found)).toBe(true)
    }
  })

  it("AC8: `field_config_incompatible` takes an empty or multi-entry `properties` list", () => {
    for (const properties of [[], ["max", "icon"]]) {
      const issue = {
        code: "field_config_incompatible",
        params: { fieldId: "q3", type: "rating", properties, version: 1 },
        path: ["fields", 0],
      }
      expect(issueSchema.safeParse(issue).success).toBe(true)
    }
  })

  it("AC8: refuses codes outside R4 (Zod's own codes, display text, other case)", () => {
    const outside: unknown[] = [
      "custom",
      "invalid_type",
      "unrecognized_keys",
      "invalid_value",
      "message",
      "Required",
      "REQUIRED",
      "too_small_x",
      "",
      0,
      null,
      undefined,
    ]
    for (const code of outside) {
      expect(issueSchema.safeParse({ code, params: {}, path: [] }).success, String(code)).toBe(
        false,
      )
    }
    expect(issueSchema.safeParse({ params: {}, path: [] }).success).toBe(false)
  })

  it("AC8: refuses values that are not issue objects", () => {
    for (const value of [null, undefined, "required", 1, [], ["required", {}, []]]) {
      expect(issueSchema.safeParse(value).success, JSON.stringify(value)).toBe(false)
    }
  })
})

describe("AC8: expectIssues helper enforces the strict catalogue", () => {
  it("AC8: passes for catalogue issues in any order", () => {
    const a = sampleIssue("too_short", ["label"])
    const b = sampleIssue("unknown_field", [])
    expect(() => {
      expectIssues([a, b], [b, a])
    }).not.toThrow()
  })

  it("AC8: fails on a `message` key, a code outside R4, wrong params or a different path", () => {
    const ok = sampleIssue("required", ["title"])
    expect(() => parseIssues([{ ...ok, message: "Required" }])).toThrow()
    expect(() => parseIssues([{ code: "custom", params: {}, path: [] }])).toThrow()
    expect(() => parseIssues([{ code: "too_short", params: {}, path: [] }])).toThrow()
    expect(() => parseIssues("required")).toThrow()
    expect(() => {
      expectIssues([ok], [sampleIssue("required", ["label"])])
    }).toThrow()
    expect(() => {
      expectIssues([ok, ok], [ok])
    }).toThrow()
  })
})

// --- Zod -> catalogue mapping ------------------------------------------------------------------

function mapped(schema: z.ZodType, input: unknown, context: Context): unknown {
  const result = schema.safeParse(input, { reportInput: true })
  expect(result.success, "the fixture schema must refuse the input").toBe(false)
  if (result.success) return []
  return toIssues(result.error.issues, context)
}

interface MappingRow {
  readonly name: string
  readonly schema: z.ZodType
  readonly input: unknown
  readonly schemaContext: readonly Issue[]
  readonly answerContext: readonly Issue[]
}

// One entry per row of the plan's mapping table (and the rows' edge cases); each fixture schema
// was chosen so Zod 4.6 emits exactly the Zod issue the row names.
const MAPPING_ROWS: readonly MappingRow[] = [
  {
    name: "`invalid_type`, input `undefined` (missing key) -> schema `required` / answer `invalid`",
    schema: z.strictObject({ title: z.string() }),
    input: {},
    schemaContext: [{ code: "required", params: {}, path: ["title"] }],
    answerContext: [{ code: "invalid", params: {}, path: ["title"] }],
  },
  {
    name: "`invalid_type`, missing key in a nested object keeps the full path",
    schema: z.strictObject({ meta: z.strictObject({ title: z.string() }) }),
    input: { meta: {} },
    schemaContext: [{ code: "required", params: {}, path: ["meta", "title"] }],
    answerContext: [{ code: "invalid", params: {}, path: ["meta", "title"] }],
  },
  {
    name: "`invalid_type`, input `null` is a wrong type, not missing -> `invalid`",
    schema: z.strictObject({ title: z.string() }),
    input: { title: null },
    schemaContext: [{ code: "invalid", params: {}, path: ["title"] }],
    answerContext: [{ code: "invalid", params: {}, path: ["title"] }],
  },
  {
    name: '`invalid_type`, `expected: "int"` (`z.int()`) -> `not_integer`',
    schema: z.int(),
    input: 4.5,
    schemaContext: [{ code: "not_integer", params: {}, path: [] }],
    answerContext: [{ code: "not_integer", params: {}, path: [] }],
  },
  {
    name: '`invalid_type`, `expected: "int"` (`z.number().int()`, rating `max` 4.5) -> `not_integer`',
    schema: z.strictObject({ max: z.number().int().min(2).max(10) }),
    input: { max: 4.5 },
    schemaContext: [{ code: "not_integer", params: {}, path: ["max"] }],
    answerContext: [{ code: "not_integer", params: {}, path: ["max"] }],
  },
  {
    name: "other `invalid_type` (string for a number) -> `invalid`",
    schema: z.strictObject({ n: z.number() }),
    input: { n: "5" },
    schemaContext: [{ code: "invalid", params: {}, path: ["n"] }],
    answerContext: [{ code: "invalid", params: {}, path: ["n"] }],
  },
  {
    name: "other `invalid_type` (string for `z.int()`, Zod expects `number`) -> `invalid`",
    schema: z.int(),
    input: "5",
    schemaContext: [{ code: "invalid", params: {}, path: [] }],
    answerContext: [{ code: "invalid", params: {}, path: [] }],
  },
  {
    name: "other `invalid_type` inside an array keeps the element index",
    schema: z.array(z.string()),
    input: ["a", 1],
    schemaContext: [{ code: "invalid", params: {}, path: [1] }],
    answerContext: [{ code: "invalid", params: {}, path: [1] }],
  },
  {
    name: "other `invalid_type` (array given for an object) -> `invalid`",
    schema: z.strictObject({ optionIds: z.array(z.string()) }),
    input: [],
    schemaContext: [{ code: "invalid", params: {}, path: [] }],
    answerContext: [{ code: "invalid", params: {}, path: [] }],
  },
  {
    name: "`too_small`, origin `string` -> `too_short {min}`",
    schema: z.strictObject({ label: z.string().min(2) }),
    input: { label: "a" },
    schemaContext: [{ code: "too_short", params: { min: 2 }, path: ["label"] }],
    answerContext: [{ code: "too_short", params: { min: 2 }, path: ["label"] }],
  },
  {
    name: "`too_big`, origin `string` -> `too_long {max}`",
    schema: z.string().max(2),
    input: "abc",
    schemaContext: [{ code: "too_long", params: { max: 2 }, path: [] }],
    answerContext: [{ code: "too_long", params: { max: 2 }, path: [] }],
  },
  {
    name: "`too_small`, origin `number` (rating `max` 1) -> `too_small {min}`",
    schema: z.strictObject({ max: z.int().min(2).max(10) }),
    input: { max: 1 },
    schemaContext: [{ code: "too_small", params: { min: 2 }, path: ["max"] }],
    answerContext: [{ code: "too_small", params: { min: 2 }, path: ["max"] }],
  },
  {
    name: "`too_big`, origin `number` (rating `max` 11) -> `too_big {max}`",
    schema: z.strictObject({ max: z.int().min(2).max(10) }),
    input: { max: 11 },
    schemaContext: [{ code: "too_big", params: { max: 10 }, path: ["max"] }],
    answerContext: [{ code: "too_big", params: { max: 10 }, path: ["max"] }],
  },
  {
    name: "`too_small`, origin `array` -> `too_few {min}`",
    schema: z.strictObject({ options: z.array(z.string()).min(1) }),
    input: { options: [] },
    schemaContext: [{ code: "too_few", params: { min: 1 }, path: ["options"] }],
    answerContext: [{ code: "too_few", params: { min: 1 }, path: ["options"] }],
  },
  {
    name: "`too_big`, origin `array` -> `too_many {max}`",
    schema: z.array(z.string()).max(1),
    input: ["a", "b"],
    schemaContext: [{ code: "too_many", params: { max: 1 }, path: [] }],
    answerContext: [{ code: "too_many", params: { max: 1 }, path: [] }],
  },
  {
    name: "`too_small`, origin `set` -> `too_few {min}`",
    schema: z.set(z.string()).min(1),
    input: new Set<string>(),
    schemaContext: [{ code: "too_few", params: { min: 1 }, path: [] }],
    answerContext: [{ code: "too_few", params: { min: 1 }, path: [] }],
  },
  {
    name: "`too_big`, origin `set` -> `too_many {max}`",
    schema: z.set(z.string()).max(1),
    input: new Set(["a", "b"]),
    schemaContext: [{ code: "too_many", params: { max: 1 }, path: [] }],
    answerContext: [{ code: "too_many", params: { max: 1 }, path: [] }],
  },
  {
    name: "`unrecognized_keys` at the root -> schema one `unknown_property` per key / answer one `invalid`",
    schema: z.strictObject({ max: z.number() }),
    input: { max: 5, color: "red", size: 2 },
    schemaContext: [
      { code: "unknown_property", params: { key: "color" }, path: ["color"] },
      { code: "unknown_property", params: { key: "size" }, path: ["size"] },
    ],
    answerContext: [{ code: "invalid", params: {}, path: [] }],
  },
  {
    name: "`unrecognized_keys` in a nested option entry -> path = object path + key",
    schema: z.strictObject({
      options: z.array(z.strictObject({ id: z.string(), label: z.string() })),
    }),
    input: {
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B", color: "red" },
      ],
    },
    schemaContext: [
      { code: "unknown_property", params: { key: "color" }, path: ["options", 1, "color"] },
    ],
    answerContext: [{ code: "invalid", params: {}, path: ["options", 1] }],
  },
  {
    name: "`unrecognized_keys` with a prototype-looking key (`__proto__` own key from JSON.parse)",
    schema: z.strictObject({ optionIds: z.array(z.string()) }),
    input: JSON.parse('{"optionIds":[],"__proto__":{"x":1}}') as unknown,
    schemaContext: [
      { code: "unknown_property", params: { key: "__proto__" }, path: ["__proto__"] },
    ],
    answerContext: [{ code: "invalid", params: {}, path: [] }],
  },
  {
    name: "`custom` with a catalogue code (`customIssue` via `.refine`) -> that code and params",
    schema: z.string().refine(() => false, customIssue("too_short", { min: 2 })),
    input: "a",
    schemaContext: [{ code: "too_short", params: { min: 2 }, path: [] }],
    answerContext: [{ code: "too_short", params: { min: 2 }, path: [] }],
  },
  {
    name: "`custom` with a catalogue code and a refine `path` -> that code at that path",
    schema: z
      .strictObject({ minSelections: z.number(), maxSelections: z.number() })
      .refine((config) => config.minSelections <= config.maxSelections, {
        ...customIssue("invalid_range", { min: 3, max: 2 }),
        path: ["minSelections"],
      }),
    input: { minSelections: 3, maxSelections: 2 },
    schemaContext: [{ code: "invalid_range", params: { min: 3, max: 2 }, path: ["minSelections"] }],
    answerContext: [{ code: "invalid_range", params: { min: 3, max: 2 }, path: ["minSelections"] }],
  },
  {
    name: "`custom` with a catalogue code raised in `.superRefine` -> that code at that path",
    schema: z.strictObject({ other: z.string().optional() }).superRefine((value, ctx) => {
      ctx.addIssue({
        code: "custom",
        input: value,
        path: ["other"],
        ...customIssue("other_text_required", {}),
      })
    }),
    input: {},
    schemaContext: [{ code: "other_text_required", params: {}, path: ["other"] }],
    answerContext: [{ code: "other_text_required", params: {}, path: ["other"] }],
  },
  {
    name: "`custom` with a catalogue code that is also a context-sensitive code stays unchanged",
    schema: z.unknown().refine(() => false, customIssue("unknown_property", { key: "color" })),
    input: {},
    schemaContext: [{ code: "unknown_property", params: { key: "color" }, path: [] }],
    answerContext: [{ code: "unknown_property", params: { key: "color" }, path: [] }],
  },
  {
    name: "`custom` without a catalogue code (plain `.refine`) -> `invalid`",
    schema: z.string().refine(() => false),
    input: "a",
    schemaContext: [{ code: "invalid", params: {}, path: [] }],
    answerContext: [{ code: "invalid", params: {}, path: [] }],
  },
  {
    name: "anything else: `invalid_value` (`z.literal`) -> `invalid`",
    schema: z.strictObject({ schemaVersion: z.literal(1) }),
    input: { schemaVersion: 2 },
    schemaContext: [{ code: "invalid", params: {}, path: ["schemaVersion"] }],
    answerContext: [{ code: "invalid", params: {}, path: ["schemaVersion"] }],
  },
  {
    name: "anything else: `invalid_value` (`z.enum`) -> `invalid`",
    schema: z.strictObject({ icon: z.enum(["star", "heart"]) }),
    input: { icon: "moon" },
    schemaContext: [{ code: "invalid", params: {}, path: ["icon"] }],
    answerContext: [{ code: "invalid", params: {}, path: ["icon"] }],
  },
  {
    name: "anything else: `invalid_format` (regex) -> `invalid`",
    schema: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    input: "has space",
    schemaContext: [{ code: "invalid", params: {}, path: [] }],
    answerContext: [{ code: "invalid", params: {}, path: [] }],
  },
  {
    name: "anything else: `invalid_union` -> one `invalid`, nested union errors not expanded",
    schema: z.strictObject({ value: z.union([z.string(), z.number()]) }),
    input: { value: true },
    schemaContext: [{ code: "invalid", params: {}, path: ["value"] }],
    answerContext: [{ code: "invalid", params: {}, path: ["value"] }],
  },
  {
    name: "anything else: `not_multiple_of` -> `invalid`",
    schema: z.number().multipleOf(2),
    input: 3,
    schemaContext: [{ code: "invalid", params: {}, path: [] }],
    answerContext: [{ code: "invalid", params: {}, path: [] }],
  },
  {
    name: "anything else: `invalid_key` (record key) -> `invalid` at the key's path",
    schema: z.record(z.string().regex(/^a/), z.number()),
    input: { b: 1 },
    schemaContext: [{ code: "invalid", params: {}, path: ["b"] }],
    answerContext: [{ code: "invalid", params: {}, path: ["b"] }],
  },
  {
    name: "several Zod issues in one parse -> every one mapped, none dropped",
    schema: z.strictObject({ title: z.string(), label: z.string().max(3), max: z.int() }),
    input: { label: "long", max: 1.5, extra: true },
    schemaContext: [
      { code: "required", params: {}, path: ["title"] },
      { code: "too_long", params: { max: 3 }, path: ["label"] },
      { code: "not_integer", params: {}, path: ["max"] },
      { code: "unknown_property", params: { key: "extra" }, path: ["extra"] },
    ],
    answerContext: [
      { code: "invalid", params: {}, path: ["title"] },
      { code: "too_long", params: { max: 3 }, path: ["label"] },
      { code: "not_integer", params: {}, path: ["max"] },
      { code: "invalid", params: {}, path: [] },
    ],
  },
]

describe("AC8: Zod issues map to catalogue codes (`toIssues`, plan mapping table)", () => {
  describe.each(MAPPING_ROWS)("$name", (row) => {
    it("AC8: in the `schema` context", () => {
      expectIssues(mapped(row.schema, row.input, "schema"), row.schemaContext)
    })

    it("AC8: in the `answer` context", () => {
      expectIssues(mapped(row.schema, row.input, "answer"), row.answerContext)
    })
  })

  it.each<Context>(["schema", "answer"])(
    "AC8: drops Zod's `input` and `message`, leaving only code, params and path (%s)",
    (context) => {
      const schema = z.strictObject({ title: z.string(), n: z.number().min(1) })
      const issues = parseIssues(mapped(schema, { n: 0, x: 1 }, context))
      expect(issues.length).toBeGreaterThan(0)
      for (const issue of issues) {
        expect(Object.keys(issue).sort()).toStrictEqual(["code", "params", "path"])
      }
    },
  )

  it.each<Context>(["schema", "answer"])(
    "AC8: an empty list of Zod issues maps to an empty list (%s)",
    (context) => {
      expectIssues(toIssues([], context), [])
    },
  )
})

// --- customIssue -------------------------------------------------------------------------------

// `customIssue` is typed for catalogue codes; JavaScript plugins can still pass anything, so the
// runtime fallback is exercised through an untyped alias.
const untypedCustomIssue = customIssue as unknown as (
  code: unknown,
  params?: unknown,
) => ReturnType<typeof customIssue>

function refused(params: ReturnType<typeof customIssue>): z.ZodType {
  return z.strictObject({ value: z.unknown().refine(() => false, params) })
}

describe("AC8: `customIssue` raises catalogue codes; anything else becomes `invalid`", () => {
  describe.each(CODES)("`%s`", (code) => {
    it.each<Context>(["schema", "answer"])(
      "AC8: raised with its R4 params comes out unchanged (%s)",
      (context) => {
        const schema = refused(untypedCustomIssue(code, SAMPLE_PARAMS[code]))
        expectIssues(mapped(schema, { value: 1 }, context), [sampleIssue(code, ["value"])])
      },
    )
  })

  const malformedCodes: readonly unknown[] = [
    "not_a_code",
    "custom",
    "invalid_type",
    "Required",
    "",
    42,
    null,
    undefined,
    {},
    ["required"],
  ]

  describe.each(
    malformedCodes.map((code) => ({
      code,
      label: code === undefined ? "undefined" : JSON.stringify(code),
    })),
  )("unknown or malformed code $label", ({ code }) => {
    it.each<Context>(["schema", "answer"])(
      "AC8: becomes `invalid` at the same path (%s)",
      (context) => {
        const schema = refused(untypedCustomIssue(code, {}))
        expectIssues(mapped(schema, { value: 1 }, context), [
          { code: "invalid", params: {}, path: ["value"] },
        ])
      },
    )
  })

  const malformedParams: readonly { readonly name: string; code: IssueCode; params: unknown }[] = [
    { name: "`too_short` without `min`", code: "too_short", params: {} },
    { name: "`too_short` with a string `min`", code: "too_short", params: { min: "2" } },
    { name: "`too_short` with an extra key", code: "too_short", params: { min: 2, message: "x" } },
    { name: "`invalid_range` without `max`", code: "invalid_range", params: { min: 1 } },
    { name: "`duplicate` with a boolean `value`", code: "duplicate", params: { value: true } },
    { name: "`unknown_option` with params `null`", code: "unknown_option", params: null },
    { name: "`unknown_field` with params as an array", code: "unknown_field", params: ["q1"] },
    {
      name: "`unknown_property` with no params at all",
      code: "unknown_property",
      params: undefined,
    },
    { name: "`required` with an extra key", code: "required", params: { field: "q1" } },
    {
      name: "`field_config_incompatible` with `properties` as a string",
      code: "field_config_incompatible",
      params: { fieldId: "q3", type: "rating", properties: "max", version: 1 },
    },
  ]

  describe.each(malformedParams)(
    "catalogue code with malformed params: $name",
    ({ code, params }) => {
      it.each<Context>(["schema", "answer"])(
        "AC8: becomes `invalid` at the same path (%s)",
        (context) => {
          const schema = refused(untypedCustomIssue(code, params))
          expectIssues(mapped(schema, { value: 1 }, context), [
            { code: "invalid", params: {}, path: ["value"] },
          ])
        },
      )
    },
  )

  it("AC8: a raw `.superRefine` custom issue with non-catalogue params becomes `invalid`", () => {
    const schema = z.string().superRefine((value, ctx) => {
      ctx.addIssue({ code: "custom", input: value, path: ["x"], params: { reason: "bad" } })
    })
    expectIssues(mapped(schema, "a", "answer"), [{ code: "invalid", params: {}, path: ["x"] }])
  })

  it("AC8: typed calls compile for codes with and without params", () => {
    const schema = z.strictObject({
      a: z.unknown().refine(() => false, customIssue("not_integer", {})),
      b: z.unknown().refine(() => false, customIssue("too_many", { max: 1 })),
      c: z.unknown().refine(() => false, customIssue("unknown_option", { optionId: "other" })),
    })
    expectIssues(mapped(schema, { a: 1, b: 1, c: 1 }, "answer"), [
      { code: "not_integer", params: {}, path: ["a"] },
      { code: "too_many", params: { max: 1 }, path: ["b"] },
      { code: "unknown_option", params: { optionId: "other" }, path: ["c"] },
    ])
  })
})

// --- FieldDefinitionError ----------------------------------------------------------------------

describe("AC8: `FieldDefinitionError` carries issues; its message is codes only", () => {
  const issues: readonly Issue[] = [
    { code: "invalid_field_type", params: { type: "bad type" }, path: ["type"] },
    {
      code: "incompatible_analytics",
      params: { storeAs: "none", summarize: "responses" },
      path: ["analytics"],
    },
    { code: "duplicate_field_type", params: { type: "rating" }, path: [1, "type"] },
  ]

  it("AC8: is an Error whose `issues` are the given catalogue issues", () => {
    const error = new FieldDefinitionError(issues)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(FieldDefinitionError)
    expect(error.issues).toStrictEqual(issues)
    expectIssues(error.issues, issues)
  })

  it("AC8: `message` holds only the issue codes, in order — no display text, params or paths", () => {
    const { message } = new FieldDefinitionError(issues)
    // Any separator is fine; every word in the message must be one of the codes, in issue order.
    expect(message.split(/[^a-z_]+/).filter(Boolean)).toStrictEqual(issues.map((i) => i.code))
    for (const leaked of ["bad type", "none", "responses", "rating"]) {
      expect(message).not.toContain(leaked)
    }
  })

  it("AC8: keeps its issues when thrown and caught", () => {
    let caught: unknown
    try {
      throw new FieldDefinitionError(issues)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(FieldDefinitionError)
    if (caught instanceof FieldDefinitionError) expectIssues(caught.issues, issues)
  })
})
