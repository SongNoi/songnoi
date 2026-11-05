import { describe, expect, it } from "vitest"
import * as z from "zod"
import {
  type AnswerSet,
  createFieldRegistry,
  customIssue,
  defineField,
  type FieldRegistry,
  type FormSchema,
  type Issue,
  parseFormSchema,
  validateResponse,
} from "../src/api"
import { hostileJson, isJsonObject } from "./fixtures/hostile-json"
import { acmeMeasure, acmeNote, acmeSignature } from "./fixtures/third-party"
import { expectIssues, parseIssues } from "./helpers/issues"

// T014 — whole-response validation `validateResponse` (spec US3, R8, R9, Edge cases "Empty" and
// "Failure"; plan "Whole-response validation"). Proves AC12 (fixture rows, the throwing plugin, the
// registry miss, the hostile corpus through the call), AC13 (absent, `null` and unknown-key rows),
// AC14 (`acme/signature`'s own "unanswered" rule) and AC8's out-of-catalogue part (a plugin code
// outside R4 comes out as `invalid`). Every failure goes through `expectIssues` / `parseIssues`, so
// each issue also parses with the strict `issueSchema` (AC8). Only fixture and test-local fields
// (all made with the public `defineField`), no built-in. Shared test: runs in Node and in Chromium.
//
// Result contract pinned here (plan "Public API surface"):
//   { ok: true, answers }                    — nothing else on the object;
//   { ok: false, answerSet, fields }         — `answerSet` is always an array (empty when the set
//     as a whole has no issue); `fields` has a key only for a `fieldId` with at least one issue.
// Field-group paths are inside that field's answer; answer-set issues and `required` are at `[]`.

// --- test-local plugins (public `defineField` only, like any third-party package) --------------------

/** Normalises: trims the text, so the normalised set differs from the input. No "unanswered" rule. */
const trimmedText = defineField({
  type: "test/trimmed",
  config: z.strictObject({}),
  answer: () => z.string().trim().min(1),
  toCell: (answer) => answer,
  storedValues: (answer) => [answer],
  analytics: { storeAs: "text", summarize: "responses", groupable: false },
})

/** "Unanswered" depends on the parsed config: the value equal to `config.empty` means no answer. */
const sentinelText = defineField({
  type: "test/sentinel",
  config: z.strictObject({ empty: z.string().default("-") }),
  answer: () => z.string(),
  isUnanswered: (value, config) => value === config.empty,
  toCell: (answer) => answer,
  storedValues: (answer) => [answer],
  analytics: { storeAs: "text", summarize: "responses", groupable: false },
})

class PluginBug extends Error {}

const bugs = {
  rule: new PluginBug("bug in the answer rule"),
  factory: new PluginBug("bug in the answer-schema factory"),
  unanswered: new PluginBug("bug in isUnanswered"),
} as const

/** A broken plugin: its own code throws where `config.where` says (R8: the exception propagates). */
const throwingField = defineField({
  type: "test/throwing",
  config: z.strictObject({ where: z.enum(["rule", "factory", "unanswered"]) }),
  answer: (config) => {
    if (config.where === "factory") throw bugs.factory
    return z.string().refine(() => {
      if (config.where === "rule") throw bugs.rule
      return true
    })
  },
  isUnanswered: (_value, config) => {
    if (config.where === "unanswered") throw bugs.unanswered
    return false
  },
  toCell: (answer) => answer,
  storedValues: (answer) => [answer],
  analytics: { storeAs: "text", summarize: "responses", groupable: false },
})

/** Raises Zod custom issues: codes outside R4, no code, malformed params, a catalogue code. */
const raisingField = defineField({
  type: "test/raising",
  config: z.strictObject({
    raise: z.enum(["unknown-code", "no-code", "bad-params", "nested-path", "catalogue-code"]),
  }),
  answer: (config) =>
    z.string().superRefine((value, ctx) => {
      switch (config.raise) {
        case "unknown-code":
          ctx.addIssue({
            code: "custom",
            input: value,
            params: { code: "acme_signature_smudged", params: {} },
          })
          return
        case "no-code":
          ctx.addIssue({ code: "custom", input: value, message: "Smudged signature" })
          return
        case "bad-params":
          ctx.addIssue({
            code: "custom",
            input: value,
            params: { code: "too_small", params: { min: "three" } },
          })
          return
        case "nested-path":
          ctx.addIssue({
            code: "custom",
            input: value,
            path: ["pad", 2],
            params: { code: "acme_stroke_too_short", params: { length: 1 } },
          })
          return
        case "catalogue-code":
          ctx.addIssue({ code: "custom", input: value, ...customIssue("too_short", { min: 3 }) })
          return
      }
    }),
  toCell: (answer) => answer,
  storedValues: (answer) => [answer],
  analytics: { storeAs: "text", summarize: "responses", groupable: false },
})

