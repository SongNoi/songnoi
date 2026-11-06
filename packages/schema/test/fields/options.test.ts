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
import { checkboxField } from "../../src/fields/checkbox"
import { choiceField } from "../../src/fields/choice"
import { dropdownField } from "../../src/fields/dropdown"
import { HOSTILE_TIMEOUT_MS, hostileJson, isJsonObject } from "../fixtures/hostile-json"
import { expectIssues, parseIssues } from "../helpers/issues"

// T020 — the built-in option fields `choice`, `dropdown` and `checkbox` with "Other" (spec US5,
// R13, R14, R9; Edge cases "Empty" and "Limits"; plan "Built-in fields", "Option fields: checkbox
// limits, option IDs and cells", "Rules on values"; owner decision F27). Written before T021
// implements them. Proves:
//   AC18 — option config errors with code and path (group a, b);
//   AC10 — option-ID rows: repeated ID in one field, the same ID in two fields, reserved `other`,
//          malformed IDs, and one unknown-config-key row per type (group a, b);
//   AC19 — option answers: shape, `unknown_option`, `duplicate`, `too_many`, "Other" text rules,
//          checkbox limits with "Other" counted, normalisation (group c);
//   AC13 — the empty selection `{ "optionIds": [] }` is unanswered (group d);
//   AC20 — cells: labels, the "Other" cell, config order / answer order / "Other" last (group e);
//   AC9  — `allowOther` false written in, re-parsing to an equal value (group f);
//   AC6  — `text` / `counts` / groupable for all three (group f);
//   AC7  — stored values in answer order, "Other" as `other` without the text (group f);
//   AC12 — the hostile-JSON corpus as answers and as config, never throwing (group f);
//   AC8  — every failure goes through `expectIssues` / `parseIssues` (strict `issueSchema`).
//
// Contract assumed (plan "Public API surface", "Module layout", "Built-in fields"):
// `src/fields/choice.ts` exports `choiceField` (type `choice`), `src/fields/dropdown.ts` exports
// `dropdownField` (type `dropdown`) and `src/fields/checkbox.ts` exports `checkboxField` (type
// `checkbox`), each made with the public `defineField` from `fields/shared/options.ts`.
// - Config (strict): `options` (≥ 1 strict `{ id, label }`), `allowOther` (default `false`),
//   `otherLabel` (non-blank, required when `allowOther`); checkbox adds `minSelections` (int ≥ 0)
//   and `maxSelections` (int ≥ 1). Option issues sit at `["options", j, …]` inside the config;
//   both `invalid_range` rules sit at `["minSelections"]`.
// - Answer: strict `{ optionIds: string[], other?: string }`. Issue paths inside the answer:
//   `unknown_option {optionId}` and `duplicate {value}` at `["optionIds", i]` (the repeat's index
//   for `duplicate`); `too_many {max}` / `too_few {min}` at `["optionIds"]`;
//   `other_text_required` and a misplaced `other` (`invalid`) at `["other"]`; a wrong shape or an
//   extra key `invalid` at `[]`. The normalised answer keeps `optionIds` in answer order and
//   holds the trimmed "Other" text; it has no `other` key when "Other" is not selected.
// - Codes follow spec R14 (`unknown_option`, `duplicate`), not a generic `invalid`.
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment.

const registry = createFieldRegistry([choiceField, dropdownField, checkboxField])

type Json = Record<string, unknown>
type Path = (string | number)[]
type OptionType = "choice" | "dropdown" | "checkbox"
type Result = ReturnType<typeof validateResponse>

const TYPES = ["choice", "dropdown", "checkbox"] as const
const SINGLE = ["choice", "dropdown"] as const
const DEFINITIONS = { choice: choiceField, dropdown: dropdownField, checkbox: checkboxField }

const FIELD_ID = "Vb7-pL0wQe4R"
const CONFIG_PATH = ["fields", 0, "config"] as const

// The example form's options (spec "How does the form schema change?").
const FACEBOOK = "Qm2xT8aLp0vW"
const FRIEND = "c9Rk_4NnYb1E"
const REMOVED = "Rm0vedOpt123"
const LINE = "Ln3_eXtraOpt"
const OPTIONS = [
  { id: FACEBOOK, label: "Facebook" },
  { id: FRIEND, label: "เพื่อนแนะนำ" },
] as const
const OTHER_LABEL = "อื่นๆ"

/** The example form's checkbox config. */
const EXAMPLE_CHECKBOX = {
  options: OPTIONS,
  allowOther: true,
  otherLabel: OTHER_LABEL,
  maxSelections: 2,
} as const
/** The same options and "Other" for `choice` / `dropdown` (no selection limits). */
const WITH_OTHER = { options: OPTIONS, allowOther: true, otherLabel: OTHER_LABEL } as const
const WITHOUT_OTHER = { options: OPTIONS } as const

/** A Thai one-language Form Schema candidate holding `fields`. */
function formOf(fields: readonly Json[]): Json {
  return { schemaVersion: 1, meta: { title: "แบบสอบถามช่องทาง", language: "th" }, fields }
}

/** One field entry of `type` with `extra` (config, required, …) applied. */
function entry(type: OptionType, extra: Json = {}): Json {
  return { fieldId: FIELD_ID, type, label: "รู้จักเราจากช่องทางใด", ...extra }
}

/** Parses and asserts success; returns the parsed schema. */
function parsed(fields: readonly Json[]): FormSchema {
  const result = parseFormSchema(formOf(fields), registry)
  if (!result.ok) expect.fail(`expected a valid schema, got ${show(result.issues)}`)
  return result.schema
}

/** Parses one field entry with `config` and returns the parsed config. */
function parsedConfig(type: OptionType, config: unknown): unknown {
  return parsed([entry(type, { config })]).fields[0]?.config
}

/** Parses one field entry and asserts failure with exactly `expected` (code, params, path). */
function expectConfigRejected(type: OptionType, config: unknown, expected: readonly Issue[]): void {
  const result = parseFormSchema(formOf([entry(type, { config })]), registry)
  if (result.ok) expect.fail(`expected issues, got the schema ${show(result.schema)}`)
  expectIssues(result.issues, expected)
}

const at = (...path: readonly (string | number)[]): Path => [...CONFIG_PATH, ...path]

function show(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 300)
  } catch {
    return String(value)
  }
}

/** Validates `{ [FIELD_ID]: value }` against one field of `type` with `config`. */
function answer(type: OptionType, value: unknown, config: Json, isRequired = true): Result {
  const schema = parsed([entry(type, { required: isRequired, config })])
  return validateResponse(schema, { [FIELD_ID]: value }, registry)
}

function expectAccepted(result: Result, normalised: unknown): void {
  if (!result.ok) expect.fail(`expected ok, got ${show(result)}`)
  expect(result.answers).toStrictEqual({ [FIELD_ID]: normalised })
}

/** Valid and left out of the normalised set (unanswered optional field). */
function expectOmitted(result: Result): void {
  if (!result.ok) expect.fail(`expected ok, got ${show(result)}`)
  expect(result.answers).toStrictEqual({})
}

