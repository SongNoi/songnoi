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
import { fileField } from "../../src/fields/file"
import { HOSTILE_TIMEOUT_MS, hostileJson, isJsonObject } from "../fixtures/hostile-json"
import { expectIssues, parseIssues } from "../helpers/issues"

// T024 — the built-in `file` field (spec US6, R17; Edge cases "Empty", "Permission", "Limits"; plan
// "Built-in fields"; ADR 0011 as amended). Written before T027 implements it. Proves:
//   AC24 — config: `maxFiles` default 1, `maxFiles: 0` and `maxSize: 0` give `too_small {min: 1}`,
//          `allowedTypes: []` gives `too_few {min: 1}`, malformed MIME entries and `*/*` are
//          `invalid`, `image/*` is valid; answers: too many IDs `too_many`, a repeated ID
//          `duplicate`, an empty ID `invalid`; `toCell` joins the IDs with `; `;
//   AC9  — `maxFiles` 1 written in, re-parsing to an equal value;
//   AC13 — the empty file list is unanswered (required gives `required`, optional is omitted);
//   AC6  — `text` / `count` / not groupable;
//   AC7  — one `text` value per file ID, in answer order;
//   AC10 — an unknown config key gives `unknown_property` at its path;
//   AC12 — the hostile-JSON corpus as answers and as `config`, never throwing;
//   AC8  — every failure goes through `expectIssues` / `parseIssues` (strict `issueSchema`).
//
// Contract assumed: `src/fields/file.ts` exports `fileField` (type `file`), made with the public
// `defineField`. Config is the strict object `{ maxFiles: int ≥ 1 = 1, maxSize?: int ≥ 1,
// allowedTypes?: string[] (≥ 1 entry) }`; a MIME entry is `type/subtype` of RFC 6838 restricted
// names, the subtype may be `*`, `*/*` is refused; an entry's issue sits at
// `["allowedTypes", j]`. The answer is an array of non-empty strings (opaque file IDs, kept as
// given, in answer order): a non-array `invalid` at `[]`, a non-string or empty entry `invalid`
// at `[i]`, a repeat `duplicate { value }` at the repeat's index `[i]`, more than `maxFiles`
// `too_many { max }` at `[]`. `isUnanswered` is true for `[]`. `maxSize` and `allowedTypes` do not
// change which answers are valid (the package cannot see files; 006 enforces them).
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment.

const registry = createFieldRegistry([fileField])

type Json = Record<string, unknown>
type Result = ReturnType<typeof validateResponse>

const FIELD_ID = "F1le_up-0aD1"
const CONFIG_PATH = ["fields", 0, "config"] as const

function formOf(fields: readonly Json[]): Json {
  return { schemaVersion: 1, meta: { title: "แบบฟอร์มสมัครงาน", language: "th" }, fields }
}

function entry(extra: Json = {}): Json {
  return { fieldId: FIELD_ID, type: "file", label: "แนบเรซูเม่", ...extra }
}

function parsed(fields: readonly Json[]): FormSchema {
  const result = parseFormSchema(formOf(fields), registry)
  if (!result.ok) return expect.fail(`expected a valid schema, got ${show(result.issues)}`)
  return result.schema
}

function parsedConfig(config: unknown): unknown {
  return parsed([entry({ config })]).fields[0]?.config
}