const registry = createFieldRegistry([
  acmeSignature,
  acmeMeasure,
  acmeNote,
  trimmedText,
  sentinelText,
  throwingField,
  raisingField,
])

// --- helpers -------------------------------------------------------------------------------------------

type Json = Record<string, unknown>
type Result = ReturnType<typeof validateResponse>

interface Rejection {
  readonly answerSet: readonly Issue[]
  readonly fields: Readonly<Record<string, readonly Issue[]>>
}

/** Parses a one-language Form Schema with `fields` (asserts it is valid) for the validation rows. */
function schemaOf(fields: readonly Json[], using: FieldRegistry = registry): FormSchema {
  const result = parseFormSchema(
    { schemaVersion: 1, meta: { title: "แบบสอบถามความพึงพอใจ", language: "th" }, fields },
    using,
  )
  if (!result.ok) expect.fail(`fixture schema is invalid: ${JSON.stringify(result.issues)}`)
  return result.schema
}

function show(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return String(value)
  }
}

/** Asserts success with exactly `expected` as the normalised set; returns it. */
function expectAccepted(result: Result, expected: AnswerSet): AnswerSet {
  if (!result.ok) expect.fail(`expected ok, got ${show(result)}`)
  expect(Object.keys(result).sort()).toEqual(["answers", "ok"])
  expect(result.answers).toStrictEqual(expected)
  return result.answers
}

/**
 * Asserts failure with exactly `expected`: the answer-set group, the set of `fieldId` groups, and
 * each group's issues (code, params, path; strict catalogue).
 */
function expectRejected(result: Result, expected: Rejection): void {
  if (result.ok) expect.fail(`expected a failure, got ${show(result)}`)
  expect(Object.keys(result).sort()).toEqual(["answerSet", "fields", "ok"])
  expectIssues(result.answerSet, expected.answerSet)
  expect(Object.keys(result.fields).sort()).toEqual(Object.keys(expected.fields).sort())
  for (const [fieldId, issues] of Object.entries(expected.fields)) {
    expectIssues(result.fields[fieldId], issues)
  }
}

/** Asserts every issue in a result (if any) is a strict catalogue issue. */
function expectCatalogueOnly(result: Result): void {
  if (result.ok) return
  parseIssues(result.answerSet)
  for (const issues of Object.values(result.fields)) parseIssues(issues)
}

/** Runs `run` and returns what it threw (fails when it throws nothing). */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return expect.fail("expected the call to throw")
}

const required: Issue = { code: "required", params: {}, path: [] }
const invalidSet: Issue = { code: "invalid", params: {}, path: [] }
const unknownField = (fieldId: string): Issue => ({
  code: "unknown_field",
  params: { fieldId },
  path: [],
})

// --- the main fixture form --------------------------------------------------------------------------

// Two required and three optional answers of different shapes; `name` normalises (trims).
const form = schemaOf([
  {
    fieldId: "sig",
    type: "acme/signature",
    label: "ลายเซ็น",
    required: true,
    config: { maxStrokes: 3 },
  },
  { fieldId: "measure", type: "acme/measure", label: "ส่วนสูง (ซม.)", config: { mode: "exact" } },
  {
    fieldId: "band",
    type: "acme/measure",
    label: "ขนาดเสื้อ",
    required: true,
    config: { mode: "band" },
  },
  { fieldId: "note", type: "acme/note", label: "รับทราบข้อตกลง" },
  { fieldId: "name", type: "test/trimmed", label: "ชื่อ-นามสกุล", required: true },
])