function expectRefused(result: Result, issues: readonly Issue[]): void {
  if (result.ok) expect.fail(`expected a failure, got ${show(result)}`)
  expectIssues(result.answerSet, [])
  expect(Object.keys(result.fields)).toEqual([FIELD_ID])
  expectIssues(result.fields[FIELD_ID], issues)
}

/** Refused with at least one issue, every one `invalid` with a path starting with `prefix`. */
function expectInvalidUnder(result: Result, prefix: Path): void {
  if (result.ok) expect.fail(`expected a failure, got ${show(result)}`)
  expectIssues(result.answerSet, [])
  const issues = parseIssues(result.fields[FIELD_ID])
  expect(issues.length).toBeGreaterThan(0)
  for (const issue of issues) {
    expect(issue.code).toBe("invalid")
    expect(issue.path.slice(0, prefix.length)).toStrictEqual(prefix)
  }
}

const required: Issue = { code: "required", params: {}, path: [] }
const invalidAt = (...path: Path): Issue => ({ code: "invalid", params: {}, path })
const otherTextRequired: Issue = { code: "other_text_required", params: {}, path: ["other"] }
const unknownOption = (optionId: string, index: number): Issue => ({
  code: "unknown_option",
  params: { optionId },
  path: ["optionIds", index],
})
const duplicate = (value: string, index: number): Issue => ({
  code: "duplicate",
  params: { value },
  path: ["optionIds", index],
})
const tooMany = (max: number): Issue => ({ code: "too_many", params: { max }, path: ["optionIds"] })
const tooFew = (min: number): Issue => ({ code: "too_few", params: { min }, path: ["optionIds"] })

// =====================================================================================================
// (a) Config — AC18 (and AC10 for the unknown-config-key row)
// =====================================================================================================

describe("AC18 option config: options list and labels (all three types)", () => {
  it.each(TYPES)("AC18 %s: missing options gives required at [config, options]", (type) => {
    expectConfigRejected(type, {}, [{ code: "required", params: {}, path: at("options") }])
  })

  it.each(TYPES)("AC18 %s: no config at all gives required at [config, options]", (type) => {
    const result = parseFormSchema(formOf([entry(type)]), registry)
    if (result.ok) expect.fail("an option field without options must be refused")
    expectIssues(result.issues, [{ code: "required", params: {}, path: at("options") }])
  })

  it.each(TYPES)("AC18 %s: an empty options list gives too_few {min: 1}", (type) => {
    expectConfigRejected(type, { options: [] }, [
      { code: "too_few", params: { min: 1 }, path: at("options") },
    ])
  })

  it.each(TYPES)("AC18 %s: options that is not a list is invalid at options", (type) => {
    for (const options of ["Facebook", { id: FACEBOOK, label: "Facebook" }, null, 1]) {
      expectConfigRejected(type, { options }, [invalidAt(...at("options"))])
    }
  })

  it.each(TYPES)("AC18 %s: a blank option label gives required at its label", (type) => {
    for (const label of ["", "  ", "\t\n"]) {
      expectConfigRejected(type, { options: [OPTIONS[0], { id: FRIEND, label }] }, [
        { code: "required", params: {}, path: at("options", 1, "label") },
      ])
    }
  })

  it.each(TYPES)("AC18 %s: a missing option label gives required at its label", (type) => {
    expectConfigRejected(type, { options: [OPTIONS[0], { id: FRIEND }] }, [
      { code: "required", params: {}, path: at("options", 1, "label") },
    ])
  })

  it.each(TYPES)("AC18 %s: a non-string option label is invalid at its label", (type) => {
    expectConfigRejected(type, { options: [{ id: FACEBOOK, label: 5 }] }, [
      invalidAt(...at("options", 0, "label")),
    ])
  })

  it.each(TYPES)(
    'AC18 %s: an option entry with an extra key "value" gives unknown_property at [config, options, j, "value"]',
    (type) => {
      expectConfigRejected(type, { options: [OPTIONS[0], { id: FRIEND, label: "x", value: 1 }] }, [
        { code: "unknown_property", params: { key: "value" }, path: at("options", 1, "value") },
      ])
    },
  )

  it.each(TYPES)("AC18 %s: an option entry that is not an object is invalid", (type) => {
    expectConfigRejected(type, { options: [FACEBOOK] }, [invalidAt(...at("options", 0))])
  })

  it.each(TYPES)("AC18 %s: option labels and otherLabel are stored verbatim", (type) => {
    const config = {
      options: [{ id: FACEBOOK, label: "  Facebook " }],
      allowOther: true,
      otherLabel: " อื่นๆ ",
    }
    expect(parsedConfig(type, config)).toStrictEqual(config)
  })
})

describe('AC18 option config: "Other" (allowOther, otherLabel)', () => {
  it.each(TYPES)("AC18 %s: allowOther without otherLabel gives required at otherLabel", (type) => {
    expectConfigRejected(type, { options: OPTIONS, allowOther: true }, [
      { code: "required", params: {}, path: at("otherLabel") },
    ])
  })

  it.each(TYPES)(
    'AC18 %s: allowOther with otherLabel "" or "  " gives required at otherLabel',
    (type) => {
      for (const otherLabel of ["", "  "]) {
        expectConfigRejected(type, { options: OPTIONS, allowOther: true, otherLabel }, [
          { code: "required", params: {}, path: at("otherLabel") },
        ])
      }
    },
  )

  it.each(TYPES)(
    "AC18 %s: a blank otherLabel is refused even while allowOther is false (R13)",
    (type) => {
      expectConfigRejected(type, { options: OPTIONS, allowOther: false, otherLabel: "  " }, [
        { code: "required", params: {}, path: at("otherLabel") },
      ])
    },
  )

  it.each(TYPES)("AC18 %s: otherLabel is kept while allowOther is false", (type) => {
    expect(
      parsedConfig(type, { options: OPTIONS, allowOther: false, otherLabel: OTHER_LABEL }),
    ).toStrictEqual({ options: OPTIONS, allowOther: false, otherLabel: OTHER_LABEL })
    expect(parsedConfig(type, { options: OPTIONS, otherLabel: OTHER_LABEL })).toStrictEqual({
      options: OPTIONS,
      allowOther: false,
      otherLabel: OTHER_LABEL,
    })
  })

  it.each(TYPES)("AC18 %s: allowOther with a non-blank otherLabel is accepted", (type) => {
    expect(parsedConfig(type, WITH_OTHER)).toStrictEqual(WITH_OTHER)
  })

  it.each(TYPES)("AC18 %s: a non-boolean allowOther is invalid at allowOther", (type) => {
    expectConfigRejected(type, { options: OPTIONS, allowOther: "yes", otherLabel: OTHER_LABEL }, [
      invalidAt(...at("allowOther")),
    ])
  })

  it.each(TYPES)("AC18 %s: a non-string otherLabel is invalid at otherLabel", (type) => {
    expectConfigRejected(type, { options: OPTIONS, allowOther: true, otherLabel: 5 }, [
      invalidAt(...at("otherLabel")),
    ])
  })
})

