import { describe, expect, it } from "vitest"
import {
  type CellOptions,
  createFieldRegistry,
  type FormSchema,
  type Issue,
  parseCellOptions,
  parseFormSchema,
  storeAsOf,
  validateResponse,
} from "../../src/api"
import { dateField } from "../../src/fields/date"
import {
  dateAnswerCases,
  dateCellCases,
  type DateAnswerCase,
  secondsOffsetCases,
} from "../fixtures/date-cases"
import { HOSTILE_TIMEOUT_MS, hostileJson, isJsonObject } from "../fixtures/hostile-json"
import { expectIssues, parseIssues } from "../helpers/issues"

// T022 — the built-in `date` field (spec US6, R15, R16; Edge cases "Empty", "Failure", i18n,
// "Limits"; plan "Built-in fields", "Dates and UTC"). Written before T025 (`parseCellOptions`) and
// T026 (`fields/shared/calendar.ts`, `fields/date.ts`). Proves:
//   AC21 — date-only answers (real calendar dates, years 0001–9999, never shifted, `""` is
//          `invalid_date` also when optional, a date-time while `includeTime` is false is
//          `invalid_date`) and date-only cells unchanged with no zone, `Pacific/Kiritimati` and
//          `Pacific/Pago_Pago` (and others);
//   AC22 — date-time answers normalised to UTC `…sssZ`, `offset_required`, `T24:00` / `:60`,
//          fractions of 1–9 digits truncated (never rounded), the UTC year range 0001–9999,
//          `storeAs` `datetime` vs `date`;
//   AC23 — date-time cells: `…Z` with no zone, `Asia/Bangkok` `+07:00`, `America/New_York`
//          `-05:00` January / `-04:00` July, and local-mean-time instants whose offset has seconds
//          (whole-minute offset, the raw offset rounded to the nearest minute, same instant) —
//          the `invalid_time_zone` rows are in `test/cell-options.test.ts`;
//   AC9  — `includeTime` false written in, re-parsing to an equal value;
//   AC6  — `date` / `datetime` by `includeTime`, `timeline`, not groupable;
//   AC7  — one `date` value, or one `datetime` value;
//   AC10 — an unknown config key gives `unknown_property` at its path;
//   AC12 — the hostile-JSON corpus as answers (with `includeTime` both ways) and as `config`;
//   AC8  — every failure goes through `expectIssues` / `parseIssues` (strict `issueSchema`).
//
// Contract assumed: `src/fields/date.ts` exports `dateField` (type `date`), made with the public
// `defineField`. Config is the strict object `{ includeTime: boolean = false }`; `storeAs` is
// `{ kinds: ["date", "datetime"], pick }`. The answer is a string; every refused string gives one
// issue at `[]`: `offset_required` for a date-time without offset while `includeTime` is true,
// otherwise `invalid_date`; a non-string answer gives `invalid` at `[]`. The normalised answer is
// the date unchanged, or the UTC instant `YYYY-MM-DDTHH:mm:ss.sssZ`. `toCell(answer, config,
// options?)` takes options only from `parseCellOptions`.
//
// Shared test: runs in Node (process zone UTC−11) and in Chromium (UTC+14, locale `th-TH`), so a
// leak of the host zone or locale breaks the expected values. Expected values never depend on the
// host: they are written out, or (local-mean-time rows) derived from `Intl` with an explicit zone.

const registry = createFieldRegistry([dateField])

type Json = Record<string, unknown>
type Result = ReturnType<typeof validateResponse>

const FIELD_ID = "d4Te_9xQ2mTz"
const CONFIG_PATH = ["fields", 0, "config"] as const

function formOf(fields: readonly Json[]): Json {
  return { schemaVersion: 1, meta: { title: "แบบฟอร์มนัดหมาย", language: "th" }, fields }
}

function entry(extra: Json = {}): Json {
  return { fieldId: FIELD_ID, type: "date", label: "วันที่สะดวก", ...extra }
}

function parsed(fields: readonly Json[]): FormSchema {
  const result = parseFormSchema(formOf(fields), registry)
  if (!result.ok) return expect.fail(`expected a valid schema, got ${show(result.issues)}`)
  return result.schema
}

