import { describe, expect, it } from "vitest"
import {
  CURRENT_SCHEMA_VERSION,
  createFieldRegistry,
  type FormSchema,
  idSchema,
  type Issue,
  parseFormSchema,
} from "../src/api"
// Internal: the migration loop is not public (plan "Form Schema v1", step 2: "An internal test
// drives it with a fake step"). Contract assumed here: step `i` of `steps` takes a schema of
// version `i + 1` to version `i + 2`; the loop starts at the input's (already gate-checked)
// `schemaVersion`, runs the remaining steps in order, never mutates its input, and defaults to the
// package's real step list (empty in this item).
import { type MigrationStep, migrateFormSchema } from "../src/core/form-schema"
import { acmeMeasure, acmeNote, acmeSignature } from "./fixtures/third-party"
import { expectIssues } from "./helpers/issues"

// T012 — Form Schema v1 and the read entry point `parseFormSchema` (spec US2, R5–R7; AC9 fixture
// part, AC10 rows that need no built-in, AC11, AC4 unknown-`text` part, AC8 for every failure
// here through `expectIssues`). The registry holds only the test fixtures, so it is a registry
// "without built-ins". Option-ID rows of AC10 need option fields and live in T020
// (`test/fields/options.test.ts`). Shared test: runs in Node and in Chromium; reads no locale, time
// zone or environment.

const registry = createFieldRegistry([acmeSignature, acmeMeasure, acmeNote])

type Json = Record<string, unknown>

/** A valid field entry for `acme/signature`, with `overrides` applied. */
function field(overrides: Json = {}): Json {
  return { fieldId: "sig_01", type: "acme/signature", label: "ลายเซ็นผู้ตอบ", ...overrides }
}

/** A valid Form Schema candidate with one field, with `meta` and top-level overrides applied. */
function form(overrides: Json = {}, meta: Json = {}): Json {
  return {
    schemaVersion: 1,
    meta: { title: "แบบสอบถามความพึงพอใจ", language: "th", ...meta },
    fields: [field()],
    ...overrides,
  }
}

/** A copy of `object` without `key` (to build "missing" cases). */
function without(object: Json, key: string): Json {
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key))
}

/** Parses and asserts success; returns the parsed schema. */
function parsed(input: unknown): FormSchema {
  const result = parseFormSchema(input, registry)
  if (!result.ok)
    expect.fail(`expected a valid schema, got issues ${JSON.stringify(result.issues)}`)
  return result.schema
}

/**
 * Parses (with the fixture registry unless `using` is given) and asserts failure with exactly
 * `expected` (code, params, path; strict catalogue).
 */
function expectRefused(input: unknown, expected: readonly Issue[], using = registry): void {
  const result = parseFormSchema(input, using)
  expect(result.ok).toBe(false)
  if (result.ok) return
  expectIssues(result.issues, expected)
}

describe("R7: CURRENT_SCHEMA_VERSION", () => {
  it("is 1 in this item", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1)
  })
})

