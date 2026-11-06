import { describe, expect, it } from "vitest"
import * as z from "zod"
import {
  checkVersionHistory,
  createFieldRegistry,
  defineField,
  type FieldDefinition,
  type FieldRegistry,
  type FormSchema,
  type Issue,
  parseFormSchema,
} from "../src/api"
import { checkboxField } from "../src/fields/checkbox"
import { choiceField } from "../src/fields/choice"
import { dateField } from "../src/fields/date"
import { dropdownField } from "../src/fields/dropdown"
import { fileField } from "../src/fields/file"
import { numberField } from "../src/fields/number"
import { ratingField } from "../src/fields/rating"
import { textField } from "../src/fields/text"
import { textareaField } from "../src/fields/textarea"
import { acmeMeasure, acmeSignature } from "./fixtures/third-party"
import { expectIssues } from "./helpers/issues"

// T029 — the version-history check (spec US7, R19, R1, R2, R12; Edge cases "Failure"; plan
// "Version history"; ADR 0009 as amended). Written before T031 implements it. Proves:
//   AC26 — a type change gives only `field_type_changed` (no `field_kind_changed`, although the
//          stored kind changes too); label, help, required and order changes, kind-preserving
//          config changes, a removed field and a removed field re-added compatibly are accepted;
//          no earlier version is accepted; history input: the latest is the highest `version`
//          whatever the order, a non-positive-safe-integer `version` gives `invalid` and a repeat
//          gives `duplicate {value}` at `["earlier", k, "version"]`, returned alone; a registry
//          miss on a shared type gives `unknown_field_type` at `["fields", i, "type"]` and skips
//          the field, while a type change needs no lookup (P04);
//   AC27 — `date` `includeTime` flipped either way gives `field_kind_changed`, a label-only change
//          passes, the `acme/measure` fixture's config-dependent kind flip gives
//          `field_kind_changed`;
//   AC29 — `rating` `max` changed (5 → 10, 10 → 5, and after a version without the field) gives
//          `field_config_incompatible {properties: ["max"]}`, `icon` only passes, compatible
//          changes of the other built-ins pass, `acme/signature`'s own rule is honoured, and a
//          third-party `rating` without a rule accepts the same `max` change (no special case);
//   AC8  — every failure goes through `expectIssues` (strict `issueSchema`).
//
// Contract assumed (plan "Public API surface", "Version history"):
// `checkVersionHistory(earlier: readonly { version: number; schema: FormSchema }[],
// candidate: FormSchema, registry: FieldRegistry): { ok: true } | { ok: false; issues: readonly
// Issue[] }`, exported from `src/api.ts` (and the barrel).
// - Version input first: each `version` a positive safe integer, else `invalid {}`; a repeat gives
//   `duplicate {value: version}` at the repeat; both at `["earlier", k, "version"]` (k = index as
//   passed). Any such issue → only those issues, no field compared. Empty `earlier` → ok.
// - Per candidate field `i`: walk earlier versions from the highest `version` down, stop at the
//   first one where the same `fieldId` conflicts; checks in order: `type` differs →
//   `field_type_changed {fieldId, previousType, type, version}`; else `storeAsOf` differs →
//   `field_kind_changed {fieldId, type, previousStoreAs, storeAs, version}`; else
//   `definition.incompatibleChanges(previousConfig, config)` non-empty →
//   `field_config_incompatible {fieldId, type, properties, version}`. Path `["fields", i]`; one
//   issue per conflicting `fieldId`; `version` is the earlier version's number.
// - Checks 2–3 need the registry's definition of the shared `type`; a miss →
//   `unknown_field_type {type}` at `["fields", i, "type"]`, the field is skipped, nothing throws.
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment.

type Json = Record<string, unknown>
type Result = ReturnType<typeof checkVersionHistory>