function expectConfigRejected(field: Json, expected: readonly Issue[]): void {
  const result = parseFormSchema(formOf([field]), registry)
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

function answer(value: unknown, includeTime: boolean, isRequired = true): Result {
  const schema = parsed([entry({ required: isRequired, config: { includeTime } })])
  return validateResponse(schema, { [FIELD_ID]: value }, registry)
}

function expectAccepted(result: Result, normalised: string): void {
  if (!result.ok) return expect.fail(`expected ok, got ${show(result)}`)
  expect(result.answers).toStrictEqual({ [FIELD_ID]: normalised })
}

function expectRefused(result: Result, issues: readonly Issue[]): void {
  if (result.ok) return expect.fail(`expected a failure, got ${show(result)}`)
  expectIssues(result.answerSet, [])
  expect(Object.keys(result.fields)).toEqual([FIELD_ID])
  expectIssues(result.fields[FIELD_ID], issues)
}

function runAnswerCase({ input, includeTime, expected }: DateAnswerCase): void {
  const result = answer(input, includeTime)
  if (expected.ok) expectAccepted(result, expected.value)
  else expectRefused(result, [{ code: expected.code, params: {}, path: [] }])
}

/** Validated export options, the only way to get a `CellOptions` (no zone: `{}`). */
function cellOptions(timeZone?: string): CellOptions {
  const result = parseCellOptions(timeZone === undefined ? {} : { timeZone })
  if (!result.ok) return expect.fail(`${String(timeZone)} must be valid: ${show(result.issues)}`)
  return result.options
}

const dateOnlyConfig = dateField.config.parse({ includeTime: false })
const dateTimeConfig = dateField.config.parse({ includeTime: true })
const configOf = (includeTime: boolean) => (includeTime ? dateTimeConfig : dateOnlyConfig)

const invalid: Issue = { code: "invalid", params: {}, path: [] }
const invalidDate: Issue = { code: "invalid_date", params: {}, path: [] }
const offsetRequired: Issue = { code: "offset_required", params: {}, path: [] }
const required: Issue = { code: "required", params: {}, path: [] }

// --- UTC-only helpers for the oracle (never local time) ----------------------------------------------

/** Epoch milliseconds of UTC calendar fields; years 0–99 stay years 0–99 (unlike `Date.UTC`). */
function utcMs(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number) {
  const date = new Date(0)
  date.setUTCFullYear(y, mo - 1, d)
  date.setUTCHours(h, mi, s, ms)
  return date.getTime()
}

// The year is four digits, or the ISO expanded form `±YYYYYY` a cell uses past year 9999 (R16).
const CELL =
  /^(\d{4}|[+-]\d{6})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})(?:Z|([+-])(\d{2}):(\d{2}))$/

/** The instant a `…sssZ` or `…sss±HH:MM` string names, or `undefined` when malformed. */
function instantOf(text: string): number | undefined {
  const m = CELL.exec(text)
  if (m === null) return undefined
  const n = (i: number): number => Number(m[i])
  const wall = utcMs(n(1), n(2), n(3), n(4), n(5), n(6), n(7))
  const sign = m[8]
  if (sign === undefined) return wall
  const offsetMinutes = (sign === "-" ? -1 : 1) * (n(9) * 60 + n(10))
  return wall - offsetMinutes * 60_000
}

/** The engine's own offset of `timeZone` at `epochMs` in seconds, from `longOffset` (`GMT+06:42:04`). */
function rawOffsetSeconds(timeZone: string, epochMs: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(epochMs))
    .find((part) => part.type === "timeZoneName")?.value
  const m = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(name ?? "")
  if (m === null) return expect.fail(`unexpected longOffset ${String(name)}`)
  if (m[1] === undefined) return 0
  const seconds = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0)
  return m[1] === "-" ? -seconds : seconds
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+"
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, "0")
  const mm = String(abs % 60).padStart(2, "0")
  return `${sign}${hh}:${mm}`
}

// --- AC21 / AC22: answers ----------------------------------------------------------------------------

describe("AC21 / AC22 date: the shared answer table", () => {
  it.each(dateAnswerCases)("$criterion includeTime $includeTime: $name ($input)", (row) => {
    runAnswerCase(row)
  })
})