describe("AC9: a valid schema parses with defaults written in (fixture part)", () => {
  // Three fixture fields: one with a partial config, one with a full config and `required` true,
  // one with no config at all. Thai text and surrounding spaces are kept verbatim (no trimming, no
  // normalisation of stored text).
  const input = (): Json => ({
    schemaVersion: 1,
    meta: {
      title: "  แบบสอบถามความพึงพอใจ  ",
      description: "กรุณาตอบทุกข้อ",
      language: "th",
    },
    fields: [
      {
        fieldId: "sig_01",
        type: "acme/signature",
        label: "ลายเซ็นผู้ตอบ",
        help: "เซ็นในกรอบด้านล่าง",
        config: { maxStrokes: 20 },
      },
      {
        fieldId: "Measure-2",
        type: "acme/measure",
        label: "ขนาด",
        required: true,
        config: { mode: "band" },
      },
      { fieldId: "note3", type: "acme/note", label: "ข้อตกลง" },
    ],
  })

  const expected = {
    schemaVersion: 1,
    meta: {
      title: "  แบบสอบถามความพึงพอใจ  ",
      description: "กรุณาตอบทุกข้อ",
      language: "th",
    },
    fields: [
      {
        fieldId: "sig_01",
        type: "acme/signature",
        label: "ลายเซ็นผู้ตอบ",
        help: "เซ็นในกรอบด้านล่าง",
        required: false,
        config: { format: "svg", maxStrokes: 20 },
      },
      {
        fieldId: "Measure-2",
        type: "acme/measure",
        label: "ขนาด",
        required: true,
        config: { mode: "band" },
      },
      {
        fieldId: "note3",
        type: "acme/note",
        label: "ข้อตกลง",
        required: false,
        config: { text: "" },
      },
    ],
  }

  it("AC9 writes required false and every config default into the output (no config gets all defaults)", () => {
    expect(parsed(input())).toStrictEqual(expected)
  })

  it("AC9 parsing the parsed output again gives an equal value", () => {
    const once = parsed(input())
    expect(parsed(once)).toStrictEqual(once)
  })

  it("R6 returns a fresh object and leaves the stored input unchanged (never rewritten)", () => {
    const stored = input()
    const snapshot = structuredClone(stored)
    const schema = parsed(stored)
    expect(stored).toStrictEqual(snapshot)
    expect(schema).not.toBe(stored)
    expect(schema.fields[2]).not.toBe((stored.fields as unknown[])[2])
  })

  it("keeps the field order (display order)", () => {
    expect(parsed(input()).fields.map((entry) => entry.fieldId)).toEqual([
      "sig_01",
      "Measure-2",
      "note3",
    ])
  })

  it("accepts a form with zero fields (Edge cases, Empty)", () => {
    expect(parsed(form({ fields: [] })).fields).toEqual([])
  })

  it("accepts a form without description or help and adds neither", () => {
    const schema = parsed(form())
    expect(Object.hasOwn(schema.meta, "description")).toBe(false)
    expect(Object.hasOwn(schema.fields[0] ?? {}, "help")).toBe(false)
  })
})

describe("AC9 / R5: meta.language is returned canonicalised", () => {
  it.each([
    ["th", "th"],
    ["en", "en"],
    ["ja", "ja"],
    ["th-TH", "th-TH"],
    ["TH", "th"],
    ["th-th", "th-TH"],
    ["EN-us", "en-US"],
    ["iw", "he"],
  ])("AC9 %j comes back as %j and re-parses equal", (language, canonical) => {
    const schema = parsed(form({}, { language }))
    expect(schema.meta.language).toBe(canonical)
    expect(parsed(schema)).toStrictEqual(schema)
  })
})

describe("AC10 / R5: a malformed or BCP 47-only language is invalid at [meta, language]", () => {
  it.each([
    ["en_US", "malformed"],
    ["", "empty"],
    [" ", "whitespace only"],
    [" th", "leading space"],
    ["x-private", "private-use-only"],
    ["X-PRIVATE", "private-use-only, upper case"],
    ["zh-cmn-Hans", "extended language subtag"],
    ["zh-yue", "extended language subtag"],
    ["i-klingon", "grandfathered, irregular"],
    ["I-KLINGON", "grandfathered, irregular, upper case"],
    ["en-GB-oed", "grandfathered, irregular"],
    ["art-lojban", "grandfathered, regular"],
    ["cel-gaulish", "grandfathered, regular"],
    ["zh-guoyu", "grandfathered, regular"],
    ["zh-min-nan", "grandfathered, regular"],
  ])("AC10 %j (%s) gives invalid", (language) => {
    expectRefused(form({}, { language }), [
      { code: "invalid", params: {}, path: ["meta", "language"] },
    ])
  })

  it.each([[7], [null], [true], [["th"]]])(
    "AC10 a non-string language %j gives invalid",
    (language) => {
      expectRefused(form({}, { language }), [
        { code: "invalid", params: {}, path: ["meta", "language"] },
      ])
    },
  )

  it("a missing language gives required (schema-context mapping of a missing value)", () => {
    const input = form()
    input.meta = without(input.meta as Json, "language")
    expectRefused(input, [{ code: "required", params: {}, path: ["meta", "language"] }])
  })
})