const ALL_FIELDS: readonly FieldDefinition[] = [
  textField,
  textareaField,
  numberField,
  choiceField,
  dropdownField,
  checkboxField,
  dateField,
  ratingField,
  fileField,
  acmeSignature,
  acmeMeasure,
]
const registry = createFieldRegistry(ALL_FIELDS)

// Field IDs as `generateId` would make them (12 base64url characters).
const A = "k3Jx9aQ2mTzL"
const B = "Qm2xT8aLp0vW"
const C = "Sg9-xQ2mLp0T"

/** A field entry as stored, with a Thai label unless one is given. */
function field(fieldId: string, type: string, config?: Json, extra: Json = {}): Json {
  return {
    fieldId,
    type,
    label: "คำถามที่หนึ่ง",
    ...(config === undefined ? {} : { config }),
    ...extra,
  }
}

/** Parses a Form Schema with `fields` through the public read entry point; fails if invalid. */
function schema(fields: readonly Json[], using: FieldRegistry = registry): FormSchema {
  const result = parseFormSchema(
    { schemaVersion: 1, meta: { title: "แบบสอบถาม", language: "th" }, fields },
    using,
  )
  if (!result.ok) return expect.fail(`fixture schema must parse: ${JSON.stringify(result)}`)
  return result.schema
}

function v(version: number, fields: readonly Json[], using: FieldRegistry = registry) {
  return { version, schema: schema(fields, using) }
}

function expectOk(result: Result): void {
  expect(result).toStrictEqual({ ok: true })
}

function expectRefused(result: Result, expected: readonly Issue[]): void {
  if (result.ok) return expect.fail(`expected a refusal, got ${JSON.stringify(result)}`)
  expectIssues(result.issues, expected)
}

const RATING_5 = { max: 5, icon: "star" }
const RATING_10 = { max: 10, icon: "star" }

// --- AC26: type change, accepted changes, empty history -----------------------------------------

describe("AC26 a type change under the same fieldId", () => {
  it("text in v1, number in the candidate gives only field_type_changed {version: 1}", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "text")])],
      schema([field(A, "number")]),
      registry,
    )
    // The stored kind changes too (text → number), but only the type change is reported.
    expectRefused(result, [
      {
        code: "field_type_changed",
        params: { fieldId: A, previousType: "text", type: "number", version: 1 },
        path: ["fields", 0],
      },
    ])
  })

  it("a type change with the same stored kind (text → textarea) is refused too", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "text")])],
      schema([field(A, "textarea")]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_type_changed",
        params: { fieldId: A, previousType: "text", type: "textarea", version: 1 },
        path: ["fields", 0],
      },
    ])
  })

  it("the path is the field's index in the candidate, not in the earlier version", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "text"), field(B, "number")])],
      schema([field(C, "text"), field(B, "number"), field(A, "date")]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_type_changed",
        params: { fieldId: A, previousType: "text", type: "date", version: 1 },
        path: ["fields", 2],
      },
    ])
  })
})