describe("AC10 / AC18 option config: unknown config keys (strict config)", () => {
  it.each(TYPES)('AC10 %s: { options, "color": "red" } gives unknown_property at color', (type) => {
    expectConfigRejected(type, { options: OPTIONS, color: "red" }, [
      { code: "unknown_property", params: { key: "color" }, path: at("color") },
    ])
  })

  it.each(SINGLE)("AC10 %s: minSelections and maxSelections are checkbox-only keys", (type) => {
    expectConfigRejected(type, { options: OPTIONS, minSelections: 1, maxSelections: 1 }, [
      { code: "unknown_property", params: { key: "minSelections" }, path: at("minSelections") },
      { code: "unknown_property", params: { key: "maxSelections" }, path: at("maxSelections") },
    ])
  })
})

describe("AC18 checkbox config: minSelections and maxSelections (F27)", () => {
  const three = [...OPTIONS, { id: LINE, label: "LINE" }]

  it("AC18 maxSelections 0 gives too_small {min: 1} at maxSelections", () => {
    expectConfigRejected("checkbox", { options: OPTIONS, maxSelections: 0 }, [
      { code: "too_small", params: { min: 1 }, path: at("maxSelections") },
    ])
  })

  it("AC18 maxSelections -1 gives too_small {min: 1} at maxSelections", () => {
    expectConfigRejected("checkbox", { options: OPTIONS, maxSelections: -1 }, [
      { code: "too_small", params: { min: 1 }, path: at("maxSelections") },
    ])
  })

  it("AC18 minSelections -1 gives too_small {min: 0} at minSelections", () => {
    expectConfigRejected("checkbox", { options: OPTIONS, minSelections: -1 }, [
      { code: "too_small", params: { min: 0 }, path: at("minSelections") },
    ])
  })

  it("AC18 fractional limits give not_integer at their path", () => {
    expectConfigRejected("checkbox", { options: OPTIONS, minSelections: 1.5 }, [
      { code: "not_integer", params: {}, path: at("minSelections") },
    ])
    expectConfigRejected("checkbox", { options: OPTIONS, maxSelections: 1.5 }, [
      { code: "not_integer", params: {}, path: at("maxSelections") },
    ])
  })

  it('AC18 a limit given as a string ("1") is invalid', () => {
    expectConfigRejected("checkbox", { options: OPTIONS, minSelections: "1" }, [
      invalidAt(...at("minSelections")),
    ])
    expectConfigRejected("checkbox", { options: OPTIONS, maxSelections: "1" }, [
      invalidAt(...at("maxSelections")),
    ])
  })

  it("AC18 minSelections > maxSelections gives invalid_range {min, max} at minSelections", () => {
    expectConfigRejected("checkbox", { options: three, minSelections: 3, maxSelections: 2 }, [
      { code: "invalid_range", params: { min: 3, max: 2 }, path: at("minSelections") },
    ])
  })

  it("AC18 minSelections equal to maxSelections is accepted", () => {
    const config = { options: three, minSelections: 2, maxSelections: 2 }
    expect(parsedConfig("checkbox", config)).toStrictEqual({ ...config, allowOther: false })
  })

  it('AC18 minSelections above the options (no "Other") gives invalid_range {min, max: options}', () => {
    expectConfigRejected("checkbox", { options: OPTIONS, minSelections: 3 }, [
      { code: "invalid_range", params: { min: 3, max: 2 }, path: at("minSelections") },
    ])
  })

  it('AC18 minSelections above options + 1 with "Other" gives invalid_range {min, max: options + 1}', () => {
    expectConfigRejected("checkbox", { ...WITH_OTHER, minSelections: 4 }, [
      { code: "invalid_range", params: { min: 4, max: 3 }, path: at("minSelections") },
    ])
  })

  it('AC18 minSelections equal to options + 1 with "Other" is accepted', () => {
    const config = { ...WITH_OTHER, minSelections: 3 }
    expect(parsedConfig("checkbox", config)).toStrictEqual(config)
  })

  it('AC18 minSelections equal to the options without "Other" is accepted', () => {
    const config = { options: OPTIONS, minSelections: 2 }
    expect(parsedConfig("checkbox", config)).toStrictEqual({ ...config, allowOther: false })
  })

  it("AC18 both rules failing give two invalid_range issues at minSelections", () => {
    expectConfigRejected("checkbox", { options: OPTIONS, minSelections: 3, maxSelections: 1 }, [
      { code: "invalid_range", params: { min: 3, max: 1 }, path: at("minSelections") },
      { code: "invalid_range", params: { min: 3, max: 2 }, path: at("minSelections") },
    ])
  })

  it("AC18 maxSelections above the selectable count is accepted (it never binds)", () => {
    expect(parsedConfig("checkbox", { options: OPTIONS, maxSelections: 5 })).toStrictEqual({
      options: OPTIONS,
      allowOther: false,
      maxSelections: 5,
    })
    expect(parsedConfig("checkbox", { ...WITH_OTHER, maxSelections: 10 })).toStrictEqual({
      ...WITH_OTHER,
      maxSelections: 10,
    })
  })

  it("AC18 minSelections 0 and maxSelections 1 are accepted", () => {
    const config = { options: OPTIONS, minSelections: 0, maxSelections: 1 }
    expect(parsedConfig("checkbox", config)).toStrictEqual({ ...config, allowOther: false })
  })

  it("AC18 the example form's checkbox config is accepted as written", () => {
    expect(parsedConfig("checkbox", EXAMPLE_CHECKBOX)).toStrictEqual(EXAMPLE_CHECKBOX)
  })
})

// =====================================================================================================
// (b) Option IDs — AC10, AC18
// =====================================================================================================

