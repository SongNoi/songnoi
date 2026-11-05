// T022 — the shared date case table (spec R15, R16, Limits, AC21–AC23; plan "Dates and UTC").
// Data only, no imports from `src/`: `test/fields/date.test.ts` runs it in Node (process zone
// `Pacific/Pago_Pago`, UTC−11) and in Chromium (`Pacific/Kiritimati`, UTC+14, locale `th-TH`), and
// `test/node/time-zone-independence.test.ts` (T023) re-runs it with the process time zone flipped.
// Every expected value is written out here, so no row depends on the host time zone or locale.
//
// Answer rows go through `validateResponse` with a `date` field whose config is
// `{ includeTime }`; an accepted row gives the normalised answer `value`, a refused row exactly one
// issue `{ code, params: {}, path: [] }`. Cell rows call `dateField.toCell(answer, config, options)`
// with `options` from `parseCellOptions({ timeZone })` (or no options when `timeZone` is absent).

/** What one answer row must give. */
export type DateAnswerExpected =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly code: "invalid_date" | "offset_required" }

/** One answer row: a raw answer and what the `date` field normalises it to (or refuses with). */
export interface DateAnswerCase {
  readonly name: string
  readonly criterion: "AC21" | "AC22"
  readonly includeTime: boolean
  readonly input: string
  readonly expected: DateAnswerExpected
}

/** One cell row: a valid (normalised) answer, an optional IANA zone and the exact cell. */
export interface DateCellCase {
  readonly name: string
  readonly criterion: "AC21" | "AC23"
  readonly includeTime: boolean
  readonly answer: string
  readonly timeZone?: string
  readonly cell: string
}

/**
 * One local-mean-time row (AC23): an instant at which the zone's offset has seconds. The exact
 * cell is not written here (it follows the engine's time-zone data); the test checks the
 * properties instead — whole-minute `±HH:MM` offset, the raw offset rounded to the nearest minute,
 * and a cell that names the same instant. Each row was checked to give the same raw offset in
 * Node 24 (ICU 78) and Chromium 153 (`GMT+06:42:04`, `GMT+09:18:59`, …), and none has exactly
 * 30 seconds, so rounding is never a tie.
 */
export interface SecondsOffsetCase {
  readonly name: string
  readonly answer: string
  readonly timeZone: string
}

const ok = (value: string): DateAnswerExpected => ({ ok: true, value })
const invalidDate: DateAnswerExpected = { ok: false, code: "invalid_date" }
const offsetRequired: DateAnswerExpected = { ok: false, code: "offset_required" }

const dateOnly = (name: string, input: string, expected: DateAnswerExpected): DateAnswerCase => ({
  name,
  criterion: "AC21",
  includeTime: false,
  input,
  expected,
})

const dateTime = (name: string, input: string, expected: DateAnswerExpected): DateAnswerCase => ({
  name,
  criterion: "AC22",
  includeTime: true,
  input,
  expected,
})

/** AC21: date-only answers (`includeTime` false). Never shifted, never converted. */
export const dateOnlyAnswerCases: readonly DateAnswerCase[] = [
  dateOnly("2026-11-04 is accepted unchanged", "2026-11-04", ok("2026-11-04")),
  dateOnly("2026-02-29 is not a real date", "2026-02-29", invalidDate),
  dateOnly("2028-02-29 is a leap day", "2028-02-29", ok("2028-02-29")),
  dateOnly("2000-02-29 is a leap day (divisible by 400)", "2000-02-29", ok("2000-02-29")),
  dateOnly("1900-02-29 is not a leap day (century rule)", "1900-02-29", invalidDate),
  dateOnly("year 0000 is below the range", "0000-01-01", invalidDate),
  dateOnly("0001-01-01 is the first valid date", "0001-01-01", ok("0001-01-01")),
  dateOnly("0050-06-15 keeps its two-digit year", "0050-06-15", ok("0050-06-15")),
  dateOnly("9999-12-31 is the last valid date", "9999-12-31", ok("9999-12-31")),
  dateOnly("a five-digit year is refused", "10000-01-01", invalidDate),
  dateOnly("an expanded year is refused", "+002026-11-04", invalidDate),
  dateOnly("month 13", "2026-13-01", invalidDate),
  dateOnly("month 00", "2026-00-10", invalidDate),
  dateOnly("day 00", "2026-11-00", invalidDate),
  dateOnly("2026-11-31 does not exist", "2026-11-31", invalidDate),
  dateOnly("2026-04-31 does not exist", "2026-04-31", invalidDate),
  dateOnly("one-digit month and day", "2026-1-4", invalidDate),
  dateOnly("the basic format without dashes", "20261104", invalidDate),
  dateOnly("surrounding spaces are not trimmed", " 2026-11-04 ", invalidDate),
  dateOnly("a trailing line feed", "2026-11-04\n", invalidDate),
  dateOnly('"" is invalid_date, not unanswered', "", invalidDate),
  dateOnly("Thai digits are refused", "๒๕๖๙-๑๑-๐๔", invalidDate),
  dateOnly("a Buddhist Era year is a valid Gregorian year", "2569-11-04", ok("2569-11-04")),
  dateOnly("a UTC date-time while includeTime is false", "2026-11-04T10:30:00.000Z", invalidDate),
  dateOnly(
    "a date-time with offset while includeTime is false",
    "2026-11-04T17:30+07:00",
    invalidDate,
  ),
  dateOnly(
    "a date-time without offset while includeTime is false",
    "2026-11-04T17:30:00",
    invalidDate,
  ),
]