describe("AC21 / AC22 date: unanswered and wrong types", () => {
  it.each([false, true])(
    'includeTime %s: "" is invalid_date on an optional field too',
    (includeTime) => {
      expectRefused(answer("", includeTime, false), [invalidDate])
    },
  )

  it.each([false, true])('includeTime %s: "  " is invalid_date, not unanswered', (includeTime) => {
    expectRefused(answer("  ", includeTime, false), [invalidDate])
  })

  it.each([false, true])("includeTime %s: null is unanswered", (includeTime) => {
    expectRefused(answer(null, includeTime), [required])
    const optional = answer(null, includeTime, false)
    if (!optional.ok) return expect.fail(`expected ok, got ${show(optional)}`)
    expect(optional.answers).toStrictEqual({})
  })

  it.each([
    { name: "the number 20261104", value: 20261104 },
    { name: "an epoch number", value: 1_793_783_400_000 },
    { name: "true", value: true },
    { name: '["2026-11-04"]', value: ["2026-11-04"] },
    { name: "an object", value: { date: "2026-11-04" } },
  ])("a non-string answer ($name) is invalid, with includeTime both ways", ({ value }) => {
    expectRefused(answer(value, false), [invalid])
    expectRefused(answer(value, true), [invalid])
  })

  it("the normalised answer set validates again to itself", () => {
    const schema = parsed([
      { fieldId: "day", type: "date", label: "วัน" },
      { fieldId: "when", type: "date", label: "เวลา", config: { includeTime: true } },
    ])
    const first = validateResponse(
      schema,
      { day: "2026-11-04", when: "2026-11-04T17:30:00.123456789+07:00" },
      registry,
    )
    if (!first.ok) return expect.fail(show(first))
    expect(first.answers).toStrictEqual({ day: "2026-11-04", when: "2026-11-04T10:30:00.123Z" })
    expect(validateResponse(schema, first.answers, registry)).toStrictEqual(first)
  })
})

// --- AC21 / AC23: cells ------------------------------------------------------------------------------

describe("AC21 / AC23 date: the shared cell table", () => {
  it.each(dateCellCases)("$criterion $name", ({ answer: value, includeTime, timeZone, cell }) => {
    expect(dateField.toCell(value, configOf(includeTime), cellOptions(timeZone))).toBe(cell)
  })

  it("no options and options without a zone give the same …Z cell", () => {
    const value = "2026-11-04T10:30:00.000Z"
    expect(dateField.toCell(value, dateTimeConfig)).toBe(value)
    expect(dateField.toCell(value, dateTimeConfig, cellOptions())).toBe(value)
  })

  it("AC21 a date-only answer is never shifted, whatever zone is passed", () => {
    for (const timeZone of [undefined, "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Bangkok"]) {
      expect(dateField.toCell("2026-11-04", dateOnlyConfig, cellOptions(timeZone)), timeZone).toBe(
        "2026-11-04",
      )
    }
    expect(dateField.toCell("2026-11-04", dateOnlyConfig)).toBe("2026-11-04")
  })

  it("AC23 every zoned date-time cell names the same instant and validates back to the answer", () => {
    const schema = parsed([entry({ config: { includeTime: true } })])
    for (const row of dateCellCases.filter((c) => c.includeTime)) {
      const cell = dateField.toCell(row.answer, dateTimeConfig, cellOptions(row.timeZone))
      expect(instantOf(cell), row.name).toBe(instantOf(row.answer))
      expect(instantOf(cell), row.name).not.toBeUndefined()
      // An expanded-year cell (R16, past year 9999) is outside the four-digit answer form (R15),
      // so only four-digit-year cells are fed back as answers.
      if (!/^\d{4}-/.test(cell)) continue
      const back = validateResponse(schema, { [FIELD_ID]: cell }, registry)
      expect(back, row.name).toStrictEqual({ ok: true, answers: { [FIELD_ID]: row.answer } })
    }
  })
})