describe("AC10 / AC18 option IDs", () => {
  it.each(TYPES)(
    "AC10 %s: a repeated option ID in one field gives duplicate_option_id at the repeat's id",
    (type) => {
      expectConfigRejected(
        type,
        { options: [...OPTIONS, { id: FACEBOOK, label: "Facebook อีกครั้ง" }] },
        [
          {
            code: "duplicate_option_id",
            params: { optionId: FACEBOOK },
            path: at("options", 2, "id"),
          },
        ],
      )
    },
  )

  it.each(TYPES)("AC10 %s: an ID listed three times gives one issue per repeat", (type) => {
    const options = [OPTIONS[0], { id: FACEBOOK, label: "b" }, { id: FACEBOOK, label: "c" }]
    expectConfigRejected(type, { options }, [
      { code: "duplicate_option_id", params: { optionId: FACEBOOK }, path: at("options", 1, "id") },
      { code: "duplicate_option_id", params: { optionId: FACEBOOK }, path: at("options", 2, "id") },
    ])
  })

  it("AC10 the same option ID in two fields passes (IDs are unique per field)", () => {
    const schema = parsed([
      { fieldId: "first", type: "choice", label: "หนึ่ง", config: { options: OPTIONS } },
      { fieldId: "second", type: "checkbox", label: "สอง", config: { options: OPTIONS } },
      { fieldId: "third", type: "choice", label: "สาม", config: { options: OPTIONS } },
      { fieldId: "fourth", type: "dropdown", label: "สี่", config: { options: OPTIONS } },
    ])
    expect(schema.fields.map((field) => field.config)).toStrictEqual(
      Array.from({ length: 4 }, () => ({ options: OPTIONS, allowOther: false })),
    )
  })

  it.each(TYPES)('AC10 %s: option ID "other" gives reserved_id {id: "other"} at its id', (type) => {
    expectConfigRejected(type, { options: [OPTIONS[0], { id: "other", label: "อื่น" }] }, [
      { code: "reserved_id", params: { id: "other" }, path: at("options", 1, "id") },
    ])
  })

  it.each(TYPES)('AC10 %s: "other" is reserved even with allowOther on', (type) => {
    expectConfigRejected(type, { ...WITH_OTHER, options: [{ id: "other", label: "อื่น" }] }, [
      { code: "reserved_id", params: { id: "other" }, path: at("options", 0, "id") },
    ])
  })

  it.each(TYPES)('%s: IDs are case-sensitive, so "Other" and "OTHER" are ordinary IDs', (type) => {
    const options = [
      { id: "Other", label: "a" },
      { id: "OTHER", label: "b" },
    ]
    expect(parsedConfig(type, { options })).toStrictEqual({ options, allowOther: false })
  })

  it.each(TYPES)(
    "AC10 %s: an option ID with a space, a dot, empty or 65 characters is invalid",
    (type) => {
      for (const id of ["Qm2x T8aLp0vW", "a.b", "", "x".repeat(65), "ไทย"]) {
        expectConfigRejected(type, { options: [{ id, label: "x" }] }, [
          invalidAt(...at("options", 0, "id")),
        ])
      }
    },
  )

  it.each(TYPES)("%s: an option ID of 64 URL-safe characters is accepted", (type) => {
    const options = [{ id: `${"A-z_9".repeat(12)}abcd`, label: "x" }]
    expect(parsedConfig(type, { options })).toStrictEqual({ options, allowOther: false })
  })

  it.each(TYPES)(
    "AC18 %s: a missing option ID gives required; a non-string one is invalid",
    (type) => {
      expectConfigRejected(type, { options: [{ label: "x" }] }, [
        { code: "required", params: {}, path: at("options", 0, "id") },
      ])
      expectConfigRejected(type, { options: [{ id: 5, label: "x" }] }, [
        invalidAt(...at("options", 0, "id")),
      ])
    },
  )

  it.each(TYPES)(
    "%s: only `other` is reserved for options, so __proto__, constructor and toString are valid option IDs",
    (type) => {
      const options = [
        { id: "__proto__", label: "โปรโต" },
        { id: "constructor", label: "คอนสตรัคเตอร์" },
        { id: "toString", label: "ทูสตริง" },
      ]
      expect(parsedConfig(type, { options })).toStrictEqual({ options, allowOther: false })
    },
  )
})

// =====================================================================================================
// (c) Answers and "Other" — AC19
// =====================================================================================================

describe("AC19 option answers: accepted and normalised", () => {
  it.each(TYPES)("AC19 %s: one known option is accepted unchanged", (type) => {
    expectAccepted(answer(type, { optionIds: [FRIEND] }, WITH_OTHER), { optionIds: [FRIEND] })
  })

  it.each(TYPES)('AC19 %s: "  TikTok " is normalised to "TikTok"', (type) => {
    expectAccepted(answer(type, { optionIds: ["other"], other: "  TikTok " }, WITH_OTHER), {
      optionIds: ["other"],
      other: "TikTok",
    })
  })

  it.each(TYPES)('AC19 %s: Thai "Other" text is trimmed and otherwise kept', (type) => {
    expectAccepted(
      answer(type, { optionIds: ["other"], other: "\t ไลน์ ที่ทำงาน \n" }, WITH_OTHER),
      {
        optionIds: ["other"],
        other: "ไลน์ ที่ทำงาน",
      },
    )
  })

  it("AC19 checkbox keeps optionIds in answer order (not config order)", () => {
    expectAccepted(answer("checkbox", { optionIds: [FRIEND, FACEBOOK] }, WITHOUT_OTHER), {
      optionIds: [FRIEND, FACEBOOK],
    })
    expectAccepted(
      answer("checkbox", { optionIds: ["other", FRIEND], other: "TikTok" }, EXAMPLE_CHECKBOX),
      { optionIds: ["other", FRIEND], other: "TikTok" },
    )
  })

  it("AC19 validating the normalised set again returns it unchanged", () => {
    const schema = parsed([entry("checkbox", { config: EXAMPLE_CHECKBOX })])
    const first = validateResponse(
      schema,
      { [FIELD_ID]: { optionIds: [FACEBOOK, "other"], other: " TikTok " } },
      registry,
    )
    if (!first.ok) return expect.fail(`expected ok, got ${show(first)}`)
    const normalised: AnswerSet = first.answers
    expect(validateResponse(schema, normalised, registry)).toStrictEqual({
      ok: true,
      answers: normalised,
    })
  })

  it.each(TYPES)(
    "AC19 %s: option IDs such as toString and __proto__ are matched as own options only",
    (type) => {
      const config = {
        options: [
          { id: "toString", label: "ทูสตริง" },
          { id: "__proto__", label: "โปรโต" },
        ],
      }
      expectAccepted(answer(type, { optionIds: ["toString"] }, config), {
        optionIds: ["toString"],
      })
      expectAccepted(answer(type, { optionIds: ["__proto__"] }, config), {
        optionIds: ["__proto__"],
      })
      expectRefused(answer(type, { optionIds: ["hasOwnProperty"] }, config), [
        unknownOption("hasOwnProperty", 0),
      ])
      expectRefused(answer(type, { optionIds: ["constructor"] }, config), [
        unknownOption("constructor", 0),
      ])
    },
  )
})

describe("AC19 choice and dropdown: at most one ID", () => {
  it.each(SINGLE)("AC19 %s with two option IDs gives too_many {max: 1}", (type) => {
    expectRefused(answer(type, { optionIds: [FACEBOOK, FRIEND] }, WITH_OTHER), [tooMany(1)])
  })

  it.each(SINGLE)('AC19 %s with an option and "Other" gives too_many {max: 1}', (type) => {
    expectRefused(answer(type, { optionIds: [FACEBOOK, "other"], other: "TikTok" }, WITH_OTHER), [
      tooMany(1),
    ])
  })
})

describe("AC19 option answers: unknown and repeated IDs", () => {
  it.each(TYPES)("AC19 %s: an ID that is not an option gives unknown_option {optionId}", (type) => {
    expectRefused(answer(type, { optionIds: [REMOVED] }, WITH_OTHER), [unknownOption(REMOVED, 0)])
  })

  it("AC19 checkbox: the unknown ID is reported at its own index", () => {
    expectRefused(answer("checkbox", { optionIds: [FACEBOOK, REMOVED] }, WITHOUT_OTHER), [
      unknownOption(REMOVED, 1),
    ])
  })

  it.each(TYPES)(
    'AC19 %s: "other" while "Other" is off gives unknown_option {optionId: "other"}',
    (type) => {
      expectRefused(answer(type, { optionIds: ["other"], other: "TikTok" }, WITHOUT_OTHER), [
        unknownOption("other", 0),
      ])
    },
  )

  it.each(TYPES)(
    'AC19 %s: "other" while "Other" is off is unknown_option even with otherLabel kept',
    (type) => {
      const config = { options: OPTIONS, allowOther: false, otherLabel: OTHER_LABEL }
      expectRefused(answer(type, { optionIds: ["other"], other: "TikTok" }, config), [
        unknownOption("other", 0),
      ])
    },
  )

  it("AC19 checkbox: a repeated ID gives duplicate {value} at the repeat", () => {
    expectRefused(answer("checkbox", { optionIds: [FACEBOOK, FACEBOOK] }, WITHOUT_OTHER), [
      duplicate(FACEBOOK, 1),
    ])
  })

  it('AC19 checkbox: "other" twice gives duplicate {value: "other"} at the repeat', () => {
    expectRefused(
      answer("checkbox", { optionIds: ["other", FRIEND, "other"], other: "TikTok" }, WITH_OTHER),
      [duplicate("other", 2)],
    )
  })
})