describe("AC10 / R5: blank title or label gives required", () => {
  it.each(["", "   ", "\t\n"])("AC10 title %j gives required at [meta, title]", (title) => {
    expectRefused(form({}, { title }), [{ code: "required", params: {}, path: ["meta", "title"] }])
  })

  it("AC10 a missing title gives required at [meta, title]", () => {
    const input = form()
    input.meta = without(input.meta as Json, "title")
    expectRefused(input, [{ code: "required", params: {}, path: ["meta", "title"] }])
  })

  it.each(["", "   ", "\t\n"])("AC10 label %j gives required at [fields, 0, label]", (label) => {
    expectRefused(form({ fields: [field({ label })] }), [
      { code: "required", params: {}, path: ["fields", 0, "label"] },
    ])
  })

  it("AC10 a missing label gives required at [fields, 1, label]", () => {
    expectRefused(form({ fields: [field(), without(field({ fieldId: "b" }), "label")] }), [
      { code: "required", params: {}, path: ["fields", 1, "label"] },
    ])
  })
})

describe("AC10 / R5: fieldId rules", () => {
  it.each(["a", "A-z_09", "x".repeat(64), "toString", "hasOwnProperty", "valueOf"])(
    "accepts the fieldId %j",
    (fieldId) => {
      expect(parsed(form({ fields: [field({ fieldId })] })).fields[0]?.fieldId).toBe(fieldId)
    },
  )

  it.each([
    ["a b", "a space"],
    ["a.b", "a dot"],
    [".", "only a dot"],
    ["x".repeat(65), "65 characters"],
    ["", "empty"],
    ["ชื่อ", "Thai letters"],
    ["a/b", "a slash"],
    ["é", "a non-ASCII letter"],
  ])("AC10 fieldId %j (%s) gives invalid at [fields, 0, fieldId]", (fieldId) => {
    expectRefused(form({ fields: [field({ fieldId })] }), [
      { code: "invalid", params: {}, path: ["fields", 0, "fieldId"] },
    ])
  })

  it.each(["__proto__", "constructor", "prototype"])(
    "AC10 fieldId %j gives reserved_id",
    (fieldId) => {
      expectRefused(form({ fields: [field({ fieldId })] }), [
        { code: "reserved_id", params: { id: fieldId }, path: ["fields", 0, "fieldId"] },
      ])
    },
  )

  it("a non-string fieldId gives invalid", () => {
    expectRefused(form({ fields: [field({ fieldId: 12 })] }), [
      { code: "invalid", params: {}, path: ["fields", 0, "fieldId"] },
    ])
  })

  it("a missing fieldId gives required", () => {
    expectRefused(form({ fields: [without(field(), "fieldId")] }), [
      { code: "required", params: {}, path: ["fields", 0, "fieldId"] },
    ])
  })
})

describe("AC10 / R6: repeated fieldId gives duplicate_field_id at the repeat", () => {
  it("AC10 two fields with the same fieldId", () => {
    expectRefused(form({ fields: [field({ fieldId: "q1" }), field({ fieldId: "q1" })] }), [
      { code: "duplicate_field_id", params: { fieldId: "q1" }, path: ["fields", 1, "fieldId"] },
    ])
  })

  it("AC10 each repeat is reported, also when not adjacent and across types", () => {
    expectRefused(
      form({
        fields: [
          field({ fieldId: "q1" }),
          field({ fieldId: "q2", type: "acme/note" }),
          field({ fieldId: "q1", type: "acme/measure" }),
          field({ fieldId: "q1" }),
        ],
      }),
      [
        { code: "duplicate_field_id", params: { fieldId: "q1" }, path: ["fields", 2, "fieldId"] },
        { code: "duplicate_field_id", params: { fieldId: "q1" }, path: ["fields", 3, "fieldId"] },
      ],
    )
  })

  it("fieldIds differing only in case are different IDs", () => {
    const schema = parsed(form({ fields: [field({ fieldId: "Abc" }), field({ fieldId: "abc" })] }))
    expect(schema.fields.map((entry) => entry.fieldId)).toEqual(["Abc", "abc"])
  })
})