describe("AC23 date: an offset with seconds (local mean time) is rounded to the minute", () => {
  it.each(secondsOffsetCases)("AC23 $name", ({ answer: value, timeZone }) => {
    const instant = instantOf(value)
    if (instant === undefined) return expect.fail(`bad fixture ${value}`)

    // Precondition: in this engine the zone's offset at this instant really has seconds, and is
    // not a tie, so the row exercises the rounding.
    const raw = rawOffsetSeconds(timeZone, instant)
    expect(raw % 60, "the raw offset has seconds").not.toBe(0)
    expect(Math.abs(raw % 60), "not a rounding tie").not.toBe(30)

    const cell = dateField.toCell(value, dateTimeConfig, cellOptions(timeZone))

    // A whole-minute ±HH:MM offset, never seconds.
    const shape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}([+-])(\d{2}):(\d{2})$/.exec(cell)
    if (shape === null) return expect.fail(`not a zoned ISO cell: ${cell}`)
    const cellMinutes = (shape[1] === "-" ? -1 : 1) * (Number(shape[2]) * 60 + Number(shape[3]))

    // The raw offset rounded to the nearest minute (Tokyo +09:18:59 gives +09:19, not +09:18).
    expect(Math.abs(cellMinutes * 60 - raw), `${cell} vs raw ${raw}s`).toBeLessThan(30)

    // The cell names the exact same instant (the wall time was shifted with the offset).
    expect(instantOf(cell)).toBe(instant)

    // The whole cell, derived from the engine's own offset with an explicit zone.
    const rounded = Math.round(raw / 60)
    const wall = new Date(instant + rounded * 60_000).toISOString().slice(0, 23)
    expect(cell).toBe(`${wall}${formatOffset(rounded)}`)
  })

  it("AC23 Asia/Bangkok 1900 (Bangkok Mean Time +06:42:04) gives 1900-01-01T06:42:00.000+06:42", () => {
    expect(
      dateField.toCell("1900-01-01T00:00:00.000Z", dateTimeConfig, cellOptions("Asia/Bangkok")),
    ).toBe("1900-01-01T06:42:00.000+06:42")
  })

  it("AC23 every seconds-offset cell validates back to the answer", () => {
    const schema = parsed([entry({ config: { includeTime: true } })])
    for (const { name, answer: value, timeZone } of secondsOffsetCases) {
      const cell = dateField.toCell(value, dateTimeConfig, cellOptions(timeZone))
      const back = validateResponse(schema, { [FIELD_ID]: cell }, registry)
      expect(back, name).toStrictEqual({ ok: true, answers: { [FIELD_ID]: value } })
    }
  })
})

// --- AC9: the includeTime default ----------------------------------------------------------------------

describe("AC9 date: the built-in default is written in", () => {
  it("no config gets includeTime false, and the output re-parses to an equal value", () => {
    const schema = parsed([entry()])
    expect(schema.fields[0]?.config).toStrictEqual({ includeTime: false })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })

  it("an empty config gets includeTime false", () => {
    expect(parsed([entry({ config: {} })]).fields[0]?.config).toStrictEqual({ includeTime: false })
  })

  it("an explicit includeTime true is kept and re-parses to an equal value", () => {
    const schema = parsed([entry({ config: { includeTime: true } })])
    expect(schema.fields[0]?.config).toStrictEqual({ includeTime: true })
    expect(parseFormSchema(schema, registry)).toStrictEqual({ ok: true, schema })
  })
})

// --- AC10: config rows -----------------------------------------------------------------------------

describe("AC10 date: config through parseFormSchema", () => {
  it.each(["format", "timeZone", "min"])(
    "the unknown config key %s gives unknown_property {key} at its path",
    (key) => {
      expectConfigRejected(entry({ config: { includeTime: true, [key]: "Asia/Bangkok" } }), [
        { code: "unknown_property", params: { key }, path: at(key) },
      ])
    },
  )

  it.each([
    { name: '"yes"', value: "yes" },
    { name: '"true"', value: "true" },
    { name: "1", value: 1 },
    { name: "null", value: null },
  ])("includeTime $name is invalid at its path", ({ value }) => {
    expectConfigRejected(entry({ config: { includeTime: value } }), [
      { code: "invalid", params: {}, path: at("includeTime") },
    ])
  })
})

// --- AC6, AC7: analytics and stored values -----------------------------------------------------------