describe('AC19 option answers: the "Other" text', () => {
  it.each(TYPES)(
    'AC19 %s: "Other" selected without the other text gives other_text_required',
    (type) => {
      expectRefused(answer(type, { optionIds: ["other"] }, WITH_OTHER), [otherTextRequired])
    },
  )

  it.each(TYPES)(
    'AC19 %s: { "optionIds": ["other"], "other": null } gives other_text_required (null counts as missing)',
    (type) => {
      expectRefused(answer(type, { optionIds: ["other"], other: null }, WITH_OTHER), [
        otherTextRequired,
      ])
    },
  )

  it.each(TYPES)(
    'AC19 %s: other text "", "  " or only line breaks gives other_text_required',
    (type) => {
      for (const other of ["", "  ", "\n\t "]) {
        expectRefused(answer(type, { optionIds: ["other"], other }, WITH_OTHER), [
          otherTextRequired,
        ])
      }
    },
  )

  it("AC19 checkbox: blank other text next to a known option still gives other_text_required", () => {
    expectRefused(answer("checkbox", { optionIds: [FACEBOOK, "other"], other: " " }, WITH_OTHER), [
      otherTextRequired,
    ])
  })

  it.each(TYPES)("AC19 %s: other text that is not a string is invalid at other", (type) => {
    for (const other of [5, true, ["TikTok"], { text: "TikTok" }]) {
      expectRefused(answer(type, { optionIds: ["other"], other }, WITH_OTHER), [invalidAt("other")])
    }
  })

  it.each(TYPES)(
    'AC19 %s: other text present without the "Other" selection ("TikTok", "", null) is invalid at other',
    (type) => {
      for (const other of ["TikTok", "", null]) {
        expectRefused(answer(type, { optionIds: [FACEBOOK], other }, WITH_OTHER), [
          invalidAt("other"),
        ])
      }
    },
  )

  it.each(TYPES)(
    'AC19 %s: other text without the selection is invalid at other while "Other" is off too',
    (type) => {
      for (const other of ["TikTok", "", null]) {
        expectRefused(answer(type, { optionIds: [FACEBOOK], other }, WITHOUT_OTHER), [
          invalidAt("other"),
        ])
      }
    },
  )

  it.each(TYPES)(
    'AC19 / AC13 %s: { "optionIds": [], "other": "x" } is not unanswered: invalid at other, not required',
    (type) => {
      for (const isRequired of [true, false]) {
        expectRefused(answer(type, { optionIds: [], other: "x" }, WITH_OTHER, isRequired), [
          invalidAt("other"),
        ])
      }
    },
  )

  it.each(TYPES)(
    'AC19 %s: { "optionIds": [], "other": "" } and "other": null are invalid at other too',
    (type) => {
      for (const other of ["", null]) {
        for (const isRequired of [true, false]) {
          expectRefused(answer(type, { optionIds: [], other }, WITHOUT_OTHER, isRequired), [
            invalidAt("other"),
          ])
        }
      }
    },
  )
})

describe("AC19 option answers: wrong shapes are invalid", () => {
  it.each(TYPES)("AC19 %s: a bare ID string is invalid at []", (type) => {
    expectRefused(answer(type, FACEBOOK, WITH_OTHER), [invalidAt()])
    expectRefused(answer(type, "other", WITH_OTHER), [invalidAt()])
  })

  it.each(TYPES)("AC19 %s: a bare list of IDs, a number or a boolean is invalid at []", (type) => {
    for (const value of [[FACEBOOK], 1, true, false, 0]) {
      expectRefused(answer(type, value, WITH_OTHER), [invalidAt()])
    }
  })

  it.each(TYPES)("AC19 %s: optionIds that is not a list is invalid at optionIds", (type) => {
    for (const optionIds of [FACEBOOK, null, { 0: FACEBOOK, length: 1 }, 1]) {
      expectRefused(answer(type, { optionIds }, WITH_OTHER), [invalidAt("optionIds")])
    }
  })

  it.each(TYPES)("AC19 %s: optionIds holding non-strings is invalid (under optionIds)", (type) => {
    for (const optionIds of [[1], [null], [[FACEBOOK]], [{ id: FACEBOOK }], [true]]) {
      expectInvalidUnder(answer(type, { optionIds }, WITH_OTHER), ["optionIds"])
    }
  })

  it.each(TYPES)("AC19 %s: a missing optionIds is invalid at optionIds", (type) => {
    expectRefused(answer(type, {}, WITH_OTHER), [invalidAt("optionIds")])
  })

  it.each(TYPES)("AC19 %s: an extra property is invalid at []", (type) => {
    expectRefused(answer(type, { optionIds: [FACEBOOK], extra: 1 }, WITH_OTHER), [invalidAt()])
    expectRefused(answer(type, { optionIds: [FACEBOOK], value: FACEBOOK }, WITH_OTHER), [
      invalidAt(),
    ])
  })

  it.each(TYPES)(
    "AC19 / AC13 %s: an empty selection with an extra property is not unanswered but invalid",
    (type) => {
      expectRefused(answer(type, { optionIds: [], extra: 1 }, WITH_OTHER, false), [invalidAt()])
    },
  )
})