describe("AC10 / R6: unknown properties are refused at form, meta and field-entry level", () => {
  it("AC10 an unknown form-level key gives unknown_property at [key]", () => {
    expectRefused(form({ accessPassword: "s3cret" }), [
      { code: "unknown_property", params: { key: "accessPassword" }, path: ["accessPassword"] },
    ])
  })

  it("AC10 an unknown meta key gives unknown_property at [meta, key]", () => {
    expectRefused(form({}, { author: "admin@example.com" }), [
      { code: "unknown_property", params: { key: "author" }, path: ["meta", "author"] },
    ])
  })

  it("AC10 an unknown field-entry key gives unknown_property at [fields, i, key]", () => {
    expectRefused(form({ fields: [field(), field({ fieldId: "b", placeholder: "…" })] }), [
      {
        code: "unknown_property",
        params: { key: "placeholder" },
        path: ["fields", 1, "placeholder"],
      },
    ])
  })

  it("AC10 every unknown key is reported, one issue per key", () => {
    expectRefused(
      form({ responses: [], webhookUrl: "https://example.com/hook" }, { password: "x" }),
      [
        { code: "unknown_property", params: { key: "responses" }, path: ["responses"] },
        { code: "unknown_property", params: { key: "webhookUrl" }, path: ["webhookUrl"] },
        { code: "unknown_property", params: { key: "password" }, path: ["meta", "password"] },
      ],
    )
  })

  it("an own __proto__ key from JSON.parse is an unknown property, at form and field level", () => {
    const input: unknown = JSON.parse(
      JSON.stringify(form()).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{"x":1}'),
    )
    expectRefused(input, [
      { code: "unknown_property", params: { key: "__proto__" }, path: ["__proto__"] },
    ])

    const entry: unknown = JSON.parse(
      JSON.stringify(field()).replace('"fieldId":', '"__proto__":{"required":true},"fieldId":'),
    )
    expectRefused(form({ fields: [entry] }), [
      { code: "unknown_property", params: { key: "__proto__" }, path: ["fields", 0, "__proto__"] },
    ])
  })
})

describe("AC4 / AC10 / R6: types not in the registry give unknown_field_type", () => {
  it("AC4 a registry without built-ins refuses a form using text", () => {
    expectRefused(form({ fields: [field({ type: "text" })] }), [
      { code: "unknown_field_type", params: { type: "text" }, path: ["fields", 0, "type"] },
    ])
  })

  it("AC10 an unknown type skips its config (no config issues reported)", () => {
    expectRefused(
      form({
        fields: [
          field(),
          field({ fieldId: "b", type: "acme/unknown", config: { minLength: "x", color: "red" } }),
        ],
      }),
      [
        {
          code: "unknown_field_type",
          params: { type: "acme/unknown" },
          path: ["fields", 1, "type"],
        },
      ],
    )
  })

  it("an empty registry refuses every type, and still accepts a form with zero fields", () => {
    const empty = createFieldRegistry([])
    expect(parseFormSchema(form({ fields: [] }), empty).ok).toBe(true)
    expectRefused(
      form({ fields: [field()] }),
      [
        {
          code: "unknown_field_type",
          params: { type: "acme/signature" },
          path: ["fields", 0, "type"],
        },
      ],
      empty,
    )
  })

  it("a missing type gives required, a non-string type gives invalid", () => {
    expectRefused(form({ fields: [without(field(), "type"), field({ fieldId: "b", type: 5 })] }), [
      { code: "required", params: {}, path: ["fields", 0, "type"] },
      { code: "invalid", params: {}, path: ["fields", 1, "type"] },
    ])
  })
})