describe("AC26 accepted changes", () => {
  it("no earlier version (a form never published) is accepted", () => {
    expectOk(
      checkVersionHistory([], schema([field(A, "rating", RATING_10), field(B, "text")]), registry),
    )
  })

  it("label, help, required and order changes are accepted", () => {
    const earlier = [
      v(1, [
        field(A, "text", undefined, { label: "ชื่อ", help: "ชื่อจริง", required: false }),
        field(B, "rating", RATING_5, { label: "ให้คะแนน" }),
      ]),
    ]
    const candidate = schema([
      field(B, "rating", RATING_5, { label: "ให้คะแนนบริการของเรา", required: true }),
      field(A, "text", undefined, {
        label: "ชื่อ-นามสกุล",
        help: "ภาษาไทยหรืออังกฤษ",
        required: true,
      }),
    ])
    expectOk(checkVersionHistory(earlier, candidate, registry))
  })

  it("a config change that keeps the stored kind and no rule refuses is accepted (number bounds)", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "number", { min: 0, max: 10 })])],
      schema([field(A, "number", { min: -5, max: 100, integer: true })]),
      registry,
    )
    expectOk(result)
  })

  it("a field removed in the candidate is accepted", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "text"), field(B, "rating", RATING_5)])],
      schema([field(A, "text")]),
      registry,
    )
    expectOk(result)
  })

  it("a new field in the candidate is accepted", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "text")])],
      schema([field(A, "text"), field(B, "rating", RATING_10)]),
      registry,
    )
    expectOk(result)
  })

  it("a removed field re-added with the same type, stored kind and a compatible config is accepted", () => {
    const result = checkVersionHistory(
      [
        v(1, [field(A, "text"), field(B, "rating", { max: 5, icon: "star" })]),
        v(2, [field(A, "text")]),
      ],
      schema([
        field(A, "text"),
        field(B, "rating", { max: 5, icon: "heart" }, { label: "กลับมา" }),
      ]),
      registry,
    )
    expectOk(result)
  })
})

// --- AC26: history input ------------------------------------------------------------------------

describe("AC26 history input: the latest earlier version is the highest version number", () => {
  const v1 = v(1, [field(A, "text")])
  const v2 = v(2, [field(A, "text")])
  const candidate = schema([field(A, "number")])
  const expected: Issue[] = [
    {
      code: "field_type_changed",
      params: { fieldId: A, previousType: "text", type: "number", version: 2 },
      path: ["fields", 0],
    },
  ]

  it("[v1, v2] gives field_type_changed against version 2", () => {
    expectRefused(checkVersionHistory([v1, v2], candidate, registry), expected)
  })

  it("[v2, v1] gives the same result (version number, not list position)", () => {
    expectRefused(checkVersionHistory([v2, v1], candidate, registry), expected)
  })

  it("every order of three versions gives the same result", () => {
    const history = [
      v(1, [field(A, "rating", RATING_5)]),
      v(2, [field(A, "rating", { max: 7, icon: "star" })]),
      v(3, [field(A, "rating", { max: 7, icon: "heart" })]),
    ] as const
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ] as const
    for (const order of orders) {
      const result = checkVersionHistory(
        order.map((index) => history[index]),
        schema([field(A, "rating", RATING_10)]),
        registry,
      )
      expectRefused(result, [
        {
          code: "field_config_incompatible",
          params: { fieldId: A, type: "rating", properties: ["max"], version: 3 },
          path: ["fields", 0],
        },
      ])
    }
  })

  it("non-consecutive version numbers are fine (latest = highest)", () => {
    const result = checkVersionHistory(
      [v(40, [field(A, "text")]), v(7, [field(A, "number")])],
      schema([field(A, "number")]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_type_changed",
        params: { fieldId: A, previousType: "text", type: "number", version: 40 },
        path: ["fields", 0],
      },
    ])
  })
})