const validAnswers = (): Json => ({
  sig: { strokes: ["M0 0 L10 10"] },
  measure: 172.5,
  band: "medium",
  note: true,
  name: "  สมชาย ใจดี  ",
})

const normalisedAnswers: AnswerSet = {
  sig: { strokes: ["M0 0 L10 10"] },
  measure: 172.5,
  band: "medium",
  note: true,
  name: "สมชาย ใจดี",
}

// --- AC12: fixture rows ------------------------------------------------------------------------------

describe("AC12: valid answer sets return the normalised set", () => {
  it("AC12 a valid answer set returns the normalised set (text trimmed, Thai kept)", () => {
    expectAccepted(validateResponse(form, validAnswers(), registry), normalisedAnswers)
  })

  it("AC12 re-validating the normalised set returns it unchanged", () => {
    const first = expectAccepted(
      validateResponse(form, validAnswers(), registry),
      normalisedAnswers,
    )
    expectAccepted(validateResponse(form, first, registry), normalisedAnswers)
  })

  it("AC12 does not change the answer set it is given", () => {
    const input = validAnswers()
    const copy = structuredClone(input)
    validateResponse(form, input, registry)
    expect(input).toStrictEqual(copy)
  })

  it("AC12 falsy answers (0, false) are answers, not unanswered", () => {
    expectAccepted(
      validateResponse(form, { ...validAnswers(), measure: 0, note: false }, registry),
      { ...normalisedAnswers, measure: 0, note: false },
    )
  })
})

describe("AC12: every error, grouped by fieldId", () => {
  it("AC12 three bad fields give three fieldId groups, and the valid fields none", () => {
    const answers = { ...validAnswers(), sig: { strokes: [""] }, measure: -1, band: "huge" }
    expectRejected(validateResponse(form, answers, registry), {
      answerSet: [],
      fields: {
        sig: [{ code: "too_short", params: { min: 1 }, path: ["strokes", 0] }],
        measure: [{ code: "too_small", params: { min: 0 }, path: [] }],
        band: [{ code: "invalid", params: {}, path: [] }],
      },
    })
  })

  it('AC12 "" is not unanswered for a field without its own rule: checked by the answer schema', () => {
    const answers = { ...validAnswers(), measure: "", name: "" }
    expectRejected(validateResponse(form, answers, registry), {
      answerSet: [],
      fields: {
        measure: [{ code: "invalid", params: {}, path: [] }],
        name: [{ code: "too_short", params: { min: 1 }, path: [] }],
      },
    })
  })

  it("AC12 a whitespace-only answer to a trimming field fails its rule (no unanswered rule)", () => {
    expectRejected(validateResponse(form, { ...validAnswers(), name: "   " }, registry), {
      answerSet: [],
      fields: { name: [{ code: "too_short", params: { min: 1 }, path: [] }] },
    })
  })
})

describe("AC12: an answer set that is not a JSON object fails as a whole", () => {
  const notObjects: readonly { name: string; value: unknown }[] = [
    { name: "null", value: null },
    { name: "[]", value: [] },
    { name: '"x"', value: "x" },
    { name: "1", value: 1 },
    { name: "true", value: true },
    { name: "an array holding a valid answer set", value: [validAnswers()] },
    { name: "the 10,000-deep nested array", value: deepArrayFromCorpus() },
  ]

  it.each(notObjects)(
    "AC12 $name gives only a whole-set invalid, no field group, no throw",
    ({ value }) => {
      expectRejected(validateResponse(form, value, registry), {
        answerSet: [invalidSet],
        fields: {},
      })
    },
  )
})

function deepArrayFromCorpus(): unknown {
  const entry = hostileJson.find(({ name }) => name === "10,000-deep nested array")
  if (entry === undefined) return expect.fail("the corpus lost its deep array")
  return entry.value
}

// --- AC12: registry miss (F28) -------------------------------------------------------------------------

