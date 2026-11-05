import * as z from "zod"

// Export options for `toCell` (spec R1, R16; plan "Dates and UTC"). In MVP they hold only an
// optional IANA `timeZone`. The schema is internal and never exported, so the only way to get a
// `CellOptions` without a cast is the package's own parse: `toCell` can only receive options the
// package validated. The time-zone refinement and `parseCellOptions` are added in T025.

/** The cell-options schema (internal). Strict: an unknown option is refused, never ignored. */
export const cellOptionsSchema = z
  .strictObject({ timeZone: z.string().optional() })
  .brand<"SongNoiCellOptions">()

/**
 * Options for `toCell`, validated by the package (branded, so a plain object literal is not a
 * `CellOptions`). `timeZone` is an IANA time zone; without it date-time cells are in UTC.
 */
export type CellOptions = z.output<typeof cellOptionsSchema>