describe("AC26 history input: bad and repeated version numbers are returned alone", () => {
  // Each history below also holds a real field conflict (text → number), which must not appear.
  const conflicting = [field(A, "text")]
  const candidate = schema([field(A, "number")])

  it.each([
    { name: "0", version: 0 },
    { name: "-1", version: -1 },
    { name: "1.5", version: 1.5 },
    { name: "NaN", version: Number.NaN },
    { name: "Infinity", version: Number.POSITIVE_INFINITY },
    { name: "2^53 (not a safe integer)", version: 2 ** 53 },
  ])("version $name gives invalid at [earlier, k, version] and nothing else", ({ version }) => {
    const result = checkVersionHistory(
      [v(1, conflicting), v(version, conflicting)],
      candidate,
      registry,
    )
    expectRefused(result, [{ code: "invalid", params: {}, path: ["earlier", 1, "version"] }])
  })

  it("a version that is not a number at all (JavaScript caller) gives invalid", () => {
    const bad = { version: "2" as unknown as number, schema: schema(conflicting) }
    const result = checkVersionHistory([bad, v(1, conflicting)], candidate, registry)
    expectRefused(result, [{ code: "invalid", params: {}, path: ["earlier", 0, "version"] }])
  })

  it("the largest safe integer is a valid version", () => {
    const result = checkVersionHistory(
      [v(Number.MAX_SAFE_INTEGER, [field(A, "number")])],
      candidate,
      registry,
    )
    expectOk(result)
  })

  it("a repeated version gives duplicate {value} at the repeat only", () => {
    const result = checkVersionHistory(
      [v(1, conflicting), v(2, conflicting), v(1, conflicting)],
      candidate,
      registry,
    )
    expectRefused(result, [
      { code: "duplicate", params: { value: 1 }, path: ["earlier", 2, "version"] },
    ])
  })

  it("a version passed three times gives duplicate at each repeat", () => {
    const result = checkVersionHistory(
      [v(3, conflicting), v(3, conflicting), v(3, conflicting)],
      candidate,
      registry,
    )
    expectRefused(result, [
      { code: "duplicate", params: { value: 3 }, path: ["earlier", 1, "version"] },
      { code: "duplicate", params: { value: 3 }, path: ["earlier", 2, "version"] },
    ])
  })

  it("invalid and duplicate together are both returned, and still no field issue", () => {
    const result = checkVersionHistory(
      [v(0, conflicting), v(2, conflicting), v(2, conflicting)],
      candidate,
      registry,
    )
    expectRefused(result, [
      { code: "invalid", params: {}, path: ["earlier", 0, "version"] },
      { code: "duplicate", params: { value: 2 }, path: ["earlier", 2, "version"] },
    ])
  })
})

describe("AC26 history input: a registry without the definition", () => {
  const withoutSignature = createFieldRegistry(
    ALL_FIELDS.filter((definition) => definition.type !== "acme/signature"),
  )

  it("a type shared with an earlier version but missing from the registry gives unknown_field_type and the field is skipped", () => {
    // svg → png would be refused by acme/signature's rule, but the rule cannot be read here.
    const earlier = [v(1, [field(A, "acme/signature", { format: "svg" })])]
    const candidate = schema([field(A, "acme/signature", { format: "png" })])
    const run = () => checkVersionHistory(earlier, candidate, withoutSignature)
    expect(run).not.toThrow()
    expectRefused(run(), [
      {
        code: "unknown_field_type",
        params: { type: "acme/signature" },
        path: ["fields", 0, "type"],
      },
    ])
  })

  it("one unknown_field_type per field, however many earlier versions share the type", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "acme/signature")]), v(2, [field(A, "acme/signature")])],
      schema([field(A, "acme/signature")]),
      withoutSignature,
    )
    expectRefused(result, [
      {
        code: "unknown_field_type",
        params: { type: "acme/signature" },
        path: ["fields", 0, "type"],
      },
    ])
  })

  it("the other fields are still compared", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "rating", RATING_5), field(B, "acme/signature"), field(C, "text")])],
      schema([field(C, "text"), field(B, "acme/signature"), field(A, "rating", RATING_10)]),
      withoutSignature,
    )
    expectRefused(result, [
      {
        code: "unknown_field_type",
        params: { type: "acme/signature" },
        path: ["fields", 1, "type"],
      },
      {
        code: "field_config_incompatible",
        params: { fieldId: A, type: "rating", properties: ["max"], version: 1 },
        path: ["fields", 2],
      },
    ])
  })

  it("an earlier type missing from the registry, with a different candidate type, gives field_type_changed (no lookup, P04)", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "acme/signature")])],
      schema([field(A, "text")]),
      withoutSignature,
    )
    expectRefused(result, [
      {
        code: "field_type_changed",
        params: { fieldId: A, previousType: "acme/signature", type: "text", version: 1 },
        path: ["fields", 0],
      },
    ])
  })

  it("a candidate type missing from the registry, with a different earlier type, gives field_type_changed", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "text")])],
      schema([field(A, "acme/signature")]),
      withoutSignature,
    )
    expectRefused(result, [
      {
        code: "field_type_changed",
        params: { fieldId: A, previousType: "text", type: "acme/signature", version: 1 },
        path: ["fields", 0],
      },
    ])
  })
})

