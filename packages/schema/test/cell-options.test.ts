import { describe, expect, it } from "vitest"
import { type CellOptions, type Issue, parseCellOptions } from "../src/api"
import { hostileJson, isJsonObject } from "./fixtures/hostile-json"
import { expectIssues } from "./helpers/issues"

// T022 — export options for `toCell` (spec R1, R4, R16, Edge cases "Failure", Limits; plan "Dates and
// UTC" → "`CellOptions` and `parseCellOptions`", Zod mapping in the `schema` context). Written
// before T025 adds the time-zone refinement and `parseCellOptions`. Proves:
//   AC23 — `Mars/Base`, `+07:00` and `""` give `invalid_time_zone {timeZone}` when the options are
//          validated (cell part; the cells themselves are in `test/fields/date.test.ts`);
//   AC8  — every failure goes through `expectIssues` (strict `issueSchema`).
//
// Contract assumed: `parseCellOptions(input)` is a runtime export of `src/api.ts` returning
// `{ ok: true, options }` (options = the input, no other keys) or `{ ok: false, issues }`. The
// schema is strict and parsed in the `schema` context: a zone that `Intl.DateTimeFormat` refuses
// (`RangeError`), the empty string or an offset-style zone (`+07:00`, `+0700`, `+07`, `-05:00`;
// both engines accept these, they are not IANA names) gives `invalid_time_zone { timeZone }` at
// `["timeZone"]`; a non-string zone `invalid` at `["timeZone"]`; an unknown key
// `unknown_property { key }` at `[key]`; a non-object input `invalid` at `[]`.
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment.

/** Calls `parseCellOptions` with input that is not typed as `{ timeZone?: string }`. */
function parseUntyped(input: unknown): ReturnType<typeof parseCellOptions> {
  // Hostile input on purpose: the runtime must not trust the static type.
  return parseCellOptions(input as Parameters<typeof parseCellOptions>[0])
}

function expectAccepted(input: unknown): CellOptions {
  const result = parseUntyped(input)
  if (!result.ok) return expect.fail(`expected ok, got ${JSON.stringify(result.issues)}`)
  expect(result).toStrictEqual({ ok: true, options: input })
  return result.options
}

function expectRefused(input: unknown, issues: readonly Issue[]): void {
  const result = parseUntyped(input)
  if (result.ok) return expect.fail(`expected issues, got ${JSON.stringify(result.options)}`)
  expect(Object.keys(result).sort()).toEqual(["issues", "ok"])
  expectIssues(result.issues, issues)
}

const invalidTimeZone = (timeZone: string): Issue => ({
  code: "invalid_time_zone",
  params: { timeZone },
  path: ["timeZone"],
})

describe("parseCellOptions: valid export options", () => {
  it("no options at all is valid (cells in UTC)", () => {
    expectAccepted({})
  })

  it.each([
    "Asia/Bangkok",
    "UTC",
    "America/New_York",
    "Pacific/Kiritimati",
    "Pacific/Pago_Pago",
    "Asia/Kathmandu",
    "Etc/GMT-7",
  ])("the IANA time zone %s is valid and kept as given", (timeZone) => {
    expect(expectAccepted({ timeZone }).timeZone).toBe(timeZone)
  })
})

describe("AC23 parseCellOptions: invalid_time_zone", () => {
  it.each([
    { name: "Mars/Base (not a zone)", timeZone: "Mars/Base" },
    { name: "+07:00 (an offset, not an IANA zone)", timeZone: "+07:00" },
    { name: '"" (empty)', timeZone: "" },
  ])("AC23 $name gives invalid_time_zone {timeZone} at timeZone", ({ timeZone }) => {
    expectRefused({ timeZone }, [invalidTimeZone(timeZone)])
  })

  it.each(["-05:00", "+14:00", "+0700", "+07"])(
    "the offset-style zone %s is refused although engines accept it",
    (timeZone) => {
      expectRefused({ timeZone }, [invalidTimeZone(timeZone)])
    },
  )

  it.each(["Asia/Atlantis", "Bangkok", "UTC+7", "GMT+7", "Z", " Asia/Bangkok"])(
    "%j (not an IANA name) gives invalid_time_zone",
    (timeZone) => {
      expectRefused({ timeZone }, [invalidTimeZone(timeZone)])
    },
  )
})

describe("parseCellOptions: wrong shapes", () => {
  // Rows are wrapped in objects: `it.each` would spread a bare array row into arguments.
  it.each([
    { timeZone: 7 },
    { timeZone: null },
    { timeZone: true },
    { timeZone: ["Asia/Bangkok"] },
    { timeZone: { name: "Asia/Bangkok" } },
  ])("a time zone that is not a string ($timeZone) is invalid at timeZone", ({ timeZone }) => {
    expectRefused({ timeZone }, [{ code: "invalid", params: {}, path: ["timeZone"] }])
  })

  it("an unknown option gives unknown_property {key} (strict, like the configs)", () => {
    expectRefused({ timeZone: "Asia/Bangkok", locale: "th-TH" }, [
      { code: "unknown_property", params: { key: "locale" }, path: ["locale"] },
    ])
  })

  it.each([{ input: null }, { input: "Asia/Bangkok" }, { input: [] }, { input: 0 }])(
    "a non-object input ($input) is invalid at the root",
    ({ input }) => {
      expectRefused(input, [{ code: "invalid", params: {}, path: [] }])
    },
  )

  it("every hostile-JSON value as the options or as the zone gives catalogue issues only", () => {
    for (const { name, value } of hostileJson) {
      const asOptions = parseUntyped(value)
      if (!isJsonObject(value)) {
        expect(asOptions.ok, name).toBe(false)
        if (!asOptions.ok)
          expectIssues(asOptions.issues, [{ code: "invalid", params: {}, path: [] }])
      } else if (Object.keys(value).length === 0) {
        expect(asOptions, name).toStrictEqual({ ok: true, options: {} })
      } else {
        // No corpus key is `timeZone`, so each key is an unknown option.
        if (asOptions.ok) return expect.fail(`${name}: unknown keys must be refused`)
        expectIssues(
          asOptions.issues,
          Object.keys(value).map((key): Issue => ({
            code: "unknown_property",
            params: { key },
            path: [key],
          })),
        )
      }

      const asZone = parseUntyped({ timeZone: value })
      // No corpus value is an IANA zone name.
      if (asZone.ok) return expect.fail(`${name}: not a time zone`)
      expectIssues(asZone.issues, [
        typeof value === "string"
          ? invalidTimeZone(value)
          : { code: "invalid", params: {}, path: ["timeZone"] },
      ])
    }
  })
})