describe('AC19 checkbox limits: "Other" counts as one selection', () => {
  it('AC19 maxSelections 2: two options plus "Other" give too_many {max: 2}', () => {
    expectRefused(
      answer(
        "checkbox",
        { optionIds: [FACEBOOK, FRIEND, "other"], other: "TikTok" },
        EXAMPLE_CHECKBOX,
      ),
      [tooMany(2)],
    )
  })

  it('AC19 maxSelections 2: one option plus "Other" is valid', () => {
    expectAccepted(
      answer("checkbox", { optionIds: [FACEBOOK, "other"], other: "TikTok" }, EXAMPLE_CHECKBOX),
      { optionIds: [FACEBOOK, "other"], other: "TikTok" },
    )
  })

  it("AC19 maxSelections 2: two options are valid, three IDs are too_many", () => {
    const config = { options: [...OPTIONS, { id: LINE, label: "LINE" }], maxSelections: 2 }
    expectAccepted(answer("checkbox", { optionIds: [FACEBOOK, FRIEND] }, config), {
      optionIds: [FACEBOOK, FRIEND],
    })
    expectRefused(answer("checkbox", { optionIds: [FACEBOOK, FRIEND, LINE] }, config), [tooMany(2)])
  })

  it('AC19 minSelections 2: one option plus "Other" is valid', () => {
    const config = { ...WITH_OTHER, minSelections: 2 }
    expectAccepted(answer("checkbox", { optionIds: [FRIEND, "other"], other: "TikTok" }, config), {
      optionIds: [FRIEND, "other"],
      other: "TikTok",
    })
  })

  it('AC19 minSelections 2: "Other" alone gives too_few {min: 2}', () => {
    const config = { ...WITH_OTHER, minSelections: 2 }
    expectRefused(answer("checkbox", { optionIds: ["other"], other: "TikTok" }, config), [
      tooFew(2),
    ])
  })

  it("AC19 without limits, every option plus Other is valid", () => {
    expectAccepted(
      answer("checkbox", { optionIds: [FRIEND, FACEBOOK, "other"], other: "TikTok" }, WITH_OTHER),
      { optionIds: [FRIEND, FACEBOOK, "other"], other: "TikTok" },
    )
  })

  it("AC19 optional checkbox with minSelections 2: no selection is valid, one gives too_few {min: 2}", () => {
    const config = { options: OPTIONS, minSelections: 2 }
    expectOmitted(answer("checkbox", { optionIds: [] }, config, false))
    expectOmitted(answer("checkbox", null, config, false))
    expectRefused(answer("checkbox", { optionIds: [FACEBOOK] }, config, false), [tooFew(2)])
    expectAccepted(answer("checkbox", { optionIds: [FACEBOOK, FRIEND] }, config, false), {
      optionIds: [FACEBOOK, FRIEND],
    })
  })
})

// =====================================================================================================
// (d) Unanswered — AC13 (empty-selection row)
// =====================================================================================================

describe("AC13 option fields: the empty selection is unanswered", () => {
  it.each(TYPES)('AC13 %s: { "optionIds": [] } on a required field gives required', (type) => {
    expectRefused(answer(type, { optionIds: [] }, WITH_OTHER, true), [required])
  })

  it.each(TYPES)('AC13 %s: { "optionIds": [] } on an optional field is omitted', (type) => {
    expectOmitted(answer(type, { optionIds: [] }, WITH_OTHER, false))
  })

  it.each(TYPES)("AC13 %s: null and an absent key are unanswered too", (type) => {
    expectRefused(answer(type, null, WITH_OTHER, true), [required])
    expectOmitted(answer(type, null, WITH_OTHER, false))
    const schema = parsed([entry(type, { required: true, config: WITH_OTHER })])
    expectRefused(validateResponse(schema, {}, registry), [required])
  })

  it("AC13 a required checkbox with minSelections 0 still needs a selection", () => {
    const config = { options: OPTIONS, minSelections: 0 }
    expectRefused(answer("checkbox", { optionIds: [] }, config, true), [required])
    expectAccepted(answer("checkbox", { optionIds: [FACEBOOK] }, config, true), {
      optionIds: [FACEBOOK],
    })
  })

  it("AC13 a required checkbox with minSelections 2: the empty selection gives required, not too_few", () => {
    const config = { options: OPTIONS, minSelections: 2 }
    expectRefused(answer("checkbox", { optionIds: [] }, config, true), [required])
  })
})

// =====================================================================================================
// (e) Cells — AC20
// =====================================================================================================

describe("AC20 option cells with the example form's config", () => {
  const checkboxConfig = checkboxField.config.parse(EXAMPLE_CHECKBOX)
  const choiceConfig = choiceField.config.parse(WITH_OTHER)
  const dropdownConfig = dropdownField.config.parse(WITH_OTHER)

  it("AC20 choice: an option is written as its label", () => {
    expect(choiceField.toCell({ optionIds: [FRIEND] }, choiceConfig)).toBe("เพื่อนแนะนำ")
    expect(choiceField.toCell({ optionIds: [FACEBOOK] }, choiceConfig)).toBe("Facebook")
  })

  it('AC20 choice: "Other" is written as "อื่นๆ: TikTok"', () => {
    expect(choiceField.toCell({ optionIds: ["other"], other: "TikTok" }, choiceConfig)).toBe(
      "อื่นๆ: TikTok",
    )
  })

  it("AC20 dropdown writes the same cells as choice", () => {
    expect(dropdownField.toCell({ optionIds: [FRIEND] }, dropdownConfig)).toBe("เพื่อนแนะนำ")
    expect(dropdownField.toCell({ optionIds: ["other"], other: "TikTok" }, dropdownConfig)).toBe(
      "อื่นๆ: TikTok",
    )
  })

  it('AC20 checkbox: [c9Rk_4NnYb1E, Qm2xT8aLp0vW] gives "Facebook; เพื่อนแนะนำ" (config order)', () => {
    expect(checkboxField.toCell({ optionIds: [FRIEND, FACEBOOK] }, checkboxConfig)).toBe(
      "Facebook; เพื่อนแนะนำ",
    )
  })

  it('AC20 checkbox: ["other", c9Rk_4NnYb1E] gives "เพื่อนแนะนำ; อื่นๆ: TikTok" ("Other" last)', () => {
    expect(
      checkboxField.toCell({ optionIds: ["other", FRIEND], other: "TikTok" }, checkboxConfig),
    ).toBe("เพื่อนแนะนำ; อื่นๆ: TikTok")
  })

  it('AC20 checkbox: known options, then unknown IDs in answer order, then "Other"', () => {
    expect(
      checkboxField.toCell(
        { optionIds: [REMOVED, FRIEND, "other"], other: "TikTok" },
        checkboxConfig,
      ),
    ).toBe("เพื่อนแนะนำ; Rm0vedOpt123; อื่นๆ: TikTok")
  })

  it("AC20 checkbox: several unknown IDs keep answer order, known ones keep config order", () => {
    expect(
      checkboxField.toCell(
        { optionIds: ["other", "Zz9", FRIEND, "Aa1", FACEBOOK], other: "TikTok" },
        checkboxConfig,
      ),
    ).toBe("Facebook; เพื่อนแนะนำ; Zz9; Aa1; อื่นๆ: TikTok")
  })

  it("AC20 an unknown option ID alone is written as the ID itself", () => {
    expect(checkboxField.toCell({ optionIds: [REMOVED] }, checkboxConfig)).toBe(REMOVED)
    expect(choiceField.toCell({ optionIds: [REMOVED] }, choiceConfig)).toBe(REMOVED)
    expect(dropdownField.toCell({ optionIds: [REMOVED] }, dropdownConfig)).toBe(REMOVED)
  })

  it("AC20 allowOther false with otherLabel kept still writes <otherLabel>: <text>", () => {
    const kept = { options: OPTIONS, allowOther: false, otherLabel: OTHER_LABEL }
    expect(
      choiceField.toCell({ optionIds: ["other"], other: "TikTok" }, choiceField.config.parse(kept)),
    ).toBe("อื่นๆ: TikTok")
    expect(
      checkboxField.toCell(
        { optionIds: [FACEBOOK, "other"], other: "TikTok" },
        checkboxField.config.parse(kept),
      ),
    ).toBe("Facebook; อื่นๆ: TikTok")
  })

  it('AC20 a config without otherLabel writes "other: TikTok"', () => {
    expect(
      choiceField.toCell(
        { optionIds: ["other"], other: "TikTok" },
        choiceField.config.parse(WITHOUT_OTHER),
      ),
    ).toBe("other: TikTok")
    expect(
      dropdownField.toCell(
        { optionIds: ["other"], other: "TikTok" },
        dropdownField.config.parse(WITHOUT_OTHER),
      ),
    ).toBe("other: TikTok")
    expect(
      checkboxField.toCell(
        { optionIds: ["other", FRIEND], other: "TikTok" },
        checkboxField.config.parse(WITHOUT_OTHER),
      ),
    ).toBe("เพื่อนแนะนำ; other: TikTok")
  })

  it("AC20 a relabelled option is written with the label of the config given", () => {
    const relabelled = checkboxField.config.parse({
      options: [{ id: FACEBOOK, label: "เฟซบุ๊ก" }, OPTIONS[1]],
    })
    expect(checkboxField.toCell({ optionIds: [FACEBOOK] }, relabelled)).toBe("เฟซบุ๊ก")
  })

  it('AC20 the cell of a normalised answer holds the trimmed "Other" text', () => {
    const schema = parsed([entry("checkbox", { config: EXAMPLE_CHECKBOX })])
    const result = validateResponse(
      schema,
      { [FIELD_ID]: { optionIds: ["other", FACEBOOK], other: "  TikTok " } },
      registry,
    )
    if (!result.ok) return expect.fail(`expected ok, got ${show(result)}`)
    const normalised = result.answers[FIELD_ID] as { optionIds: string[]; other?: string }
    expect(checkboxField.toCell(normalised, checkboxConfig)).toBe("Facebook; อื่นๆ: TikTok")
  })

  it("AC20 option IDs such as toString and __proto__ get their own labels, never prototype values", () => {
    const config = checkboxField.config.parse({
      options: [
        { id: "toString", label: "ทูสตริง" },
        { id: "__proto__", label: "โปรโต" },
      ],
    })
    expect(checkboxField.toCell({ optionIds: ["__proto__", "toString"] }, config)).toBe(
      "ทูสตริง; โปรโต",
    )
    expect(checkboxField.toCell({ optionIds: ["constructor", "valueOf"] }, config)).toBe(
      "constructor; valueOf",
    )
  })
})