describe("AC6 / AC7 date: analytics and stored values", () => {
  it("the definition has type date", () => {
    expect(dateField.type).toBe("date")
  })

  it("AC6 / AC22 storeAs is date without includeTime and datetime with it", () => {
    expect(storeAsOf(dateField, dateOnlyConfig)).toBe("date")
    expect(storeAsOf(dateField, dateTimeConfig)).toBe("datetime")
    expect(storeAsOf(dateField, dateField.config.parse({}))).toBe("date")
  })

  it("AC6 storeAs declares exactly the kinds date and datetime", () => {
    const { storeAs } = dateField.analytics
    if (typeof storeAs === "string") return expect.fail(`storeAs must depend on config: ${storeAs}`)
    expect([...storeAs.kinds].sort()).toEqual(["date", "datetime"])
  })

  it("AC6 summarize timeline, not groupable", () => {
    expect(dateField.analytics.summarize).toBe("timeline")
    expect(dateField.analytics.groupable).toBe(false)
  })

  it("AC7 a date-only answer gives one date value: the date itself", () => {
    const result = answer("2026-11-04", false)
    if (!result.ok) return expect.fail(show(result))
    const normalised = result.answers[FIELD_ID] as string
    expect(dateField.storedValues(normalised, dateOnlyConfig)).toStrictEqual(["2026-11-04"])
  })

  it("AC7 a date-time answer gives one datetime value: the UTC instant", () => {
    const result = answer("2026-11-04T17:30+07:00", true)
    if (!result.ok) return expect.fail(show(result))
    const normalised = result.answers[FIELD_ID] as string
    expect(dateField.storedValues(normalised, dateTimeConfig)).toStrictEqual([
      "2026-11-04T10:30:00.000Z",
    ])
  })
})

// --- AC12: the hostile-JSON corpus -------------------------------------------------------------------

describe("AC12 date: the hostile-JSON corpus never throws", () => {
  const hostileForm = parsed([
    { fieldId: "dateOnly", type: "date", label: "วันที่", required: true },
    {
      fieldId: "dateTime",
      type: "date",
      label: "วันและเวลา",
      required: false,
      config: { includeTime: true },
    },
  ])

  it.each(hostileJson)(
    "AC12 as every date answer: $name",
    { timeout: HOSTILE_TIMEOUT_MS },
    ({ value }) => {
      const result = validateResponse(hostileForm, { dateOnly: value, dateTime: value }, registry)
      if (!result.ok) {
        expectIssues(result.answerSet, [])
        for (const issues of Object.values(result.fields)) parseIssues(issues)
      }
      const fields = result.ok ? {} : result.fields

      if (value === null) {
        expectIssues(fields.dateOnly, [required])
        expect(fields.dateTime).toBeUndefined()
        return
      }
      if (typeof value !== "string") {
        expectIssues(fields.dateOnly, [invalid])
        expectIssues(fields.dateTime, [invalid])
        return
      }
      // No corpus string is a valid date; only the offset-less date-time asks for an offset.
      expectIssues(fields.dateOnly, [invalidDate])
      expectIssues(fields.dateTime, [
        value === "2026-11-04T17:30:00" ? offsetRequired : invalidDate,
      ])
    },
  )

  it("AC12 every hostile value as config gives catalogue issues only", () => {
    for (const { name, value } of hostileJson) {
      const result = parseFormSchema(formOf([entry({ config: value })]), registry)
      if (!isJsonObject(value)) {
        if (result.ok) return expect.fail(`${name}: a non-object config must be refused`)
        expectIssues(result.issues, [{ code: "invalid", params: {}, path: [...CONFIG_PATH] }])
        continue
      }
      const keys = Object.keys(value)
      if (keys.length === 0) {
        if (!result.ok)
          return expect.fail(`${name}: {} is a valid config, got ${show(result.issues)}`)
        expect(result.schema.fields[0]?.config, name).toStrictEqual({ includeTime: false })
        continue
      }
      // No corpus key is `includeTime`, so each one is an unknown property (strict config).
      if (result.ok) return expect.fail(`${name}: unknown config keys must be refused`)
      expectIssues(
        result.issues,
        keys.map((key): Issue => ({ code: "unknown_property", params: { key }, path: at(key) })),
      )
    }
  })
})