/** AC22: date-time answers (`includeTime` true), normalised to the UTC instant `…sssZ`. */
export const dateTimeAnswerCases: readonly DateAnswerCase[] = [
  dateTime("+07:00 converts to UTC", "2026-11-04T17:30+07:00", ok("2026-11-04T10:30:00.000Z")),
  dateTime(
    "+07:00 early morning lands on the previous UTC day",
    "2026-11-04T01:00:00+07:00",
    ok("2026-11-03T18:00:00.000Z"),
  ),
  dateTime(
    "an already normalised instant is unchanged",
    "2026-11-04T10:30:00.000Z",
    ok("2026-11-04T10:30:00.000Z"),
  ),
  dateTime("Z without seconds", "2026-11-04T10:30Z", ok("2026-11-04T10:30:00.000Z")),
  dateTime("Z with seconds", "2026-11-04T10:30:15Z", ok("2026-11-04T10:30:15.000Z")),
  dateTime("+00:00 equals Z", "2026-11-04T10:30+00:00", ok("2026-11-04T10:30:00.000Z")),
  dateTime("-05:00 converts to UTC", "2026-11-04T05:30-05:00", ok("2026-11-04T10:30:00.000Z")),
  dateTime(
    "+14:00 (Kiritimati) converts to UTC",
    "2026-11-05T00:30+14:00",
    ok("2026-11-04T10:30:00.000Z"),
  ),
  dateTime(
    "-11:00 (Pago Pago) converts to UTC",
    "2026-11-03T23:30-11:00",
    ok("2026-11-04T10:30:00.000Z"),
  ),
  dateTime("+05:45 (a 45-minute offset)", "2026-11-04T16:15+05:45", ok("2026-11-04T10:30:00.000Z")),
  dateTime(
    "an offset that crosses the year",
    "2026-01-01T00:30+01:00",
    ok("2025-12-31T23:30:00.000Z"),
  ),
  dateTime(
    "an offset that lands on a leap day",
    "2028-03-01T00:30+01:00",
    ok("2028-02-29T23:30:00.000Z"),
  ),
  dateTime(
    "2028-02-29 with time is a real date",
    "2028-02-29T10:00Z",
    ok("2028-02-29T10:00:00.000Z"),
  ),
  dateTime(
    "9 fraction digits are truncated, not rounded",
    "2026-11-04T10:30:00.123456789Z",
    ok("2026-11-04T10:30:00.123Z"),
  ),
  dateTime(
    ".9999 is truncated to .999",
    "2026-11-04T10:30:00.9999Z",
    ok("2026-11-04T10:30:00.999Z"),
  ),
  dateTime("one fraction digit", "2026-11-04T10:30:00.1Z", ok("2026-11-04T10:30:00.100Z")),
  dateTime("two fraction digits", "2026-11-04T10:30:00.12Z", ok("2026-11-04T10:30:00.120Z")),
  dateTime(
    "a fraction with an offset",
    "2026-11-04T17:30:00.5+07:00",
    ok("2026-11-04T10:30:00.500Z"),
  ),
  dateTime(
    "truncation never rolls over into the next second",
    "2026-11-04T17:30:59.999999999+07:00",
    ok("2026-11-04T10:30:59.999Z"),
  ),
  dateTime(
    "truncation never rolls over into the next year",
    "2026-12-31T23:59:59.9999999Z",
    ok("2026-12-31T23:59:59.999Z"),
  ),
  dateTime("10 fraction digits are refused", "2026-11-04T10:30:00.1234567890Z", invalidDate),
  dateTime("a point without fraction digits", "2026-11-04T10:30:00.Z", invalidDate),
  dateTime("a fraction without seconds", "2026-11-04T10:30.5Z", invalidDate),
  dateTime("no offset gives offset_required", "2026-11-04T17:30:00", offsetRequired),
  dateTime("no offset and no seconds gives offset_required", "2026-11-04T17:30", offsetRequired),
  dateTime(
    "no offset with a fraction gives offset_required",
    "2026-11-04T17:30:00.123",
    offsetRequired,
  ),
  dateTime("a date-only value while includeTime is true", "2026-11-04", invalidDate),
  dateTime('"" is invalid_date, not unanswered', "", invalidDate),
  dateTime("T24:00 is refused", "2026-11-04T24:00Z", invalidDate),
  dateTime("T24:00:00 with an offset is refused", "2026-11-04T24:00:00+07:00", invalidDate),
  dateTime("second 60 is refused", "2026-11-04T23:59:60Z", invalidDate),
  dateTime("minute 60 is refused", "2026-11-04T23:60Z", invalidDate),
  dateTime("hours only is refused", "2026-11-04T17Z", invalidDate),
  dateTime("a space instead of T is refused", "2026-11-04 10:30Z", invalidDate),
  dateTime("an offset without a colon is refused", "2026-11-04T17:30+0700", invalidDate),
  dateTime("offset hour 24 is refused", "2026-11-04T10:00+24:00", invalidDate),
  dateTime("offset minute 60 is refused", "2026-11-04T10:00+05:60", invalidDate),
  dateTime("2026-02-29 with time is not a real date", "2026-02-29T10:00Z", invalidDate),
  dateTime("2026-11-31 with time does not exist", "2026-11-31T10:00Z", invalidDate),
  dateTime("the first instant of year 0001", "0001-01-01T00:00Z", ok("0001-01-01T00:00:00.000Z")),
  dateTime(
    "year 0001 after the offset is applied",
    "0001-01-01T01:30+01:00",
    ok("0001-01-01T00:30:00.000Z"),
  ),
  dateTime(
    "a two-digit year stays in year 0050",
    "0050-06-15T12:00Z",
    ok("0050-06-15T12:00:00.000Z"),
  ),
  dateTime(
    "the last millisecond of year 9999",
    "9999-12-31T23:59:59.999Z",
    ok("9999-12-31T23:59:59.999Z"),
  ),
  dateTime(
    "year 9999 after the offset is applied",
    "9999-12-31T23:30+01:00",
    ok("9999-12-31T22:30:00.000Z"),
  ),
  dateTime("UTC year 0000 is out of range", "0001-01-01T00:30+01:00", invalidDate),
  dateTime("UTC year 10000 is out of range", "9999-12-31T23:30-01:00", invalidDate),
]