describe("AC12: a schema type missing from the registry used for validation", () => {
  // The schema was read with the full registry; validation gets one without `acme/signature`.
  const withoutSignature = createFieldRegistry([acmeMeasure, acmeNote, trimmedText])
  const missing: Issue = {
    code: "unknown_field_type",
    params: { type: "acme/signature" },
    path: [],
  }

  const rows: readonly { name: string; answers: Json }[] = [
    { name: "answered validly", answers: validAnswers() },
    { name: "answered invalidly", answers: { ...validAnswers(), sig: 42 } },
    {
      name: "answered with its own unanswered value",
      answers: { ...validAnswers(), sig: { strokes: [] } },
    },
    { name: "answered null", answers: { ...validAnswers(), sig: null } },
    {
      name: "absent",
      answers: Object.fromEntries(Object.entries(validAnswers()).filter(([k]) => k !== "sig")),
    },
  ]

  it.each(rows)(
    "AC12 required field $name: unknown_field_type at [] in its group, ok false, no throw",
    ({ answers }) => {
      expectRejected(validateResponse(form, answers, withoutSignature), {
        answerSet: [],
        fields: { sig: [missing] },
      })
    },
  )

  it("AC12 optional and unanswered: still unknown_field_type, still ok false", () => {
    const optional = schemaOf([
      { fieldId: "sig", type: "acme/signature", label: "ลายเซ็น" },
      { fieldId: "name", type: "test/trimmed", label: "ชื่อ" },
    ])
    expectRejected(validateResponse(optional, { name: "ก" }, withoutSignature), {
      answerSet: [],
      fields: { sig: [missing] },
    })
  })

  it("AC12 the other fields are still checked and reported", () => {
    const answers = { ...validAnswers(), band: "huge", extra: 1 }
    expectRejected(validateResponse(form, answers, withoutSignature), {
      answerSet: [unknownField("extra")],
      fields: { sig: [missing], band: [{ code: "invalid", params: {}, path: [] }] },
    })
  })
})

// --- AC12: plugin exceptions propagate (R8) -------------------------------------------------------------

describe("AC12: an exception from a plugin's own code propagates unchanged", () => {
  it.each(["rule", "factory", "unanswered"] as const)(
    "AC12 a throw in the plugin's %s reaches the caller as the same exception",
    (where) => {
      const schema = schemaOf([
        { fieldId: "boom", type: "test/throwing", label: "ระเบิด", config: { where } },
      ])
      expect(thrownBy(() => validateResponse(schema, { boom: "x" }, registry))).toBe(bugs[where])
    },
  )
})

// --- AC8: plugin codes outside the catalogue ------------------------------------------------------------

describe("AC8: a plugin rule raising a code outside R4 comes out as invalid", () => {
  const schema = schemaOf([
    { fieldId: "unknownCode", type: "test/raising", label: "ก", config: { raise: "unknown-code" } },
    { fieldId: "noCode", type: "test/raising", label: "ข", config: { raise: "no-code" } },
    { fieldId: "badParams", type: "test/raising", label: "ค", config: { raise: "bad-params" } },
    { fieldId: "nestedPath", type: "test/raising", label: "ง", config: { raise: "nested-path" } },
    {
      fieldId: "inCatalogue",
      type: "test/raising",
      label: "จ",
      config: { raise: "catalogue-code" },
    },
  ])
  const answers = {
    unknownCode: "x",
    noCode: "x",
    badParams: "x",
    nestedPath: "x",
    inCatalogue: "x",
  }

  it("AC8 out-of-catalogue, code-less and malformed-params issues become invalid in their groups", () => {
    expectRejected(validateResponse(schema, answers, registry), {
      answerSet: [],
      fields: {
        unknownCode: [{ code: "invalid", params: {}, path: [] }],
        noCode: [{ code: "invalid", params: {}, path: [] }],
        badParams: [{ code: "invalid", params: {}, path: [] }],
        nestedPath: [{ code: "invalid", params: {}, path: ["pad", 2] }],
        // Control: a catalogue code raised with the public `customIssue` passes through.
        inCatalogue: [{ code: "too_short", params: { min: 3 }, path: [] }],
      },
    })
  })
})

// --- AC13: absent, null and unknown keys ----------------------------------------------------------------

