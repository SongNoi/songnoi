// Calendar logic of the `date` field (spec R15, R16; plan "Dates and UTC"; ADR 0012 decision 4).
// UTC-only: `setUTCFullYear` / `setUTCHours` / `toISOString` and `Intl.DateTimeFormat` with an
// explicit locale and zone. No local getters, no `Date.parse`, no `new Date(string)`, so neither
// the process time zone nor the default locale can change a result. Not a field type; imports
// nothing (only the public API and `zod` would be allowed).

/** Why a string is not an accepted date or date-time. */
export type CalendarError = "invalid_date" | "offset_required"

/** The result of reading a date-time: the UTC instant in epoch milliseconds, or the error code. */
export type DateTimeResult =
  | { readonly ok: true; readonly epochMs: number }
  | { readonly ok: false; readonly code: CalendarError }

// `\d` without the `u` flag is ASCII 0-9 only, and `$` without `m` never matches before a line feed.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))?$/

const MIN_YEAR = 1
const MAX_YEAR = 9999

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/** A real Gregorian (proleptic) calendar date; the year range is checked by the caller. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const days = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0)
  return day <= days
}

/** Epoch milliseconds of UTC calendar fields; years 0–99 stay years 0–99 (unlike `Date.UTC`). */
function utcEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
): number {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, ms)
  return date.getTime()
}

/** True for a real calendar date `YYYY-MM-DD` with a year from 0001 to 9999 (R15). */
export function isDateOnly(text: string): boolean {
  const match = DATE_ONLY.exec(text)
  if (match === null) return false
  const year = Number(match[1])
  return (
    year >= MIN_YEAR && year <= MAX_YEAR && isRealDate(year, Number(match[2]), Number(match[3]))
  )
}

/**
 * Reads an ISO 8601 date-time with hours and minutes, optional seconds and a fraction of 1–9
 * digits, and a `Z` or `±HH:MM` offset (R15). A string of that shape without an offset gives
 * `offset_required`; anything else that is refused gives `invalid_date`: no match, hour above 23,
 * minute or second above 59, offset hour above 23 or minute above 59, an impossible date, or a UTC
 * instant outside years 0001–9999. The fraction is truncated to milliseconds, never rounded.
 */
export function readDateTime(text: string): DateTimeResult {
  const match = DATE_TIME.exec(text)
  if (match === null) return { ok: false, code: "invalid_date" }
  const [, y, mo, d, h, mi, s, fraction, zone, sign, oh, om] = match
  if (zone === undefined) return { ok: false, code: "offset_required" }

  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  const hour = Number(h)
  const minute = Number(mi)
  const second = s === undefined ? 0 : Number(s)
  const millis = fraction === undefined ? 0 : Number(`${fraction}00`.slice(0, 3))
  const offsetHours = oh === undefined ? 0 : Number(oh)
  const offsetMinutes = om === undefined ? 0 : Number(om)

  if (!isRealDate(year, month, day)) return { ok: false, code: "invalid_date" }
  if (hour > 23 || minute > 59 || second > 59) return { ok: false, code: "invalid_date" }
  if (offsetHours > 23 || offsetMinutes > 59) return { ok: false, code: "invalid_date" }

  const offset = (sign === "-" ? -1 : 1) * (offsetHours * 60 + offsetMinutes)
  const epochMs = utcEpochMs(year, month, day, hour, minute, second, millis) - offset * 60_000
  const utcYear = new Date(epochMs).getUTCFullYear()
  if (utcYear < MIN_YEAR || utcYear > MAX_YEAR) return { ok: false, code: "invalid_date" }
  return { ok: true, epochMs }
}

// --- zoned cells ---------------------------------------------------------------------------------

// One formatter per zone; zones reach here only through `parseCellOptions`, so they are valid.
// IANA zone names match case-insensitively and `parseCellOptions` keeps the zone as given, so the
// cache is keyed on the lower-cased name: every case variant of a zone shares one formatter (built
// from the first spelling seen) instead of each keeping its own for the life of the process (T045).
const offsetFormatters = new Map<string, Intl.DateTimeFormat>()

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  const key = timeZone.toLowerCase()
  let formatter = offsetFormatters.get(key)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    offsetFormatters.set(key, formatter)
  }
  return formatter
}

// `GMT`, `GMT+07:00`, `GMT-04:56:02` (local mean time); U+2212 accepted as a minus, to be safe.
const LONG_OFFSET = /^GMT(?:([+\-−])(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

/** The zone's offset at `epochMs` in seconds, as the engine's time-zone data says. */
function offsetSeconds(timeZone: string, epochMs: number): number {
  const name = offsetFormatter(timeZone)
    .formatToParts(epochMs)
    .find((part) => part.type === "timeZoneName")?.value
  const match = LONG_OFFSET.exec(name ?? "")
  // Unreachable on engines with `longOffset` (ES2021+), which the package requires (R20).
  if (match === null) throw new Error(`Unsupported time-zone offset format: ${String(name)}`)
  if (match[1] === undefined) return 0
  const seconds = Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0)
  return match[1] === "+" ? seconds : -seconds
}

function formatOffset(minutes: number): string {
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, "0")
  const mm = String(abs % 60).padStart(2, "0")
  return `${minutes < 0 ? "-" : "+"}${hh}:${mm}`
}

/**
 * The instant as ISO 8601 with milliseconds (R16): `…sssZ` without a zone; otherwise the wall time
 * in `timeZone` with that instant's offset as `±HH:MM` (`+00:00` for a zero offset). An offset
 * with seconds is rounded to the nearest minute (half away from zero) and the wall time is
 * shifted to match, so the string names the exact instant.
 */
export function formatInstant(epochMs: number, timeZone?: string): string {
  if (timeZone === undefined) return new Date(epochMs).toISOString()
  const raw = offsetSeconds(timeZone, epochMs)
  const minutes = Math.sign(raw) * Math.round(Math.abs(raw) / 60) || 0
  // `toISOString` of the shifted instant is the wall time followed by `Z`; drop the `Z`.
  const wall = new Date(epochMs + minutes * 60_000).toISOString().slice(0, -1)
  return `${wall}${formatOffset(minutes)}`
}
