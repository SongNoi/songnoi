import * as z from "zod"
import { customIssue, defineField } from "../api"
import { formatInstant, isDateOnly, readDateTime } from "./shared/calendar"

/**
 * `date`: a calendar date, or a date-time with `includeTime` (spec R15, R16). A date-only answer
 * is a real `YYYY-MM-DD` (years 0001–9999), returned unchanged. A date-time needs `Z` or `±HH:MM`
 * (`offset_required`) and is normalised to the UTC instant `…sssZ`. Every other refused string is
 * `invalid_date` (`""` included; nothing is trimmed); a non-string is `invalid`. Cells: date-only
 * unchanged for any zone; date-time in UTC (`…Z`) or in the validated zone with its offset.
 */
export const dateField = defineField({
  type: "date",
  config: z.strictObject({ includeTime: z.boolean().default(false) }),
  answer: (config) =>
    z.string().transform((text, ctx) => {
      if (!config.includeTime) {
        if (isDateOnly(text)) return text
        ctx.addIssue({ code: "custom", input: text, ...customIssue("invalid_date", {}) })
        return z.NEVER
      }
      const result = readDateTime(text)
      if (result.ok) return new Date(result.epochMs).toISOString()
      ctx.addIssue({ code: "custom", input: text, ...customIssue(result.code, {}) })
      return z.NEVER
    }),
  toCell: (answer, config, options) => {
    if (!config.includeTime) return answer
    const result = readDateTime(answer)
    // A normalised date-time always reads back; anything else is written as given.
    return result.ok ? formatInstant(result.epochMs, options?.timeZone) : answer
  },
  storedValues: (answer) => [answer],
  analytics: {
    storeAs: {
      kinds: ["date", "datetime"],
      pick: (config) => (config.includeTime ? "datetime" : "date"),
    },
    summarize: "timeline",
    groupable: false,
  },
})
