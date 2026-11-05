import * as z from "zod"
import { customIssue, type Failure, failure, toIssues } from "./issues"

// Export options for `toCell` (spec R1, R16; plan "Dates and UTC"). In MVP they hold only an
// optional IANA `timeZone`. The schema is internal and never exported, so the only way to get a
// `CellOptions` without a cast is `parseCellOptions`: `toCell` can only receive options the
// package validated, and so never fails on a zone.

// An offset-style zone (`+07:00`, `+0700`, `+07`, `-05:00`, also with U+2212 MINUS SIGN). Engines
// accept these as time zones, but they are not IANA names; every IANA name starts with a letter.
const OFFSET_STYLE = /^[+\-−]/

/**
 * True when `timeZone` is a time-zone name the engine knows and not an offset-style zone. Builds an
 * `Intl.DateTimeFormat` with an explicit locale and the zone: a `RangeError` means unknown. Reads
 * neither the process zone nor the default locale.
 */
function isIanaTimeZone(timeZone: string): boolean {
  if (timeZone === "" || OFFSET_STYLE.test(timeZone)) return false
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone
    return !OFFSET_STYLE.test(resolved)
  } catch (error) {
    if (error instanceof RangeError) return false
    throw error
  }
}

const timeZoneSchema = z.string().superRefine((timeZone, ctx) => {
  if (isIanaTimeZone(timeZone)) return
  ctx.addIssue({
    code: "custom",
    input: timeZone,
    ...customIssue("invalid_time_zone", { timeZone }),
  })
})

/** The cell-options schema (internal). Strict: an unknown option is refused, never ignored. */
export const cellOptionsSchema = z
  .strictObject({ timeZone: timeZoneSchema.optional() })
  .brand<"SongNoiCellOptions">()

/**
 * Options for `toCell`, validated by the package (branded, so a plain object literal is not a
 * `CellOptions`). `timeZone` is an IANA time zone; without it date-time cells are in UTC.
 */
export type CellOptions = z.output<typeof cellOptionsSchema>

/**
 * Validates export options once, before any cell is written (R16). On success `options` equals the
 * input (`{}` stays `{}`; the zone is kept as given). Failures, in the schema context: a zone that
 * is not an IANA name (unknown, `""` or offset-style) → `invalid_time_zone {timeZone}` at
 * `["timeZone"]`; a non-string zone → `invalid` at `["timeZone"]`; an unknown option →
 * `unknown_property {key}` at `[key]`; a non-object → `invalid` at `[]`. Never throws for JSON input.
 */
export function parseCellOptions(input: {
  timeZone?: string
}): { readonly ok: true; readonly options: CellOptions } | Failure {
  const result = cellOptionsSchema.safeParse(input, { reportInput: true })
  if (!result.success) return failure(toIssues(result.error.issues, "schema"))
  return { ok: true, options: result.data }
}