describe("R6: config is parsed with the type's config schema, issues under [fields, i, config]", () => {
  it("a fixture config limit error is prefixed with the field's config path", () => {
    expectRefused(form({ fields: [field({ config: { maxStrokes: 0 } })] }), [
      { code: "too_small", params: { min: 1 }, path: ["fields", 0, "config", "maxStrokes"] },
    ])
  })

  it("uses the index of the field the config belongs to", () => {
    expectRefused(form({ fields: [field(), field({ fieldId: "b", config: { format: "gif" } })] }), [
      { code: "invalid", params: {}, path: ["fields", 1, "config", "format"] },
    ])
  })

  it("an unknown key in a strict fixture config gives unknown_property at its config path", () => {
    expectRefused(form({ fields: [field({ config: { format: "svg", color: "red" } })] }), [
      {
        code: "unknown_property",
        params: { key: "color" },
        path: ["fields", 0, "config", "color"],
      },
    ])
  })

  it("a config that is not an object gives invalid at [fields, i, config]", () => {
    expectRefused(form({ fields: [field({ config: [] })] }), [
      { code: "invalid", params: {}, path: ["fields", 0, "config"] },
    ])
  })
})

describe("R5 / R6: wrong shapes at form, meta and field level", () => {
  it("missing meta gives required at [meta]; meta that is not an object gives invalid", () => {
    expectRefused(without(form(), "meta"), [{ code: "required", params: {}, path: ["meta"] }])
    expectRefused(form({ meta: "x" }), [{ code: "invalid", params: {}, path: ["meta"] }])
  })

  it("missing fields gives required at [fields]; fields that is not a list gives invalid", () => {
    expectRefused(without(form(), "fields"), [{ code: "required", params: {}, path: ["fields"] }])
    expectRefused(form({ fields: { 0: field() } }), [
      { code: "invalid", params: {}, path: ["fields"] },
    ])
  })

  it("a field entry that is not an object gives invalid at [fields, i]", () => {
    expectRefused(form({ fields: [field(), null, "x"] }), [
      { code: "invalid", params: {}, path: ["fields", 1] },
      { code: "invalid", params: {}, path: ["fields", 2] },
    ])
  })

  it("wrong types for description, help and required give invalid at their paths", () => {
    expectRefused(form({ fields: [field({ help: 5, required: "yes" })] }, { description: null }), [
      { code: "invalid", params: {}, path: ["meta", "description"] },
      { code: "invalid", params: {}, path: ["fields", 0, "help"] },
      { code: "invalid", params: {}, path: ["fields", 0, "required"] },
    ])
  })
})

describe("R6: every problem is reported, each with its path", () => {
  it("reports issues from meta, form keys and several fields together", () => {
    expectRefused(
      {
        schemaVersion: 1,
        meta: { title: " ", language: "en_US", author: "x" },
        fields: [
          field({ fieldId: "a b" }),
          field({ fieldId: "ok_1", type: "acme/unknown" }),
          field({ fieldId: "ok_2", label: "", config: { maxStrokes: 0 } }),
          field({ fieldId: "ok_2" }),
        ],
        owner: "admin@example.com",
      },
      [
        { code: "required", params: {}, path: ["meta", "title"] },
        { code: "invalid", params: {}, path: ["meta", "language"] },
        { code: "unknown_property", params: { key: "author" }, path: ["meta", "author"] },
        { code: "unknown_property", params: { key: "owner" }, path: ["owner"] },
        { code: "invalid", params: {}, path: ["fields", 0, "fieldId"] },
        {
          code: "unknown_field_type",
          params: { type: "acme/unknown" },
          path: ["fields", 1, "type"],
        },
        { code: "required", params: {}, path: ["fields", 2, "label"] },
        { code: "too_small", params: { min: 1 }, path: ["fields", 2, "config", "maxStrokes"] },
        { code: "duplicate_field_id", params: { fieldId: "ok_2" }, path: ["fields", 3, "fieldId"] },
      ],
    )
  })
})