// =====================================================================================================
// (f) Family rows — AC9, AC6, AC7, AC12
// =====================================================================================================

describe("AC9 option fields: allowOther false is written in", () => {
  it.each(TYPES)("AC9 %s without allowOther gets allowOther false, and re-parses equal", (type) => {
    const schema = parsed([entry(type, { config: { options: OPTIONS } })])
    expect(schema.fields[0]?.config).toStrictEqual({ options: OPTIONS, allowOther: false })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("AC9 checkbox limits are kept as given and add no defaults of their own", () => {
    const schema = parsed([
      entry("checkbox", { config: { options: OPTIONS, minSelections: 1, maxSelections: 2 } }),
    ])
    expect(schema.fields[0]?.config).toStrictEqual({
      options: OPTIONS,
      allowOther: false,
      minSelections: 1,
      maxSelections: 2,
    })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("AC9 the example form re-parses to an equal value", () => {
    const schema = parsed([
      entry("checkbox", { config: EXAMPLE_CHECKBOX }),
      { ...entry("choice", { config: WITH_OTHER }), fieldId: "choiceOne" },
      { ...entry("dropdown", { config: WITHOUT_OTHER }), fieldId: "dropdownOne" },
    ])
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })
})

describe("AC6 / AC7 option fields: analytics and stored values", () => {
  it.each(TYPES)("%s: the definition has its type", (type) => {
    expect(DEFINITIONS[type].type).toBe(type)
  })

  it("AC6 choice: storeAs text, summarize counts, groupable", () => {
    expect(storeAsOf(choiceField, choiceField.config.parse(WITHOUT_OTHER))).toBe("text")
    expect(storeAsOf(choiceField, choiceField.config.parse(WITH_OTHER))).toBe("text")
    expect(choiceField.analytics.summarize).toBe("counts")
    expect(choiceField.analytics.groupable).toBe(true)
  })

  it("AC6 dropdown: storeAs text, summarize counts, groupable", () => {
    expect(storeAsOf(dropdownField, dropdownField.config.parse(WITHOUT_OTHER))).toBe("text")
    expect(storeAsOf(dropdownField, dropdownField.config.parse(WITH_OTHER))).toBe("text")
    expect(dropdownField.analytics.summarize).toBe("counts")
    expect(dropdownField.analytics.groupable).toBe(true)
  })

  it("AC6 checkbox: storeAs text, summarize counts, groupable", () => {
    expect(storeAsOf(checkboxField, checkboxField.config.parse(WITHOUT_OTHER))).toBe("text")
    expect(storeAsOf(checkboxField, checkboxField.config.parse(EXAMPLE_CHECKBOX))).toBe("text")
    expect(checkboxField.analytics.summarize).toBe("counts")
    expect(checkboxField.analytics.groupable).toBe(true)
  })

  it('AC7 checkbox { optionIds: [Qm2xT8aLp0vW, "other"], other: "TikTok" } stores [Qm2xT8aLp0vW, "other"] without the text', () => {
    const config = checkboxField.config.parse(EXAMPLE_CHECKBOX)
    expect(
      checkboxField.storedValues({ optionIds: [FACEBOOK, "other"], other: "TikTok" }, config),
    ).toStrictEqual([FACEBOOK, "other"])
  })

  it("AC7 checkbox stores one value per selected ID in answer order", () => {
    const config = checkboxField.config.parse(WITH_OTHER)
    expect(
      checkboxField.storedValues({ optionIds: ["other", FRIEND, FACEBOOK], other: "x" }, config),
    ).toStrictEqual(["other", FRIEND, FACEBOOK])
    expect(checkboxField.storedValues({ optionIds: [FRIEND] }, config)).toStrictEqual([FRIEND])
  })

  it('AC7 choice with "Other" stores ["other"]; with an option, that option ID', () => {
    const config = choiceField.config.parse(WITH_OTHER)
    expect(
      choiceField.storedValues({ optionIds: ["other"], other: "TikTok" }, config),
    ).toStrictEqual(["other"])
    expect(choiceField.storedValues({ optionIds: [FRIEND] }, config)).toStrictEqual([FRIEND])
  })

  it('AC7 dropdown with "Other" stores ["other"]; with an option, that option ID', () => {
    const config = dropdownField.config.parse(WITH_OTHER)
    expect(
      dropdownField.storedValues({ optionIds: ["other"], other: "TikTok" }, config),
    ).toStrictEqual(["other"])
    expect(dropdownField.storedValues({ optionIds: [FACEBOOK] }, config)).toStrictEqual([FACEBOOK])
  })
})

describe("AC12 option fields: the hostile-JSON corpus never throws", () => {
  const hostileFields = [
    { fieldId: "choiceOther", type: "choice", required: true, config: WITH_OTHER },
    { fieldId: "dropdownPlain", type: "dropdown", required: false, config: WITHOUT_OTHER },
    {
      fieldId: "checkboxLimits",
      type: "checkbox",
      required: true,
      config: { ...WITH_OTHER, minSelections: 1, maxSelections: 2 },
    },
    {
      fieldId: "checkboxMinTwo",
      type: "checkbox",
      required: false,
      config: { options: OPTIONS, minSelections: 2 },
    },
  ] as const
  const hostileForm = parsed(hostileFields.map((field) => ({ ...field, label: "ช่องทาง" })))
  const answerCodes = new Set([
    "invalid",
    "unknown_option",
    "duplicate",
    "too_many",
    "too_few",
    "other_text_required",
  ])

  /** The empty selection exactly: a plain object whose only own key is an empty `optionIds`. */
  function isEmptySelection(value: unknown): boolean {
    if (!isJsonObject(value)) return false
    const keys = Object.keys(value)
    const optionIds = value.optionIds
    return (
      keys.length === 1 &&
      keys[0] === "optionIds" &&
      Array.isArray(optionIds) &&
      optionIds.length === 0
    )
  }

  it.each(hostileJson)(
    "AC12 as every option answer: $name",
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
        if (value === null || isEmptySelection(value)) {
          if (isRequired) expectIssues(issues, [required])
          else expect(issues, fieldId).toBeUndefined()
          expect(Object.hasOwn(normalised, fieldId), fieldId).toBe(false)
          continue
        }
        if (!isJsonObject(value)) {
          expectIssues(issues, [invalidAt()])
          continue
        }
        // No corpus object is a valid option answer for these configs.
        if (issues === undefined) return expect.fail(`${fieldId}: ${show(value)} must be refused`)
        const parsedIssues = parseIssues(issues)
        for (const issue of parsedIssues) {
          expect(answerCodes.has(issue.code), `${fieldId}: ${issue.code}`).toBe(true)
        }
        const extraKeys = Object.keys(value).filter((key) => key !== "optionIds" && key !== "other")
        if (extraKeys.length > 0) {
          expect(parsedIssues, `${fieldId}: extra key`).toContainEqual(invalidAt())
        }
      }
    },
  )

  it.each(TYPES)("AC12 %s: every hostile value as config gives catalogue issues only", (type) => {
    for (const { name, value } of hostileJson) {
      const result = parseFormSchema(formOf([entry(type, { config: value })]), registry)
      if (!isJsonObject(value)) {
        if (result.ok) expect.fail(`${name}: a non-object config must be refused`)
        expectIssues(result.issues, [invalidAt(...CONFIG_PATH)])
        continue
      }
      // No corpus key is an option config key: each is an unknown property, and options is missing.
      if (result.ok) expect.fail(`${name}: a config without options must be refused`)
      expectIssues(result.issues, [
        { code: "required", params: {}, path: at("options") },
        ...Object.keys(value).map((key): Issue => ({
          code: "unknown_property",
          params: { key },
          path: at(key),
        })),
      ])
    }
  })

  it.each(TYPES)(
    "AC12 %s: every hostile value as options or as an option entry is refused",
    (type) => {
      for (const { name, value } of hostileJson) {
        for (const options of [value, [value], [OPTIONS[0], value]]) {
          const result = parseFormSchema(formOf([entry(type, { config: { options } })]), registry)
          if (result.ok) expect.fail(`${name}: options ${show(options)} must be refused`)
          parseIssues(result.issues)
        }
      }
    },
  )

  it.each(TYPES)("AC12 %s: every hostile value as an option ID", (type) => {
    for (const { name, value } of hostileJson) {
      const result = parseFormSchema(
        formOf([entry(type, { config: { options: [{ id: value, label: "x" }] } })]),
        registry,
      )
      const validId = typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)
      if (validId && value !== "other") {
        if (!result.ok) expect.fail(`${name}: a valid ID was refused: ${show(result.issues)}`)
        continue
      }
      if (result.ok) expect.fail(`${name}: option ID ${show(value)} must be refused`)
      expectIssues(result.issues, [
        value === "other"
          ? { code: "reserved_id", params: { id: "other" }, path: at("options", 0, "id") }
          : invalidAt(...at("options", 0, "id")),
      ])
    }
  })

  it.each(TYPES)("AC12 %s: every hostile value as an option label and as otherLabel", (type) => {
    for (const { name, value } of hostileJson) {
      const valid = typeof value === "string" && value.trim() !== ""
      const expected = (path: Path): Issue[] =>
        typeof value === "string" ? [{ code: "required", params: {}, path }] : [invalidAt(...path)]

      const label = parseFormSchema(
        formOf([entry(type, { config: { options: [{ id: FACEBOOK, label: value }] } })]),
        registry,
      )
      const other = parseFormSchema(
        formOf([
          entry(type, { config: { options: OPTIONS, allowOther: true, otherLabel: value } }),
        ]),
        registry,
      )
      if (valid) {
        if (!label.ok) expect.fail(`${name}: a non-blank label was refused`)
        if (!other.ok) expect.fail(`${name}: a non-blank otherLabel was refused`)
        continue
      }
      if (label.ok) expect.fail(`${name}: label ${show(value)} must be refused`)
      if (other.ok) expect.fail(`${name}: otherLabel ${show(value)} must be refused`)
      expectIssues(label.issues, expected(at("options", 0, "label")))
      expectIssues(other.issues, expected(at("otherLabel")))
    }
  })

  it.each(TYPES)("AC12 %s: every hostile value as allowOther", (type) => {
    for (const { name, value } of hostileJson) {
      const result = parseFormSchema(
        formOf([
          entry(type, { config: { options: OPTIONS, allowOther: value, otherLabel: OTHER_LABEL } }),
        ]),
        registry,
      )
      if (typeof value === "boolean") {
        if (!result.ok) expect.fail(`${name}: a boolean allowOther was refused`)
        continue
      }
      if (result.ok) expect.fail(`${name}: allowOther ${show(value)} must be refused`)
      expectIssues(result.issues, [invalidAt(...at("allowOther"))])
    }
  })

  it("AC12 checkbox: every hostile value as minSelections and as maxSelections", () => {
    const limitCodes = new Set(["invalid", "not_integer", "too_small", "too_big", "invalid_range"])
    for (const { name, value } of hostileJson) {
      for (const key of ["minSelections", "maxSelections"] as const) {
        const result = parseFormSchema(
          formOf([entry("checkbox", { config: { options: OPTIONS, [key]: value } })]),
          registry,
        )
        if (typeof value !== "number") {
          if (result.ok) expect.fail(`${name}: ${key} ${show(value)} must be refused`)
          expectIssues(result.issues, [invalidAt(...at(key))])
          continue
        }
        const valid =
          Number.isInteger(value) &&
          (key === "minSelections" ? value >= 0 && value <= 2 : value >= 1)
        if (valid && Number.isSafeInteger(value)) {
          if (!result.ok) expect.fail(`${name}: ${key} ${String(value)} was refused`)
          continue
        }
        if (!valid && result.ok) expect.fail(`${name}: ${key} ${String(value)} must be refused`)
        if (!result.ok) {
          for (const issue of parseIssues(result.issues)) {
            expect(limitCodes.has(issue.code), `${name}: ${issue.code}`).toBe(true)
          }
        }
      }
    }
  })
})