function expectConfigRejected(config: unknown, expected: readonly Issue[]): void {
  const result = parseFormSchema(formOf([entry({ config })]), registry)
  if (result.ok) return expect.fail(`expected issues, got the schema ${show(result.schema)}`)
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

function expectAccepted(result: Result, normalised: readonly string[]): void {
  if (!result.ok) return expect.fail(`expected ok, got ${show(result)}`)
  expect(result.answers).toStrictEqual({ [FIELD_ID]: normalised })
}

function expectRefused(result: Result, issues: readonly Issue[]): void {
  if (result.ok) return expect.fail(`expected a failure, got ${show(result)}`)
  expectIssues(result.answerSet, [])
  expect(Object.keys(result.fields)).toEqual([FIELD_ID])
  expectIssues(result.fields[FIELD_ID], issues)
}

const invalidAt = (...path: (string | number)[]): Issue => ({ code: "invalid", params: {}, path })
const required: Issue = { code: "required", params: {}, path: [] }
const tooMany = (max: number): Issue => ({ code: "too_many", params: { max }, path: [] })
const duplicateAt = (value: string, index: number): Issue => ({
  code: "duplicate",
  params: { value },
  path: [index],
})

const defaultConfig = fileField.config.parse({})

// --- AC24 / AC9: config ------------------------------------------------------------------------------

describe("AC9 / AC24 file: the maxFiles default is written in", () => {
  it("no config gets maxFiles 1, and the output re-parses to an equal value", () => {
    const schema = parsed([entry()])
    expect(schema.fields[0]?.config).toStrictEqual({ maxFiles: 1 })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("maxSize and allowedTypes alone get maxFiles 1 next to them, re-parsing equal", () => {
    const schema = parsed([entry({ config: { maxSize: 5_242_880, allowedTypes: ["image/*"] } })])
    expect(schema.fields[0]?.config).toStrictEqual({
      maxFiles: 1,
      maxSize: 5_242_880,
      allowedTypes: ["image/*"],
    })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("an explicit maxFiles is kept", () => {
    expect(parsedConfig({ maxFiles: 5 })).toStrictEqual({ maxFiles: 5 })
  })
})

describe("AC24 file: config numbers", () => {
  it("maxFiles 0 gives too_small {min: 1} at maxFiles", () => {
    expectConfigRejected({ maxFiles: 0 }, [
      { code: "too_small", params: { min: 1 }, path: at("maxFiles") },
    ])
  })

  it("maxFiles -1 gives too_small {min: 1} at maxFiles", () => {
    expectConfigRejected({ maxFiles: -1 }, [
      { code: "too_small", params: { min: 1 }, path: at("maxFiles") },
    ])
  })

  it("maxFiles 1.5 gives not_integer at maxFiles", () => {
    expectConfigRejected({ maxFiles: 1.5 }, [
      { code: "not_integer", params: {}, path: at("maxFiles") },
    ])
  })

  it.each([{ value: "2" }, { value: null }, { value: true }])(
    "maxFiles $value is invalid at maxFiles",
    ({ value }) => {
      expectConfigRejected({ maxFiles: value }, [invalidAt(...at("maxFiles"))])
    },
  )

  it("maxSize 0 gives too_small {min: 1} at maxSize", () => {
    expectConfigRejected({ maxSize: 0 }, [
      { code: "too_small", params: { min: 1 }, path: at("maxSize") },
    ])
  })

  it('maxSize 1.5 gives not_integer, maxSize "10MB" is invalid', () => {
    expectConfigRejected({ maxSize: 1.5 }, [
      { code: "not_integer", params: {}, path: at("maxSize") },
    ])
    expectConfigRejected({ maxSize: "10MB" }, [invalidAt(...at("maxSize"))])
  })

  it("maxSize 1 byte is the smallest valid size", () => {
    expect(parsedConfig({ maxSize: 1 })).toStrictEqual({ maxFiles: 1, maxSize: 1 })
  })

  it("maxFiles 0 and maxSize 0 together give both issues", () => {
    expectConfigRejected({ maxFiles: 0, maxSize: 0 }, [
      { code: "too_small", params: { min: 1 }, path: at("maxFiles") },
      { code: "too_small", params: { min: 1 }, path: at("maxSize") },
    ])
  })
})

describe("AC24 file: allowedTypes", () => {
  it("allowedTypes [] gives too_few {min: 1} at allowedTypes", () => {
    expectConfigRejected({ allowedTypes: [] }, [
      { code: "too_few", params: { min: 1 }, path: at("allowedTypes") },
    ])
  })

  it.each([
    "image/*",
    "application/pdf",
    "image/png",
    "image/svg+xml",
    "text/plain",
    "audio/*",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/x-7z-compressed",
  ])("the MIME type %s is valid and kept", (mime) => {
    expect(parsedConfig({ allowedTypes: [mime] })).toStrictEqual({
      maxFiles: 1,
      allowedTypes: [mime],
    })
  })

  it("several types are kept in order", () => {
    const allowedTypes = ["application/pdf", "image/*", "text/csv"]
    expect(parsedConfig({ allowedTypes })).toStrictEqual({ maxFiles: 1, allowedTypes })
  })

  it.each([
    { name: "*/* (everything)", mime: "*/*" },
    { name: "*/png (wildcard type)", mime: "*/png" },
    { name: "a type without subtype", mime: "image" },
    { name: "an empty subtype", mime: "image/" },
    { name: "an empty type", mime: "/png" },
    { name: "two slashes", mime: "image/png/x" },
    { name: "a parameter", mime: "text/plain; charset=utf-8" },
    { name: "a leading space", mime: " image/png" },
    { name: "a space inside", mime: "image /png" },
    { name: "a partial wildcard", mime: "image/*png" },
    { name: "a file extension", mime: ".pdf" },
    { name: "Thai text", mime: "รูปภาพ/ทั้งหมด" },
    { name: "the empty string", mime: "" },
  ])("$name ($mime) is invalid at its index", ({ mime }) => {
    expectConfigRejected({ allowedTypes: ["application/pdf", mime] }, [
      invalidAt(...at("allowedTypes", 1)),
    ])
  })

  it("each malformed entry is reported at its own index", () => {
    expectConfigRejected({ allowedTypes: ["*/*", "image/png", "image", 5] }, [
      invalidAt(...at("allowedTypes", 0)),
      invalidAt(...at("allowedTypes", 2)),
      invalidAt(...at("allowedTypes", 3)),
    ])
  })

  it("allowedTypes that is a string, not a list, is invalid at allowedTypes", () => {
    expectConfigRejected({ allowedTypes: "image/*" }, [invalidAt(...at("allowedTypes"))])
  })
})

describe("AC10 file: unknown config keys", () => {
  it.each(["maxTotalSize", "accept", "storage"])(
    "the unknown config key %s gives unknown_property {key} at its path",
    (key) => {
      expectConfigRejected({ maxFiles: 2, [key]: 1 }, [
        { code: "unknown_property", params: { key }, path: at(key) },
      ])
    },
  )
})

// --- AC24: answers -------------------------------------------------------------------------------------

describe("AC24 file: answers", () => {
  it("one file ID with the default config is accepted", () => {
    expectAccepted(answer(["upl_7Hq2xL9vR0aB"]), ["upl_7Hq2xL9vR0aB"])
  })

  it("two IDs with maxFiles 1 give too_many {max: 1}", () => {
    expectRefused(answer(["fileA", "fileB"]), [tooMany(1)])
  })

  it("up to maxFiles IDs are accepted, kept in answer order", () => {
    expectAccepted(answer(["c", "a", "b"], { maxFiles: 3 }), ["c", "a", "b"])
  })

  it("maxFiles + 1 IDs give too_many {max}", () => {
    expectRefused(answer(["a", "b", "c", "d"], { maxFiles: 3 }), [tooMany(3)])
  })

  it("a repeated ID gives duplicate {value} at the repeat", () => {
    expectRefused(answer(["fileA", "fileB", "fileA"], { maxFiles: 5 }), [duplicateAt("fileA", 2)])
  })

  it("an empty ID is invalid at its index", () => {
    expectRefused(answer(["fileA", ""], { maxFiles: 2 }), [invalidAt(1)])
    expectRefused(answer([""]), [invalidAt(0)])
  })

  it.each([
    { name: "a number", value: [7] },
    { name: "null", value: [null] },
    { name: "an object", value: [{ id: "fileA" }] },
    { name: "a nested list", value: [["fileA"]] },
  ])("an ID that is $name is invalid at its index", ({ value }) => {
    expectRefused(answer(value, { maxFiles: 2 }), [invalidAt(0)])
  })

  it.each([
    { name: "a bare ID string", value: "fileA" },
    { name: "an object", value: { files: ["fileA"] } },
    { name: "a number", value: 1 },
    { name: '""', value: "" },
    { name: "true", value: true },
  ])("an answer that is $name is invalid at the root", ({ value }) => {
    expectRefused(answer(value), [invalidAt()])
  })

  it("IDs are opaque: any non-empty string, Thai included, is kept as given", () => {
    const ids = ["ไฟล์-๑", "a/b?c=d", "x".repeat(200)]
    expectAccepted(answer(ids, { maxFiles: 3 }), ids)
  })

  it("maxSize and allowedTypes do not change which answers are valid (checked on upload)", () => {
    const config = { maxFiles: 2, maxSize: 1, allowedTypes: ["image/png"] }
    expectAccepted(answer(["resume-pdf", "photo"], config), ["resume-pdf", "photo"])
  })
})

// --- AC13: the empty file list ---------------------------------------------------------------------

describe("AC13 file: the empty file list is unanswered", () => {
  it("[] on a required field gives required", () => {
    expectRefused(answer([]), [required])
    expectRefused(answer([], { maxFiles: 3 }), [required])
  })

  it("[] on an optional field is omitted from the normalised set", () => {
    const result = answer([], undefined, false)
    if (!result.ok) return expect.fail(`expected ok, got ${show(result)}`)
    expect(result.answers).toStrictEqual({})
  })

  it("null and an absent key are unanswered too", () => {
    expectRefused(answer(null), [required])
    const schema = parsed([entry({ required: true })])
    expectRefused(validateResponse(schema, {}, registry), [required])
  })

  it("the empty file list is unanswered according to the definition itself", () => {
    expect(fileField.isUnanswered([], defaultConfig)).toBe(true)
    expect(fileField.isUnanswered(["fileA"], defaultConfig)).toBe(false)
  })
})

// --- AC24, AC6, AC7: cells, analytics and stored values ------------------------------------------------

describe("AC24 / AC6 / AC7 file: cells, analytics and stored values", () => {
  it("the definition has type file", () => {
    expect(fileField.type).toBe("file")
  })

  it("AC24 toCell writes one ID as itself", () => {
    expect(fileField.toCell(["upl_7Hq2xL9vR0aB"], defaultConfig)).toBe("upl_7Hq2xL9vR0aB")
  })

  it("AC24 toCell joins the IDs in answer order with '; '", () => {
    const config = fileField.config.parse({ maxFiles: 3 })
    expect(fileField.toCell(["fileB", "fileA", "fileC"], config)).toBe("fileB; fileA; fileC")
  })

  it("AC6 storeAs text, summarize count, not groupable", () => {
    expect(storeAsOf(fileField, defaultConfig)).toBe("text")
    expect(storeAsOf(fileField, fileField.config.parse({ maxFiles: 9 }))).toBe("text")
    expect(fileField.analytics.summarize).toBe("count")
    expect(fileField.analytics.groupable).toBe(false)
  })

  it("AC7 two IDs give two text values, in answer order", () => {
    const result = answer(["fileB", "fileA"], { maxFiles: 2 })
    if (!result.ok) return expect.fail(show(result))
    const normalised = result.answers[FIELD_ID] as string[]
    const config = fileField.config.parse({ maxFiles: 2 })
    expect(fileField.storedValues(normalised, config)).toStrictEqual(["fileB", "fileA"])
  })

  it("AC7 one ID gives one text value", () => {
    expect(fileField.storedValues(["fileA"], defaultConfig)).toStrictEqual(["fileA"])
  })
})

// --- AC12: the hostile-JSON corpus -------------------------------------------------------------------

describe("AC12 file: the hostile-JSON corpus never throws", () => {
  const hostileForm = parsed([
    { fieldId: "single", type: "file", label: "รูปถ่าย", required: true },
    {
      fieldId: "many",
      type: "file",
      label: "เอกสารแนบ",
      required: false,
      config: { maxFiles: 1_000_000, maxSize: 1_048_576, allowedTypes: ["application/pdf"] },
    },
  ])
  const answerCodes = new Set(["invalid", "duplicate", "too_many"])

  it.each(hostileJson)(
    "AC12 as every file answer: $name",
    { timeout: HOSTILE_TIMEOUT_MS },
    ({ value }) => {
      const result = validateResponse(hostileForm, { single: value, many: value }, registry)
      const fields = result.ok ? {} : result.fields
      const normalised: AnswerSet = result.ok ? result.answers : {}
      if (!result.ok) {
        expectIssues(result.answerSet, [])
        for (const issues of Object.values(result.fields)) parseIssues(issues)
      }

      if (value === null || (Array.isArray(value) && value.length === 0)) {
        expectIssues(fields.single, [required])
        expect(fields.many).toBeUndefined()
        expect(Object.hasOwn(normalised, "many")).toBe(false)
        return
      }
      if (!Array.isArray(value)) {
        expectIssues(fields.single, [invalidAt()])
        expectIssues(fields.many, [invalidAt()])
        return
      }

      const items: readonly unknown[] = value
      const badIndexes = items.flatMap((item, i) =>
        typeof item === "string" && item !== "" ? [] : [i],
      )
      const strings = items.filter((item): item is string => typeof item === "string")
      const unique = new Set(strings).size === strings.length

      for (const fieldId of ["single", "many"] as const) {
        const issues = fields[fieldId]
        if (issues === undefined) {
          // Accepted only when every entry is a non-empty, unique string within the limit.
          expect(badIndexes, fieldId).toEqual([])
          expect(unique, fieldId).toBe(true)
          expect(normalised[fieldId], fieldId).toStrictEqual(items)
          if (fieldId === "single") expect(items.length).toBe(1)
          continue
        }
        const parsedIssues = parseIssues(issues)
        for (const issue of parsedIssues) {
          expect(answerCodes.has(issue.code), `${fieldId}: ${issue.code}`).toBe(true)
        }
        for (const index of badIndexes.slice(0, 50)) {
          expect(parsedIssues, `${fieldId}: entry ${index}`).toContainEqual(invalidAt(index))
        }
        if (badIndexes.length === 0) {
          if (!unique) {
            expect(
              parsedIssues.some((issue) => issue.code === "duplicate"),
              fieldId,
            ).toBe(true)
          }
          if (fieldId === "single" && items.length > 1) {
            expect(parsedIssues, fieldId).toContainEqual(tooMany(1))
          }
        }
      }
    },
  )

  it("AC12 every hostile value as config gives catalogue issues only", () => {
    for (const { name, value } of hostileJson) {
      const result = parseFormSchema(formOf([entry({ config: value })]), registry)
      if (!isJsonObject(value)) {
        if (result.ok) return expect.fail(`${name}: a non-object config must be refused`)
        expectIssues(result.issues, [invalidAt(...CONFIG_PATH)])
        continue
      }
      const keys = Object.keys(value)
      if (keys.length === 0) {
        if (!result.ok)
          return expect.fail(`${name}: {} is a valid config, got ${show(result.issues)}`)
        expect(result.schema.fields[0]?.config, name).toStrictEqual({ maxFiles: 1 })
        continue
      }
      // No corpus key is a file config key, so each one is an unknown property (strict config).
      if (result.ok) return expect.fail(`${name}: unknown config keys must be refused`)
      expectIssues(
        result.issues,
        keys.map((key): Issue => ({ code: "unknown_property", params: { key }, path: at(key) })),
      )
    }
  })

  it.each(hostileJson)(
    "AC12 as maxFiles, maxSize and allowedTypes: $name",
    { timeout: HOSTILE_TIMEOUT_MS },
    ({ value }) => {
      for (const key of ["maxFiles", "maxSize", "allowedTypes"]) {
        const result = parseFormSchema(formOf([entry({ config: { [key]: value } })]), registry)
        if (!result.ok) parseIssues(result.issues)
      }
    },
  )
})