/** Every answer row of AC21 and AC22. */
export const dateAnswerCases: readonly DateAnswerCase[] = [
  ...dateOnlyAnswerCases,
  ...dateTimeAnswerCases,
]

const dateOnlyCell = (answer: string, timeZone?: string): DateCellCase => ({
  name: `date-only ${answer} in ${timeZone ?? "no zone"} is unchanged`,
  criterion: "AC21",
  includeTime: false,
  answer,
  ...(timeZone === undefined ? {} : { timeZone }),
  cell: answer,
})

const dateTimeCell = (
  name: string,
  answer: string,
  timeZone: string | undefined,
  cell: string,
): DateCellCase => ({
  name,
  criterion: "AC23",
  includeTime: true,
  answer,
  ...(timeZone === undefined ? {} : { timeZone }),
  cell,
})

/** AC21 and AC23: cells. Date-only never shifts; date-time is `…Z` or the zone's `±HH:MM`. */
export const dateCellCases: readonly DateCellCase[] = [
  dateOnlyCell("2026-11-04"),
  dateOnlyCell("2026-11-04", "Pacific/Kiritimati"),
  dateOnlyCell("2026-11-04", "Pacific/Pago_Pago"),
  dateOnlyCell("2026-11-04", "Asia/Bangkok"),
  dateOnlyCell("2026-11-04", "America/New_York"),
  dateOnlyCell("2026-11-04", "UTC"),
  dateOnlyCell("2028-02-29", "Pacific/Kiritimati"),
  dateOnlyCell("0001-01-01", "Pacific/Kiritimati"),
  dateOnlyCell("9999-12-31", "Pacific/Pago_Pago"),
  dateTimeCell(
    "no zone gives …Z",
    "2026-11-04T10:30:00.000Z",
    undefined,
    "2026-11-04T10:30:00.000Z",
  ),
  dateTimeCell(
    "no zone keeps a year below 1000 four-digit",
    "0050-06-15T12:00:00.000Z",
    undefined,
    "0050-06-15T12:00:00.000Z",
  ),
  dateTimeCell(
    "Asia/Bangkok gives +07:00",
    "2026-11-04T10:30:00.000Z",
    "Asia/Bangkok",
    "2026-11-04T17:30:00.000+07:00",
  ),
  dateTimeCell(
    "Asia/Bangkok keeps the milliseconds",
    "2026-11-04T10:30:00.123Z",
    "Asia/Bangkok",
    "2026-11-04T17:30:00.123+07:00",
  ),
  dateTimeCell(
    "Asia/Bangkok across the new year",
    "2026-12-31T20:00:00.000Z",
    "Asia/Bangkok",
    "2027-01-01T03:00:00.000+07:00",
  ),
  dateTimeCell(
    "UTC as a zone gives +00:00, not Z",
    "2026-11-04T10:30:00.000Z",
    "UTC",
    "2026-11-04T10:30:00.000+00:00",
  ),
  dateTimeCell(
    "UTC as a zone keeps a year below 1000 four-digit",
    "0050-06-15T12:00:00.000Z",
    "UTC",
    "0050-06-15T12:00:00.000+00:00",
  ),
  dateTimeCell(
    "Pacific/Kiritimati gives +14:00 and the next day",
    "2026-11-04T10:30:00.000Z",
    "Pacific/Kiritimati",
    "2026-11-05T00:30:00.000+14:00",
  ),
  dateTimeCell(
    "Pacific/Pago_Pago gives -11:00 and the previous day",
    "2026-11-04T10:30:00.000Z",
    "Pacific/Pago_Pago",
    "2026-11-03T23:30:00.000-11:00",
  ),
  dateTimeCell(
    "Asia/Kathmandu gives +05:45",
    "2026-11-04T10:30:00.000Z",
    "Asia/Kathmandu",
    "2026-11-04T16:15:00.000+05:45",
  ),
  dateTimeCell(
    "America/St_Johns gives -03:30 after daylight saving ends",
    "2026-11-04T10:30:00.000Z",
    "America/St_Johns",
    "2026-11-04T07:00:00.000-03:30",
  ),
  dateTimeCell(
    "Etc/GMT-7 (an IANA name) gives +07:00",
    "2026-11-04T10:30:00.000Z",
    "Etc/GMT-7",
    "2026-11-04T17:30:00.000+07:00",
  ),
  dateTimeCell(
    "America/New_York in January gives -05:00",
    "2026-01-15T12:00:00.000Z",
    "America/New_York",
    "2026-01-15T07:00:00.000-05:00",
  ),
  dateTimeCell(
    "America/New_York in July gives -04:00",
    "2026-07-15T12:00:00.000Z",
    "America/New_York",
    "2026-07-15T08:00:00.000-04:00",
  ),
  dateTimeCell(
    "America/New_York the last millisecond before daylight saving",
    "2026-03-08T06:59:59.999Z",
    "America/New_York",
    "2026-03-08T01:59:59.999-05:00",
  ),
  dateTimeCell(
    "America/New_York the first instant of daylight saving",
    "2026-03-08T07:00:00.000Z",
    "America/New_York",
    "2026-03-08T03:00:00.000-04:00",
  ),
]