// --- AC27: stored-kind changes -------------------------------------------------------------------

describe("AC27 a stored-kind change under the same fieldId and type", () => {
  it("date includeTime false → true gives field_kind_changed {date → datetime, version: 1}", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "date", { includeTime: false })])],
      schema([field(A, "date", { includeTime: true })]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_kind_changed",
        params: {
          fieldId: A,
          type: "date",
          previousStoreAs: "date",
          storeAs: "datetime",
          version: 1,
        },
        path: ["fields", 0],
      },
    ])
  })

  it("date includeTime true → false is refused too", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "date", { includeTime: true })])],
      schema([field(A, "date")]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_kind_changed",
        params: {
          fieldId: A,
          type: "date",
          previousStoreAs: "datetime",
          storeAs: "date",
          version: 1,
        },
        path: ["fields", 0],
      },
    ])
  })

  it("the same date field with only its label changed passes", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "date", { includeTime: true }, { label: "วันเกิด" })])],
      schema([field(A, "date", { includeTime: true }, { label: "วันและเวลาเกิด" })]),
      registry,
    )
    expectOk(result)
  })

  it("the acme/measure fixture flipping its config-dependent kind gives field_kind_changed", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "acme/measure", { mode: "exact" })])],
      schema([field(A, "acme/measure", { mode: "band" })]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_kind_changed",
        params: {
          fieldId: A,
          type: "acme/measure",
          previousStoreAs: "number",
          storeAs: "text",
          version: 1,
        },
        path: ["fields", 0],
      },
    ])
  })

  it("the kind check comes before the config rule: one field_kind_changed, no field_config_incompatible", () => {
    // Test-local plugin: its rule refuses any `mode` change, and `mode` also picks the kind.
    const gauge = defineField({
      type: "acme/gauge",
      config: z.strictObject({ mode: z.enum(["exact", "band"]).default("exact") }),
      answer: () => z.string(),
      toCell: (answer) => answer,
      storedValues: (answer) => [answer],
      incompatibleChanges: (previous, next) => (previous.mode === next.mode ? [] : ["mode"]),
      analytics: {
        storeAs: {
          kinds: ["number", "text"],
          pick: (config) => (config.mode === "exact" ? "number" : "text"),
        },
        summarize: "count",
        groupable: false,
      },
    })
    const withGauge = createFieldRegistry([gauge])
    const result = checkVersionHistory(
      [v(1, [field(A, "acme/gauge", { mode: "exact" })], withGauge)],
      schema([field(A, "acme/gauge", { mode: "band" })], withGauge),
      withGauge,
    )
    expectRefused(result, [
      {
        code: "field_kind_changed",
        params: {
          fieldId: A,
          type: "acme/gauge",
          previousStoreAs: "number",
          storeAs: "text",
          version: 1,
        },
        path: ["fields", 0],
      },
    ])
  })

  it("against the most recent conflicting version: v1 text, v2 date, candidate datetime gives field_kind_changed against v2", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "text")]), v(2, [field(A, "date")])],
      schema([field(A, "date", { includeTime: true })]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_kind_changed",
        params: {
          fieldId: A,
          type: "date",
          previousStoreAs: "date",
          storeAs: "datetime",
          version: 2,
        },
        path: ["fields", 0],
      },
    ])
  })
})

// --- AC29: declared-incompatible config changes --------------------------------------------------