describe("AC13: absent and null answers", () => {
  it("AC13 {} gives one required per required field, at [] in each field's group", () => {
    expectRejected(validateResponse(form, {}, registry), {
      answerSet: [],
      fields: { sig: [required], band: [required], name: [required] },
    })
  })

  it("AC13 null is the same as absent: required when required", () => {
    const answers = { ...validAnswers(), sig: null, band: null }
    expectRejected(validateResponse(form, answers, registry), {
      answerSet: [],
      fields: { sig: [required], band: [required] },
    })
  })

  it("AC13 absent and null optional answers are valid and left out of the normalised set", () => {
    const answers = { sig: { strokes: ["a"] }, band: "small", name: "ก", measure: null }
    expectAccepted(validateResponse(form, answers, registry), {
      sig: { strokes: ["a"] },
      band: "small",
      name: "ก",
    })
  })

  it("AC13 an empty form validates {} to an empty normalised set", () => {
    expectAccepted(validateResponse(schemaOf([]), {}, registry), {})
  })
})

describe("AC13: keys outside the schema", () => {
  it("AC13 unknown keys, including own __proto__ and constructor, give unknown_field in the answer-set group", () => {
    const answers = {
      ...validAnswers(),
      ...(JSON.parse(
        '{"__proto__": {"sig": null}, "constructor": 1, "extra": "x", "Sig": 2}',
      ) as Json),
    }
    expectRejected(validateResponse(form, answers, registry), {
      answerSet: [
        unknownField("__proto__"),
        unknownField("constructor"),
        unknownField("extra"),
        unknownField("Sig"),
      ],
      fields: {},
    })
  })

  it("AC13 unknown keys leave the other fields' results unchanged", () => {
    const bad = { ...validAnswers(), measure: -1, name: null }
    const hostileKeys = JSON.parse(
      '{"__proto__": {"measure": 5, "name": "x"}, "constructor": {"prototype": {"name": "x"}}}',
    ) as Json
    const plain = validateResponse(form, bad, registry)
    const withKeys = validateResponse(form, { ...bad, ...hostileKeys }, registry)
    const fields = {
      measure: [{ code: "too_small", params: { min: 0 }, path: [] }],
      name: [required],
    } satisfies Record<string, Issue[]>
    expectRejected(plain, { answerSet: [], fields })
    expectRejected(withKeys, {
      answerSet: [unknownField("__proto__"), unknownField("constructor")],
      fields,
    })
  })

  it("AC13 an own __proto__ key in the answer set pollutes no prototype", () => {
    const answers = JSON.parse('{"__proto__": {"polluted": true}}') as Json
    const result = validateResponse(form, answers, registry)
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
    expect(({} as Json).polluted).toBeUndefined()
    if (!result.ok) {
      expect(Object.getPrototypeOf(result.fields)).not.toHaveProperty("polluted")
    }
  })

  it("AC13 an unknown key on an empty form gives unknown_field", () => {
    expectRejected(validateResponse(schemaOf([]), { a: 1 }, registry), {
      answerSet: [unknownField("a")],
      fields: {},
    })
  })
})

describe("AC13: fieldIds named like Object.prototype members are read as own keys only", () => {
  const protoNamed = ["toString", "valueOf", "hasOwnProperty"] as const

  it("AC13 required fieldIds toString / valueOf / hasOwnProperty, absent: required each", () => {
    const schema = schemaOf(
      protoNamed.map((fieldId) => ({
        fieldId,
        type: "test/trimmed",
        label: "ข้อความ",
        required: true,
      })),
    )
    expectRejected(validateResponse(schema, {}, registry), {
      answerSet: [],
      fields: { toString: [required], valueOf: [required], hasOwnProperty: [required] },
    })
  })

  it("AC13 optional and absent: omitted, the inherited function is never validated", () => {
    const schema = schemaOf(
      protoNamed.map((fieldId) => ({ fieldId, type: "test/trimmed", label: "ข้อความ" })),
    )
    expectAccepted(validateResponse(schema, {}, registry), {})
  })

  it("AC13 answered: the own value is validated and kept under that key", () => {
    const schema = schemaOf([{ fieldId: "toString", type: "test/trimmed", label: "ข้อความ" }])
    const answers = expectAccepted(validateResponse(schema, { toString: "  ok  " }, registry), {
      toString: "ok",
    })
    expect(Object.hasOwn(answers, "toString")).toBe(true)
  })
})