describe("AC11 / R7: the version gate runs before any other check", () => {
  // Everything else about this candidate is wrong too; only the version issue may come out.
  const broken = (schemaVersion: unknown): Json => ({
    schemaVersion,
    meta: { title: "", language: "en_US", extra: 1 },
    fields: [field({ fieldId: "a b", type: "acme/unknown" }), "x"],
    extra: true,
  })

  it("AC11 schemaVersion 1 is accepted", () => {
    expect(parsed(form({ schemaVersion: 1 })).schemaVersion).toBe(1)
  })

  it("AC11 a missing schemaVersion gives only unsupported_schema_version {found: null}", () => {
    expectRefused(without(broken(1), "schemaVersion"), [
      { code: "unsupported_schema_version", params: { found: null }, path: ["schemaVersion"] },
    ])
  })

  it.each([0, 2, -1, 1.5, "1", "v1"])(
    "AC11 schemaVersion %j gives only unsupported_schema_version with found = the value",
    (schemaVersion) => {
      expectRefused(broken(schemaVersion), [
        {
          code: "unsupported_schema_version",
          params: { found: schemaVersion },
          path: ["schemaVersion"],
        },
      ])
    },
  )

  it.each([[null], [true], [{}], [[1]]])(
    "AC11 schemaVersion %j (neither number nor string) gives found: null",
    (schemaVersion) => {
      expectRefused(broken(schemaVersion), [
        { code: "unsupported_schema_version", params: { found: null }, path: ["schemaVersion"] },
      ])
    },
  )
})

describe("AC11 / R7: input that is not a JSON object is invalid at the root, nothing else", () => {
  it.each([
    ["null", null],
    ["[]", []],
    ['"x"', "x"],
    ["1", 1],
    ["true", true],
    ["undefined", undefined],
    ["a list holding a valid schema", [form()]],
  ])("AC11 %s gives only invalid at []", (_name, input) => {
    expectRefused(input, [{ code: "invalid", params: {}, path: [] }])
  })
})

describe("R5: idSchema, the one public ID rule", () => {
  it.each(["a", "A-z_09", "x".repeat(64), "other", "__proto__", "constructor"])(
    "accepts %j (reserved values are checked separately, where they mean something)",
    (id) => {
      expect(idSchema.safeParse(id).success).toBe(true)
    },
  )

  it.each(["", "a b", "a.b", "x".repeat(65), "ชื่อ", "a/b", 12, null])("refuses %j", (id) => {
    expect(idSchema.safeParse(id).success).toBe(false)
  })
})

describe("R7: the internal migration loop (driven by fake steps)", () => {
  const calls: string[] = []
  // Fake history: v1 -> v2 renames meta.title to meta.name, v2 -> v3 adds meta.tags.
  const toV2: MigrationStep = (input) => {
    calls.push("1->2")
    const meta = input.meta as Json
    const { title, ...rest } = meta
    return { ...input, schemaVersion: 2, meta: { ...rest, name: title } }
  }
  const toV3: MigrationStep = (input) => {
    calls.push("2->3")
    return { ...input, schemaVersion: 3, meta: { ...(input.meta as Json), tags: [] } }
  }
  const steps = [toV2, toV3]

  it("runs every step from the found version to the latest, in order", () => {
    calls.length = 0
    const stored = { schemaVersion: 1, meta: { title: "t", language: "th" }, fields: [] }
    const snapshot = structuredClone(stored)
    expect(migrateFormSchema(stored, steps)).toStrictEqual({
      schemaVersion: 3,
      meta: { name: "t", language: "th", tags: [] },
      fields: [],
    })
    expect(calls).toEqual(["1->2", "2->3"])
    expect(stored).toStrictEqual(snapshot)
  })

  it("starts at the found version (a v2 input runs only the v2 -> v3 step)", () => {
    calls.length = 0
    const stored = { schemaVersion: 2, meta: { name: "t", language: "th" }, fields: [] }
    expect(migrateFormSchema(stored, steps)).toStrictEqual({
      schemaVersion: 3,
      meta: { name: "t", language: "th", tags: [] },
      fields: [],
    })
    expect(calls).toEqual(["2->3"])
  })

  it("runs no step for an input already at the latest version", () => {
    calls.length = 0
    const stored = { schemaVersion: 3, meta: { name: "t", language: "th", tags: [] }, fields: [] }
    expect(migrateFormSchema(stored, steps)).toStrictEqual(stored)
    expect(calls).toEqual([])
  })

  it("with the package's own (empty) step list, a v1 input comes back equal", () => {
    const stored = form()
    expect(migrateFormSchema(stored)).toStrictEqual(form())
  })
})