describe("AC29 rating max is declared incompatible by the rating definition", () => {
  const refusedMax = (version: number): Issue[] => [
    {
      code: "field_config_incompatible",
      params: { fieldId: A, type: "rating", properties: ["max"], version },
      path: ["fields", 0],
    },
  ]

  it("max 5 in v1, 10 in the candidate gives field_config_incompatible {properties: [max], version: 1}", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "rating", RATING_5)])],
      schema([field(A, "rating", RATING_10)]),
      registry,
    )
    expectRefused(result, refusedMax(1))
  })

  it("max 10 → 5 is refused too", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "rating", RATING_10)])],
      schema([field(A, "rating", RATING_5)]),
      registry,
    )
    expectRefused(result, refusedMax(1))
  })

  it("max 5 in v1, no field in v2, max 10 in the candidate is refused against v1", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "rating", RATING_5)]), v(2, [field(B, "text")])],
      schema([field(A, "rating", RATING_10), field(B, "text")]),
      registry,
    )
    expectRefused(result, refusedMax(1))
  })

  it("max 5 in v1, 10 in v2, 10 in the candidate is refused against v1 (v2 agrees)", () => {
    const result = checkVersionHistory(
      [v(2, [field(A, "rating", RATING_10)]), v(1, [field(A, "rating", RATING_5)])],
      schema([field(A, "rating", RATING_10)]),
      registry,
    )
    expectRefused(result, refusedMax(1))
  })

  it("one issue per fieldId, against the most recent conflict: v1 max 5, v2 max 7, candidate 10", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "rating", RATING_5)]), v(2, [field(A, "rating", { max: 7, icon: "star" })])],
      schema([field(A, "rating", RATING_10)]),
      registry,
    )
    expectRefused(result, refusedMax(2))
  })

  it("one issue per conflicting fieldId, each at its candidate index", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "rating", RATING_5), field(B, "date"), field(C, "text")])],
      schema([field(C, "text"), field(B, "date", { includeTime: true }), field(A, "number")]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_kind_changed",
        params: {
          fieldId: B,
          type: "date",
          previousStoreAs: "date",
          storeAs: "datetime",
          version: 1,
        },
        path: ["fields", 1],
      },
      {
        code: "field_type_changed",
        params: { fieldId: A, previousType: "rating", type: "number", version: 1 },
        path: ["fields", 2],
      },
    ])
  })

  it("an icon-only change passes", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "rating", { max: 5, icon: "star" })])],
      schema([field(A, "rating", { max: 5, icon: "heart" })]),
      registry,
    )
    expectOk(result)
  })

  it("a rating with defaults in v1 and an explicit max 5 in the candidate passes", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "rating")])],
      schema([field(A, "rating", { max: 5 })]),
      registry,
    )
    expectOk(result)
  })
})

describe("AC29 compatible config changes of the other built-ins pass", () => {
  const options = [
    { id: "opt-a", label: "แดง" },
    { id: "opt-b", label: "เขียว" },
    { id: "opt-c", label: "น้ำเงิน" },
  ]
  // One option removed, one relabelled, one added, "Other" switched on.
  const changedOptions = {
    options: [
      { id: "opt-a", label: "สีแดง" },
      { id: "opt-d", label: "เหลือง" },
    ],
    allowOther: true,
    otherLabel: "อื่น ๆ",
  }

  it.each([
    { type: "number", before: { integer: false }, after: { integer: true } },
    { type: "number", before: { integer: true, min: 1 }, after: { integer: false, max: 3 } },
    { type: "choice", before: { options }, after: changedOptions },
    { type: "dropdown", before: { options }, after: changedOptions },
    {
      type: "checkbox",
      before: { options, maxSelections: 2 },
      after: { ...changedOptions, minSelections: 1 },
    },
    { type: "checkbox", before: { ...changedOptions }, after: { options } },
    { type: "text", before: { maxLength: 50 }, after: { maxLength: 200 } },
    { type: "textarea", before: { maxLength: 500 }, after: { minLength: 10, maxLength: 100 } },
    { type: "file", before: { maxFiles: 1 }, after: { maxFiles: 5 } },
    {
      type: "file",
      before: { maxFiles: 3, allowedTypes: ["image/png"] },
      after: { maxFiles: 3, maxSize: 1048576 },
    },
    { type: "date", before: { includeTime: true }, after: { includeTime: true } },
  ])("$type $before → $after passes", ({ type, before, after }) => {
    const result = checkVersionHistory(
      [v(1, [field(A, type, before)])],
      schema([field(A, type, after)]),
      registry,
    )
    expectOk(result)
  })
})