// --- AC14: the fixture's own "unanswered" rule -----------------------------------------------------------

describe("AC14: a plugin's own isUnanswered is honoured", () => {
  it("AC14 acme/signature's untouched pad { strokes: [] } is unanswered: required when required", () => {
    expectRejected(validateResponse(form, { ...validAnswers(), sig: { strokes: [] } }, registry), {
      answerSet: [],
      fields: { sig: [required] },
    })
  })

  it("AC14 the untouched pad on an optional field is omitted, not checked by the answer schema", () => {
    // The answer schema alone would refuse `{ strokes: [] }` with too_few {min: 1}.
    const optional = schemaOf([{ fieldId: "sig", type: "acme/signature", label: "ลายเซ็น" }])
    expectAccepted(validateResponse(optional, { sig: { strokes: [] } }, registry), {})
  })

  it("AC14 a value the rule calls answered goes to the answer schema", () => {
    const answers = { ...validAnswers(), sig: { strokes: [], extra: true } }
    expectRejected(validateResponse(form, answers, registry), {
      answerSet: [],
      fields: {
        sig: [
          { code: "too_few", params: { min: 1 }, path: ["strokes"] },
          { code: "invalid", params: {}, path: [] },
        ],
      },
    })
  })

  it("AC14 the rule receives the field's parsed config", () => {
    const schema = schemaOf([
      {
        fieldId: "custom",
        type: "test/sentinel",
        label: "ก",
        required: true,
        config: { empty: "n/a" },
      },
      { fieldId: "byDefault", type: "test/sentinel", label: "ข" },
    ])
    // `config.empty` is "n/a" for `custom` and the default "-" for `byDefault`.
    expectRejected(validateResponse(schema, { custom: "n/a", byDefault: "n/a" }, registry), {
      answerSet: [],
      fields: { custom: [required] },
    })
    expectAccepted(validateResponse(schema, { custom: "-", byDefault: "-" }, registry), {
      custom: "-",
    })
  })
})

// --- AC12: the hostile-JSON corpus through validateResponse ---------------------------------------------

describe("AC12: the hostile-JSON corpus never makes validateResponse throw", () => {
  // Every fixture and test-local field that does not throw on purpose, with two of each config.
  const hostileForm = schemaOf([
    { fieldId: "sig", type: "acme/signature", label: "ลายเซ็น", required: true },
    {
      fieldId: "sigPng",
      type: "acme/signature",
      label: "ลายเซ็น",
      config: { format: "png", maxStrokes: 1 },
    },
    { fieldId: "measure", type: "acme/measure", label: "ส่วนสูง" },
    {
      fieldId: "band",
      type: "acme/measure",
      label: "ขนาด",
      required: true,
      config: { mode: "band" },
    },
    { fieldId: "note", type: "acme/note", label: "ข้อตกลง" },
    { fieldId: "name", type: "test/trimmed", label: "ชื่อ", required: true },
    { fieldId: "sentinel", type: "test/sentinel", label: "ก", config: { empty: "" } },
    { fieldId: "raising", type: "test/raising", label: "ข", config: { raise: "unknown-code" } },
  ])
  const fieldIds = hostileForm.fields.map(({ fieldId }) => fieldId)

  it.each(hostileJson)("AC12 as the whole answer set: $name", ({ value }) => {
    const result = validateResponse(hostileForm, value, registry)
    if (!isJsonObject(value)) {
      expectRejected(result, { answerSet: [invalidSet], fields: {} })
      return
    }
    // No corpus key is a fieldId here: each own key is unknown, each required field is unanswered.
    expectRejected(result, {
      answerSet: Object.keys(value).map(unknownField),
      fields: { sig: [required], band: [required], name: [required] },
    })
  })

  it.each(hostileJson)("AC12 as every field's answer: $name", ({ value }) => {
    const answers = Object.fromEntries(fieldIds.map((fieldId) => [fieldId, value]))
    const result = validateResponse(hostileForm, answers, registry)
    expectCatalogueOnly(result)
    if (!result.ok) {
      expectIssues(result.answerSet, [])
      for (const fieldId of Object.keys(result.fields)) expect(fieldIds).toContain(fieldId)
    }
  })
})