/** AC23: local-mean-time instants whose offset has seconds (checked by property, see above). */
export const secondsOffsetCases: readonly SecondsOffsetCase[] = [
  // Bangkok Mean Time +06:42:04 (rounds down to +06:42).
  { name: "Asia/Bangkok in 1900", answer: "1900-01-01T00:00:00.000Z", timeZone: "Asia/Bangkok" },
  // Tokyo LMT +09:18:59 (rounds up to +09:19: rounding, not truncation).
  { name: "Asia/Tokyo in 1880", answer: "1880-01-01T00:00:00.000Z", timeZone: "Asia/Tokyo" },
  // New York LMT -04:56:02 (a negative offset, rounds to -04:56).
  {
    name: "America/New_York in 1870",
    answer: "1870-01-01T00:00:00.000Z",
    timeZone: "America/New_York",
  },
  // Chicago LMT -05:50:36 (a negative offset that rounds away from zero, to -05:51).
  {
    name: "America/Chicago in 1870",
    answer: "1870-01-01T00:00:00.000Z",
    timeZone: "America/Chicago",
  },
  // Dublin Mean Time -00:25:21 (a negative offset under one hour: the sign must stay).
  { name: "Europe/Dublin in 1900", answer: "1900-01-01T00:00:00.000Z", timeZone: "Europe/Dublin" },
]