describe("AC29 third-party rules go through the same definition call", () => {
  it("acme/signature's own rule: a format change gives field_config_incompatible {properties: [format]}", () => {
    const result = checkVersionHistory(
      [v(3, [field(A, "acme/signature", { format: "svg" })])],
      schema([field(A, "acme/signature", { format: "png" })]),
      registry,
    )
    expectRefused(result, [
      {
        code: "field_config_incompatible",
        params: { fieldId: A, type: "acme/signature", properties: ["format"], version: 3 },
        path: ["fields", 0],
      },
    ])
  })

  it("acme/signature: a maxStrokes change passes (its rule accepts it)", () => {
    const result = checkVersionHistory(
      [v(1, [field(A, "acme/signature", { format: "svg", maxStrokes: 10 })])],
      schema([field(A, "acme/signature", { format: "svg", maxStrokes: 200 })]),
      registry,
    )
    expectOk(result)
  })

  it("the rule receives the earlier parsed config first and the candidate's second", () => {
    const calls: [unknown, unknown][] = []
    // Test-local plugin: only a shrinking scale is incompatible, so argument order shows.
    const scale = defineField({
      type: "acme/scale",
      config: z.strictObject({ points: z.int().min(2).default(5), note: z.string().default("") }),
      answer: () => z.int(),
      toCell: (answer) => String(answer),
      storedValues: (answer) => [answer],
      incompatibleChanges: (previous, next) => {
        calls.push([previous, next])
        return next.points < previous.points ? ["points"] : []
      },
      analytics: { storeAs: "number", summarize: "count", groupable: false },
    })
    const withScale = createFieldRegistry([scale])

    const growing = checkVersionHistory(
      [v(1, [field(A, "acme/scale", { points: 5 })], withScale)],
      schema([field(A, "acme/scale", { points: 7 })], withScale),
      withScale,
    )
    expectOk(growing)
    expect(calls).toStrictEqual([
      [
        { points: 5, note: "" },
        { points: 7, note: "" },
      ],
    ])

    const shrinking = checkVersionHistory(
      [v(1, [field(A, "acme/scale", { points: 7 })], withScale)],
      schema([field(A, "acme/scale", { points: 5 })], withScale),
      withScale,
    )
    expectRefused(shrinking, [
      {
        code: "field_config_incompatible",
        params: { fieldId: A, type: "acme/scale", properties: ["points"], version: 1 },
        path: ["fields", 0],
      },
    ])
  })

  it("a third-party definition registered as rating without a rule accepts the same max change (no built-in special case)", () => {
    const plainRating = defineField({
      type: "rating",
      config: z.strictObject({
        max: z.int().min(2).max(10).default(5),
        icon: z.enum(["star", "heart"]).default("star"),
      }),
      answer: (config) => z.int().min(1).max(config.max),
      toCell: (answer) => String(answer),
      storedValues: (answer) => [answer],
      analytics: { storeAs: "number", summarize: "distribution+avg", groupable: true },
    })
    const withPlainRating = createFieldRegistry([plainRating])
    const result = checkVersionHistory(
      [v(1, [field(A, "rating", RATING_5)], withPlainRating)],
      schema([field(A, "rating", RATING_10)], withPlainRating),
      withPlainRating,
    )
    expectOk(result)
  })
})
